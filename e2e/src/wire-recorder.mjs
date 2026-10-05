import { appendFileSync } from "node:fs";
import https from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

const logPath = process.env.VERBATRA_E2E_WIRE_LOG;
const GOOGLE_HOST = "translation.googleapis.com";
const DEEPL_HOST = /(^|\.)deepl\.com$/;
const DECODERS = { gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync };

function record(entry) {
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

function attempt(action) {
  try {
    action();
  } catch {
    record({ provider: "unknown", kind: "unrecorded" });
  }
}

function hostOf(input) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(href).hostname;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  attempt(() => {
    if (hostOf(input) === GOOGLE_HOST && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      record({ provider: "google-translate", kind: "request", texts: body.q, format: body.format });
    }
  });
  return originalFetch(input, init);
};

function billedFrom(response, body) {
  const decode = DECODERS[String(response.headers["content-encoding"] ?? "").toLowerCase()];
  const text = (decode ? decode(body) : body).toString("utf8");
  const billed = (JSON.parse(text).translations ?? []).map((item) => item.billed_characters);
  return billed.every((value) => typeof value === "number") ? billed : null;
}

function recordResponse(response) {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => {
    let billedCharacters = null;
    try {
      billedCharacters = billedFrom(response, Buffer.concat(chunks));
    } catch {
      billedCharacters = null;
    }
    record({ provider: "deepl", kind: "response", status: response.statusCode, billedCharacters });
  });
}

function recordRequestBody(request) {
  const chunks = [];
  const collect = (chunk) => {
    if (chunk !== undefined && chunk !== null && typeof chunk !== "function") {
      chunks.push(Buffer.from(chunk));
    }
  };
  const write = request.write;
  request.write = function (chunk, ...rest) {
    attempt(() => collect(chunk));
    return write.call(this, chunk, ...rest);
  };
  const end = request.end;
  request.end = function (chunk, ...rest) {
    attempt(() => {
      collect(chunk);
      record({ provider: "deepl", kind: "request", body: Buffer.concat(chunks).toString("utf8") });
    });
    return end.call(this, chunk, ...rest);
  };
}

const originalRequest = https.request;
https.request = function (...args) {
  const request = originalRequest.apply(this, args);
  const isDeepLTranslate =
    DEEPL_HOST.test(String(request.host ?? "")) &&
    String(request.path ?? "").startsWith("/v2/translate");
  if (isDeepLTranslate) {
    recordRequestBody(request);
    request.on("response", recordResponse);
  }
  return request;
};
