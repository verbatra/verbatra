import type { ReportedEvent } from "@/lib/analytics-events";

const RELAY_ENDPOINT = "/api/e";

function post(body: string): void {
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(RELAY_ENDPOINT, blob)) {
      return;
    }
    fetch(RELAY_ENDPOINT, {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    return;
  }
}

export function report(...[name, properties]: ReportedEvent): void {
  post(
    JSON.stringify({
      e: name,
      ...(properties === undefined ? {} : { p: properties }),
      u: window.location.pathname,
    }),
  );
}

export function reportPageview(path: string): void {
  post(JSON.stringify({ e: "pageview", u: path }));
}
