import { NextResponse } from "next/server";
import type { ContactFieldErrors } from "./schema";

export function successResponse(): Response {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

export function validationErrorResponse(errors: ContactFieldErrors): Response {
  return NextResponse.json({ status: "invalid", errors }, { status: 400 });
}

export function rateLimitedResponse(): Response {
  return NextResponse.json({ status: "rate_limited" }, { status: 429 });
}

export function forbiddenResponse(): Response {
  return NextResponse.json({ status: "forbidden" }, { status: 403 });
}

export function serverErrorResponse(): Response {
  return NextResponse.json({ status: "error" }, { status: 500 });
}

export function payloadTooLargeResponse(): Response {
  return NextResponse.json({ status: "too_large" }, { status: 413 });
}

export function unsupportedMediaTypeResponse(): Response {
  return NextResponse.json({ status: "unsupported_media_type" }, { status: 415 });
}
