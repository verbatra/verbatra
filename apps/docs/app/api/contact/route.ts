import { emitUmamiEvent, refererPage } from "@/lib/umami-event";
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

const CONTACT_PAGE = "/contact";

const RESULT_BY_STATUS: Readonly<Record<number, string>> = {
  200: "ok",
  400: "invalid",
  429: "rate_limited",
  500: "error",
};

interface Outcome {
  readonly response: Response;
  readonly tracked: boolean;
}

const untracked = (response: Response): Outcome => ({ response, tracked: false });

async function handle(request: Request): Promise<Outcome> {
  const rejected = rejectUnacceptableRequest(request);
  if (rejected) return untracked(rejected);

  const blocked = await checkArcjet(request);
  if (blocked) return { response: blocked, tracked: true };

  const text = await readBodyWithinLimit(request);
  if (text === undefined) return untracked(payloadTooLargeResponse());

  const parsed = parseContactBody(text);
  if (!parsed.success) return { response: validationErrorResponse(parsed.errors), tracked: true };

  if (isHoneypotFilled(parsed.data)) return untracked(successResponse());

  const sent = await sendContactEmail(parsed.data);
  return { response: sent.ok ? successResponse() : serverErrorResponse(), tracked: true };
}

export async function POST(request: Request): Promise<Response> {
  const { response, tracked } = await handle(request);
  const result = RESULT_BY_STATUS[response.status];
  if (tracked && result !== undefined) {
    emitUmamiEvent(request, {
      url: refererPage(request, CONTACT_PAGE),
      name: "contact_submit",
      data: { result },
    });
  }
  return response;
}
