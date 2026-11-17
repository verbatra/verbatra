import {
  COPY_SURFACES,
  CTA_IDS,
  type OUTBOUND_TARGETS,
  type ReportedEvent,
} from "@/lib/analytics-events";
import { report } from "@/lib/analytics-report";
import { LOCALES } from "@/lib/locales";

type ClickEvent = ReportedEvent;

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
  return id === undefined ? undefined : ["cta_click", { id }];
}

function outboundUrl(link: Element): URL | undefined {
  try {
    const url = new URL(link.getAttribute("href") ?? "", window.location.href);
    return url.origin === window.location.origin ? undefined : url;
  } catch {
    return undefined;
  }
}

function outboundEvent(target: Element): ClickEvent | undefined {
  const link = target.closest('a[target="_blank"]');
  const url = link === null ? undefined : outboundUrl(link);
  if (url === undefined) return undefined;
  const matched = HOST_TARGETS.find(([pattern]) => pattern.test(url.hostname));
  return ["outbound_click", { dest: matched?.[1] ?? "other" }];
}

function mcpInstallEvent(target: Element): ClickEvent | undefined {
  return target.closest("[data-mcp-install]") === null ? undefined : ["mcp_install_click"];
}

function localeEvent(target: Element): ClickEvent | undefined {
  const to = oneOf(
    LOCALES,
    target.closest("[data-locale-switch]")?.getAttribute("data-locale-switch"),
  );
  return to === undefined ? undefined : ["locale_switch", { to }];
}

export function eventForClick(target: Element): ClickEvent | undefined {
  return (
    copyEvent(target) ??
    ctaEvent(target) ??
    mcpInstallEvent(target) ??
    localeEvent(target) ??
    outboundEvent(target)
  );
}

export function reportClick(target: Element): void {
  const event = eventForClick(target);
  if (event === undefined) return;
  report(...event);
}
