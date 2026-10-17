import { checkArcjet } from "./arcjet";
import { sendContactEmail } from "./email";
import { isHoneypotFilled } from "./honeypot";
import { readBodyWithinLimit, rejectUnacceptableRequest } from "./request-guard";
import {
  payloadTooLargeResponse,
  serverErrorResponse,
  successResponse,
  validationErrorResponse,
} from "./respond";
import { parseContactBody } from "./schema";

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUnacceptableRequest(request);
  if (rejected) return rejected;

  const blocked = await checkArcjet(request);
  if (blocked) return blocked;

  const text = await readBodyWithinLimit(request);
  if (text === undefined) return payloadTooLargeResponse();

  const parsed = parseContactBody(text);
  if (!parsed.success) return validationErrorResponse(parsed.errors);

  if (isHoneypotFilled(parsed.data)) return successResponse();

  const sent = await sendContactEmail(parsed.data);
  if (!sent.ok) return serverErrorResponse();

  return successResponse();
}
