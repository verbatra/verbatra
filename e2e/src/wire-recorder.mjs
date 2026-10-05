import { appendFileSync } from "node:fs";
import https from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

const logPath = process.env.VERBATRA_E2E_WIRE_LOG;
const GOOGLE_HOST = "translation.googleapis.com";
const DEEPL_HOST = /(^|\.)deepl\.com$/;
const DECODERS = { gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync };
const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;

let nextExchange = 0;

function record(entry) {
  try {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch {
    return;
  }
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
  const status = response.statusCode ?? 0;
  if (status < SUCCESS_MIN || status > SUCCESS_MAX) {
    return null;
  }
  const decode = DECODERS[String(response.headers["content-encoding"] ?? "").toLowerCase()];
  const text = (decode ? decode(body) : body).toString("utf8");
  const translations = JSON.parse(text).translations;
  if (!Array.isArray(translations) || translations.length === 0) {
    return null;
  }
  const billed = translations.map((item) => item.billed_characters);
  return billed.every((value) => typeof value === "number") ? billed : null;
}

function recordResponse(exchange) {
  return (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => {
      let billedCharacters = null;
      try {
        billedCharacters = billedFrom(response, Buffer.concat(chunks));
      } catch {
        billedCharacters = null;
      }
      record({
        provider: "deepl",
        kind: "response",
        exchange,
        status: response.statusCode,
        billedCharacters,
      });
    });
  };
}

function recordRequestBody(request, exchange) {
  const chunks = [];
  const collect = (chunk, encoding) => {
    if (chunk === undefined || chunk === null || typeof chunk === "function") {
      return;
    }
    chunks.push(
      typeof chunk === "string"
        ? Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8")
        : Buffer.from(chunk),
    );
  };
  const write = request.write;
  request.write = function (chunk, encoding, ...rest) {
    attempt(() => collect(chunk, encoding));
    return write.call(this, chunk, encoding, ...rest);
  };
  const end = request.end;
  request.end = function (chunk, encoding, ...rest) {
    attempt(() => {
      collect(chunk, encoding);
      record({
        provider: "deepl",
        kind: "request",
        exchange,
        body: Buffer.concat(chunks).toString("utf8"),
      });
    });
    return end.call(this, chunk, encoding, ...rest);
  };
}

const originalRequest = https.request;
https.request = function (...args) {
  const request = originalRequest.apply(this, args);
  const isDeepLTranslate =
    DEEPL_HOST.test(String(request.host ?? "")) &&
    String(request.path ?? "").startsWith("/v2/translate");
  if (isDeepLTranslate) {
    nextExchange += 1;
    recordRequestBody(request, nextExchange);
    request.on("response", recordResponse(nextExchange));
  }
  return request;
};
