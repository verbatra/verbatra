export const MAX_HONOURED_RETRY_DELAY_MS = 5_000;
export const QUOTA_EXHAUSTED_WAIT_MS = 300_000;

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const PROTO_DURATION = /^(\d+(?:\.\d+)?)s$/;
const MESSAGE_DURATION = /retry in (?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/i;

function fieldOf(value: unknown, field: string): unknown {
  return typeof value === "object" && value !== null && field in value
    ? (value as Readonly<Record<string, unknown>>)[field]
    : undefined;
}

function fieldOfAnyCase(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const key = Object.keys(value).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : (value as Readonly<Record<string, unknown>>)[key];
}

function toPositiveMs(milliseconds: number): number | undefined {
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.ceil(milliseconds) : undefined;
}

function protoDurationMs(value: unknown): number | undefined {
  const match = typeof value === "string" ? PROTO_DURATION.exec(value) : null;
  return match?.[1] === undefined ? undefined : toPositiveMs(Number(match[1]) * MS_PER_SECOND);
}

function messageDurationMs(message: unknown): number | undefined {
  const match = typeof message === "string" ? MESSAGE_DURATION.exec(message) : null;
  if (match === null) {
    return undefined;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3]);
  return toPositiveMs(
    ((hours * MINUTES_PER_HOUR + minutes) * SECONDS_PER_MINUTE + seconds) * MS_PER_SECOND,
  );
}

export function googleErrorBodyOf(error: unknown): unknown {
  const message = fieldOf(error, "message");
  if (typeof message !== "string" || !message.startsWith("{")) {
    return undefined;
  }
  try {
    return fieldOf(JSON.parse(message), "error");
  } catch {
    return undefined;
  }
}

export function googleErrorDetails(error: unknown): readonly unknown[] {
  const details = fieldOf(googleErrorBodyOf(error), "details");
  return Array.isArray(details) ? details : [];
}

function googleRetryDelayMs(error: unknown): number | undefined {
  const body = googleErrorBodyOf(error);
  const retryInfo = googleErrorDetails(error).find((detail) =>
    String(fieldOf(detail, "@type")).endsWith("google.rpc.RetryInfo"),
  );
  return (
    protoDurationMs(fieldOf(retryInfo, "retryDelay")) ?? messageDurationMs(fieldOf(body, "message"))
  );
}

function headerOf(error: unknown, name: string): string | undefined {
  const headers = fieldOf(error, "headers");
  const get = fieldOf(headers, "get");
  const value =
    typeof get === "function"
      ? (get as (header: string) => unknown).call(headers, name)
      : fieldOfAnyCase(headers, name);
  return typeof value === "string" ? value : undefined;
}

function numericHeaderMs(value: string | undefined, factor: number): number | undefined {
  return value === undefined || !DECIMAL.test(value.trim())
    ? undefined
    : toPositiveMs(Number(value) * factor);
}

function httpDateHeaderMs(value: string | undefined): number | undefined {
  if (value === undefined || DECIMAL.test(value.trim())) {
    return undefined;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? toPositiveMs(at - Date.now()) : undefined;
}

function retryAfterHeaderMs(error: unknown): number | undefined {
  const retryAfter = headerOf(error, "retry-after");
  return (
    numericHeaderMs(headerOf(error, "retry-after-ms"), 1) ??
    numericHeaderMs(retryAfter, MS_PER_SECOND) ??
    httpDateHeaderMs(retryAfter)
  );
}

export function statedRetryDelayMs(error: unknown): number | undefined {
  return googleRetryDelayMs(error) ?? retryAfterHeaderMs(error);
}

export function formatWait(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / MS_PER_SECOND);
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds} s`;
  }
  const totalMinutes = Math.ceil(seconds / SECONDS_PER_MINUTE);
  if (totalMinutes < MINUTES_PER_HOUR) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
