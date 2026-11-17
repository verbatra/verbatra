import {
  COPY_SURFACES,
  CTA_IDS,
  type EventName,
  type EventProperties,
  type OUTBOUND_TARGETS,
  trackEvent,
} from "@/lib/analytics-events";

export type ClickEvent = {
  [Name in EventName]: readonly [Name, EventProperties[Name]];
}[EventName];

const HOST_TARGETS: ReadonlyArray<readonly [RegExp, (typeof OUTBOUND_TARGETS)[number]]> = [
  [/(^|\.)github\.com$/, "github"],
  [/(^|\.)npmjs\.com$/, "npm"],
  [/(^|\.)modelcontextprotocol\.io$/, "mcp-registry"],
];

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function copyEvent(target: Element): ClickEvent | undefined {
  const button = target.closest("button");
  const surface = oneOf(
    COPY_SURFACES,
    button?.closest("[data-copy-surface]")?.getAttribute("data-copy-surface"),
  );
  return surface === undefined ? undefined : ["copy_code", { surface }];
}

function ctaEvent(target: Element): ClickEvent | undefined {
  const id = oneOf(CTA_IDS, target.closest("[data-cta]")?.getAttribute("data-cta"));
  return id === undefined
    ? undefined
    : ["cta_click", { id, locale: document.documentElement.lang }];
}

function outboundUrl(link: Element): URL | undefined {
  try {
    const url = new URL(link.getAttribute("href") ?? "", window.location.href);
    return url.origin === window.location.origin ? undefined : url;
  } catch {
    return undefined;
  }
}

function outboundOrigin(link: Element): EventProperties["outbound_click"]["from"] {
  if (link.closest("footer")) return "footer";
  if (link.closest("header")) return "header";
  const segments = window.location.pathname.split("/").filter(Boolean);
  const section = segments.find(
    (segment) =>
      segment === "docs" ||
      segment === "imprint" ||
      segment === "privacy" ||
      segment === "contact" ||
      segment === "licenses",
  );
  if (section === undefined) return "landing";
  return section === "docs" ? "docs" : "legal";
}

function outboundEvent(target: Element): ClickEvent | undefined {
  const link = target.closest('a[target="_blank"]');
  const url = link === null ? undefined : outboundUrl(link);
  if (link === null || url === undefined) return undefined;
  const matched = HOST_TARGETS.find(([pattern]) => pattern.test(url.hostname));
  return ["outbound_click", { target: matched?.[1] ?? "other", from: outboundOrigin(link) }];
}

export function eventForClick(target: Element): ClickEvent | undefined {
  return copyEvent(target) ?? ctaEvent(target) ?? outboundEvent(target);
}

export function reportClick(target: Element): void {
  const event = eventForClick(target);
  if (event === undefined) return;
  switch (event[0]) {
    case "copy_code":
      trackEvent(event[0], event[1]);
      break;
    case "cta_click":
      trackEvent(event[0], event[1]);
      break;
    case "outbound_click":
      trackEvent(event[0], event[1]);
      break;
  }
}
