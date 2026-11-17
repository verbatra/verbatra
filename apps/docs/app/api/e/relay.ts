import { loadBuiltScriptHashes } from "@/lib/csp-script-hashes";
import { parseRelayEvent } from "@/lib/relay-events";
import { MAX_RELAY_BODY_BYTES, servedPathOf } from "@/lib/relay-path";
import { createRelayRateLimit } from "@/lib/relay-rate-limit";
import { clientIp, isPageRoute } from "@/lib/server-pageview";
import { emitUmamiEvent, isCountableVisitor } from "@/lib/umami-event";
import { hasForeignOrigin, readBodyWithinLimit } from "../contact/request-guard";

const allowRelay = createRelayRateLimit();

function provesSameOrigin(request: Request): boolean {
  if (hasForeignOrigin(request)) return false;
  return (
    request.headers.get("sec-fetch-site")?.toLowerCase() === "same-origin" ||
    request.headers.get("origin") !== null
  );
}

export async function relayRequest(request: Request): Promise<void> {
  if (!provesSameOrigin(request)) return;
  const ip = clientIp(request.headers);
  if (ip === undefined || !isCountableVisitor(request)) return;
  if (!allowRelay(ip)) return;
  const text = await readBodyWithinLimit(request, MAX_RELAY_BODY_BYTES);
  if (text === undefined) return;
  const event = parseRelayEvent(text);
  if (event === undefined) return;
  if (!isPageRoute(servedPathOf(event.path), loadBuiltScriptHashes())) return;
  emitUmamiEvent(request, {
    url: event.path,
    ...(event.name === undefined ? {} : { name: event.name }),
    ...(event.data === undefined ? {} : { data: event.data }),
  });
}
