import "server-only";
import { after } from "next/server";
import { loadBuiltScriptHashes } from "@/lib/csp-script-hashes";
import { MAX_RELAY_PATH_LENGTH, servedPathOf } from "@/lib/relay-path";
import { requestHost } from "@/lib/request-host";
import type { ScriptHashesByRoute } from "@/lib/script-hashes-manifest.mjs";
import { isPageRoute, isTrackingRefused, visitorOf } from "@/lib/server-pageview";
import { SITE_HOST, SITE_URL } from "@/lib/site";
import { UMAMI_WEBSITE_ID } from "@/lib/umami-config.mjs";
import { sendToUmami, type UmamiEventData, type UmamiMessage } from "@/lib/umami-send";

export interface UmamiEventSpec {
  readonly url: string;
  readonly name?: string;
  readonly data?: UmamiEventData;
}

interface EmitOptions {
  readonly schedule?: (task: () => Promise<void>) => void;
  readonly send?: typeof sendToUmami;
}

export function isCountableVisitor(request: Request): boolean {
  const { headers } = request;
  return (
    requestHost(headers, new URL(request.url).host) === SITE_HOST &&
    !isTrackingRefused(headers) &&
    visitorOf(headers) !== undefined
  );
}

export function umamiEventFor(request: Request, spec: UmamiEventSpec): UmamiMessage | undefined {
  if (!isCountableVisitor(request)) return undefined;
  const visitor = visitorOf(request.headers);
  if (visitor === undefined) return undefined;
  return {
    type: "event",
    payload: {
      website: UMAMI_WEBSITE_ID,
      hostname: SITE_HOST,
      url: spec.url,
      ...visitor,
      ...(spec.name === undefined ? {} : { name: spec.name }),
      ...(spec.data === undefined ? {} : { data: spec.data }),
    },
  };
}

export function emitUmamiEvent(
  request: Request,
  spec: UmamiEventSpec,
  { schedule = after, send = sendToUmami }: EmitOptions = {},
): void {
  const message = umamiEventFor(request, spec);
  if (message === undefined) return;
  try {
    schedule(() => send(message));
  } catch {
    return;
  }
}

const SITE_ORIGIN = new URL(SITE_URL).origin;

export function refererPage(
  request: Request,
  fallback: string,
  routes: ScriptHashesByRoute = loadBuiltScriptHashes(),
): string {
  const referer = request.headers.get("referer");
  if (referer === null) return fallback;
  try {
    const { origin, pathname } = new URL(referer);
    const page =
      origin === SITE_ORIGIN &&
      pathname.length <= MAX_RELAY_PATH_LENGTH &&
      isPageRoute(servedPathOf(pathname), routes);
    return page ? pathname : fallback;
  } catch {
    return fallback;
  }
}
