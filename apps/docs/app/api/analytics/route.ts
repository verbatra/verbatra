import { hasForeignOrigin, mediaType, readBodyWithinLimit } from "@/app/api/contact/request-guard";
import {
  MAX_OPT_OUT_BODY_BYTES,
  optOutCookie,
  parseOptOutForm,
  privacyReturnPath,
} from "./opt-out";

const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";

function plainText(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (mediaType(request) !== FORM_MEDIA_TYPE) return plainText(415, "Unsupported media type");
  if (hasForeignOrigin(request)) return plainText(403, "Forbidden");
  const body = await readBodyWithinLimit(request, MAX_OPT_OUT_BODY_BYTES);
  if (body === undefined) return plainText(413, "Payload too large");
  const form = parseOptOutForm(body);
  if (form === undefined) return plainText(400, "Bad request");
  return new Response(null, {
    status: 303,
    headers: {
      location: privacyReturnPath(form),
      "set-cookie": optOutCookie(form.choice),
      "cache-control": "no-store",
    },
  });
}
