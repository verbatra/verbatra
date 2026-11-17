import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UMAMI_ORIGIN, UMAMI_WEBSITE_ID } from "../lib/umami-config.mjs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export const STUB_TRACKER = `(() => {
  const me = document.currentScript;
  const website = me.dataset.websiteId;
  const beforeSend = me.dataset.beforeSend;
  const send = (type, payload) => {
    const hook = beforeSend ? window[beforeSend] : undefined;
    const out = hook ? hook(type, payload) : payload;
    return fetch("${UMAMI_ORIGIN}/api/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, payload: out }),
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  };
  const base = () => ({
    website,
    screen: screen.width + "x" + screen.height,
    language: navigator.language,
    title: document.title,
    hostname: location.hostname,
    url: location.href,
    referrer: document.referrer,
  });
  const pageview = () => send("event", base());
  window.umami = {
    track: (name, data) => send("event", { ...base(), name, data }),
    getSession: () => ({ cache: "stub" }),
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(pageview, 0);
      return result;
    };
  }
  pageview();
})();`;

export const STUB_RECORDER = `(() => {
  const me = document.currentScript;
  fetch("${UMAMI_ORIGIN}/api/websites/" + me.dataset.websiteId + "/recorder")
    .then((response) => response.json())
    .then(() =>
      fetch("${UMAMI_ORIGIN}/api/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: location.href }),
        credentials: "omit",
      }),
    )
    .catch(() => undefined);
})();`;

const RECORDER_CONFIG = {
  enabled: true,
  replayEnabled: true,
  heatmapEnabled: true,
  sampleRate: 1,
  heatmapSampleRate: 1,
  maskLevel: "moderate",
  maxDuration: 300000,
  blockSelector: "",
};

function respond(route, status, contentType, body) {
  return route.fulfill({
    status,
    headers: { ...CORS, "content-type": contentType },
    body,
  });
}

function scriptSource(file, fallback) {
  const directory = process.env.UMAMI_LOCAL_SCRIPTS_DIR;
  return directory === undefined ? fallback : readFileSync(join(directory, file), "utf8");
}

function answer(route, pathname) {
  if (pathname === "/script.js") {
    return respond(route, 200, "text/javascript", scriptSource("script.js", STUB_TRACKER));
  }
  if (pathname === "/recorder.js") {
    return respond(route, 200, "text/javascript", scriptSource("recorder.js", STUB_RECORDER));
  }
  if (pathname === "/api/send") return respond(route, 200, "application/json", '{"cache":"stub"}');
  if (pathname === "/api/record") return respond(route, 200, "application/json", "{}");
  if (pathname === `/api/websites/${UMAMI_WEBSITE_ID}/recorder`) {
    return respond(route, 200, "application/json", JSON.stringify(RECORDER_CONFIG));
  }
  return respond(route, 404, "text/plain", "stub");
}

export async function stubUmami(context) {
  const requests = [];
  await context.route(`${UMAMI_ORIGIN}/**`, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }
    const { pathname } = new URL(request.url());
    requests.push({ method: request.method(), pathname, body: request.postData() ?? undefined });
    return answer(route, pathname);
  });
  return requests;
}
