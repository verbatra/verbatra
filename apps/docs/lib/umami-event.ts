import "server-only";
import { after } from "next/server";
import { requestHost } from "@/lib/request-host";
import { isTrackingRefused, visitorOf } from "@/lib/server-pageview";
import { SITE_HOST } from "@/lib/site";
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

export function umamiEventFor(request: Request, spec: UmamiEventSpec): UmamiMessage | undefined {
  const { headers } = request;
  if (requestHost(headers, new URL(request.url).host) !== SITE_HOST) return undefined;
  if (isTrackingRefused(headers)) return undefined;
  const visitor = visitorOf(headers);
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
