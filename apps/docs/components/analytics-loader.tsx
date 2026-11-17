"use client";

import { useEffect } from "react";
import { browserChoice, browserHasSignal, CHOICE_EVENT, reloadPage } from "@/lib/analytics-client";
import { sanitizeTrackerPayload, type TrackerPayload } from "@/lib/analytics-sanitize";
import { SITE_URL } from "@/lib/site-url";
import { UMAMI_RECORDER_URL, UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID } from "@/lib/umami-config.mjs";

export const TRACKER_ID = "verbatra-umami-tracker";
export const RECORDER_ID = "verbatra-umami-recorder";
export const BEFORE_SEND_NAME = "verbatraUmamiBeforeSend";

const SITE_HOSTNAME = new URL(SITE_URL).hostname;

function inject(id: string, src: string, attributes: Readonly<Record<string, string>>): void {
  if (document.getElementById(id) !== null) return;
  const element = document.createElement("script");
  element.id = id;
  element.src = src;
  element.defer = true;
  element.dataset.websiteId = UMAMI_WEBSITE_ID;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.head.append(element);
}

function injectScripts(): void {
  Reflect.set(window, BEFORE_SEND_NAME, (type: string, payload: TrackerPayload) =>
    sanitizeTrackerPayload(type, payload),
  );
  inject(TRACKER_ID, UMAMI_SCRIPT_URL, {
    "data-exclude-hash": "true",
    "data-before-send": BEFORE_SEND_NAME,
    "data-domains": SITE_HOSTNAME,
  });
  inject(RECORDER_ID, UMAMI_RECORDER_URL, {});
}

function allowed(): boolean {
  return browserChoice() === "full" && !browserHasSignal();
}

function reloadIfWithdrawn(): void {
  if (!allowed() && document.getElementById(TRACKER_ID) !== null) reloadPage();
}

function onChoice(): void {
  if (allowed()) injectScripts();
  else reloadIfWithdrawn();
}

function onPageShow(event: PageTransitionEvent): void {
  if (event.persisted) reloadIfWithdrawn();
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") reloadIfWithdrawn();
}

export function AnalyticsLoader(): null {
  useEffect(() => {
    if (allowed()) injectScripts();
    window.addEventListener(CHOICE_EVENT, onChoice);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener(CHOICE_EVENT, onChoice);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return null;
}
