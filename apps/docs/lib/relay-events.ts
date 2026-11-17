import { z } from "zod";
import { COPY_SURFACES, CTA_IDS, OUTBOUND_TARGETS } from "@/lib/analytics-events";
import { LOCALES } from "@/lib/locales";
import { MAX_RELAY_PATH_LENGTH } from "@/lib/relay-path";
import type { UmamiEventData } from "@/lib/umami-send";

export interface RelayEvent {
  readonly path: string;
  readonly name?: string;
  readonly data?: UmamiEventData;
}

const path = z
  .string()
  .max(MAX_RELAY_PATH_LENGTH)
  .regex(/^\/(?!\/)[^?#\s]*$/);

const bare = (name: string) => z.strictObject({ e: z.literal(name), u: path });

const withProperties = <Name extends string, Shape extends z.ZodRawShape>(
  name: Name,
  shape: Shape,
) => z.strictObject({ e: z.literal(name), p: z.strictObject(shape), u: path });

const relaySchema = z.discriminatedUnion("e", [
  bare("pageview"),
  withProperties("copy_code", { surface: z.enum(COPY_SURFACES) }),
  withProperties("cta_click", { id: z.enum(CTA_IDS) }),
  withProperties("outbound_click", { dest: z.enum(OUTBOUND_TARGETS) }),
  bare("search_open"),
  bare("mcp_install_click"),
  withProperties("locale_switch", { to: z.enum(LOCALES) }),
]);

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseRelayEvent(text: string): RelayEvent | undefined {
  const parsed = relaySchema.safeParse(jsonOf(text));
  if (!parsed.success) return undefined;
  const event = parsed.data;
  if (event.e === "pageview") return { path: event.u };
  if (!("p" in event)) return { path: event.u, name: event.e };
  return { path: event.u, name: event.e, data: event.p };
}
