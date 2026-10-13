import { SITE_URL } from "@/lib/site";
import {
  forbiddenResponse,
  payloadTooLargeResponse,
  unsupportedMediaTypeResponse,
} from "./respond";

export const MAX_CONTACT_BODY_BYTES = 16 * 1024;

const JSON_MEDIA_TYPE = "application/json";

export function mediaType(request: Request): string {
  return (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function declaresOversizedBody(request: Request): boolean {
  const declared = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(declared) && declared > MAX_CONTACT_BODY_BYTES;
}

const SITE_ORIGIN = new URL(SITE_URL).origin;

function normalizedOrigin(value: string): string | undefined {
  try {
    const { origin } = new URL(value);
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

function ownOrigin(request: Request): string | undefined {
  const host = request.headers.get("host");
  if (host === null) return undefined;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(request.url).protocol.replace(/:$/, "");
  return normalizedOrigin(`${proto}://${host}`);
}

function isCrossSiteFetch(request: Request): boolean {
  return request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site";
}

export function hasForeignOrigin(request: Request): boolean {
  if (isCrossSiteFetch(request)) return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  const claimed = normalizedOrigin(origin);
  return claimed === undefined || (claimed !== SITE_ORIGIN && claimed !== ownOrigin(request));
}

export function rejectUnacceptableRequest(request: Request): Response | undefined {
  if (mediaType(request) !== JSON_MEDIA_TYPE) return unsupportedMediaTypeResponse();
  if (declaresOversizedBody(request)) return payloadTooLargeResponse();
  if (hasForeignOrigin(request)) return forbiddenResponse();
  return undefined;
}

export async function readBodyWithinLimit(
  request: Request,
  limit: number = MAX_CONTACT_BODY_BYTES,
): Promise<string | undefined> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
