import { redact } from "@verbatra/sdk";
import type { Streams } from "./types.js";

function redactJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redact(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, member]) => [redact(key), redactMember(key, member)]),
    );
  }
  return value;
}

function redactMember(name: string, member: unknown): unknown {
  if (typeof member !== "string") {
    return redactJsonValue(member);
  }
  const prefix = `${name}: `;
  const paired = redact(`${prefix}${member}`);
  return paired.startsWith(prefix) ? paired.slice(prefix.length) : redact(member);
}

function parsedCompactJson(document: string): object | undefined {
  try {
    const parsed: unknown = JSON.parse(document);
    return parsed !== null && typeof parsed === "object" && JSON.stringify(parsed) === document
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function redactSerialized(document: string): string {
  const scrubbed = redact(document);
  return parsedCompactJson(scrubbed) === undefined ? document : scrubbed;
}

function redactOutput(text: string): string {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === "\n") {
    end -= 1;
  }
  const document = text.slice(0, end);
  const parsed = parsedCompactJson(document);
  if (parsed === undefined) {
    return redact(text);
  }
  return `${redactSerialized(JSON.stringify(redactJsonValue(parsed)))}${text.slice(end)}`;
}

export function redactingStreams(streams: Streams): Streams {
  return {
    out: (text) => streams.out(redactOutput(text)),
    err: (text) => streams.err(redactOutput(text)),
  };
}
