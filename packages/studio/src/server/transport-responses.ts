import type { ServerResponse } from "node:http";
import { applyNoStore } from "./security-headers.js";

export const UNAUTHORIZED_BODY = "Unauthorized";
export const FORBIDDEN_BODY = "Forbidden";
export const NOT_FOUND_BODY = "Not Found";
export const METHOD_NOT_ALLOWED_BODY = "Method Not Allowed";
export const PAYLOAD_TOO_LARGE_BODY = "Payload Too Large";
export const UNSUPPORTED_MEDIA_TYPE_BODY = "Unsupported Media Type";

export function sendConstantResponse(response: ServerResponse, status: number, body: string): void {
  applyNoStore(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(body);
}
