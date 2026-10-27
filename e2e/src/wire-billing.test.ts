import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billingTable,
  characterCount,
  deeplBilledCharacters,
  deeplTexts,
  parseWireLog,
  prepareWireRecorder,
  readWireLog,
  sendUnmaskedGoogleBatch,
  successfulDeepLExchanges,
  sumBilled,
  unmaskedDeepLBody,
  withoutMarkupTags,
} from "./wire-billing.js";

const FAKE_KEY = "e2e-wire-recorder-fake-key-0000";

const MASKED_DEEPL_BODY = new URLSearchParams([
  ["source_lang", "EN"],
  ["target_lang", "DE"],
  ["show_billed_characters", "1"],
  ["text", "Hello <x>{0}</x> &amp; you"],
  ["tag_handling", "xml"],
  ["ignore_tags", "x"],
]).toString();

const DEEPL_REPLY = JSON.stringify({
  translations: [{ text: "Hallo <x>{0}</x> &amp; du", billed_characters: 12 }],
});

const DEEPL_THROTTLED_REPLY = JSON.stringify({ message: "Too many requests" });

const MASKED_HEAD = MASKED_DEEPL_BODY.slice(0, 20);

function deeplClient(statusLine: string, reply: string): string {
  return `
import https from "node:https";
import { Duplex } from "node:stream";
const reply = ${JSON.stringify(reply)};
const head = "HTTP/1.1 ${statusLine}\\r\\ncontent-type: application/json\\r\\ncontent-length: " +
  Buffer.byteLength(reply) + "\\r\\nconnection: close\\r\\n\\r\\n";
class OfflineAgent extends https.Agent {
  createConnection() {
    let answered = false;
    return new Duplex({
      read() {},
      write(_chunk, _encoding, callback) {
        if (!answered) {
          answered = true;
          setImmediate(() => { this.push(head + reply); this.push(null); });
        }
        callback();
      },
    });
  }
}
const request = https.request({
  hostname: "api-free.deepl.com",
  path: "/v2/translate",
  method: "POST",
  agent: new OfflineAgent(),
  lookup: () => { throw new Error("DNS lookup attempted"); },
  headers: { authorization: "DeepL-Auth-Key ${FAKE_KEY}" },
});
request.on("response", (response) => {
  response.on("data", () => {});
  response.on("end", () => {
    process.stdout.write("answered " + response.statusCode);
    setImmediate(() => process.exit(0));
  });
});
request.write(${JSON.stringify(Buffer.from(MASKED_HEAD).toString("base64"))}, "base64");
request.end(${JSON.stringify(MASKED_DEEPL_BODY.slice(20))});
`;
}

const GOOGLE_CLIENT = `
await globalThis
  .fetch("https://translation.googleapis.com/language/translate/v2?key=${FAKE_KEY}", {
    method: "POST",
    body: JSON.stringify({ q: ["Hello <span translate=\\"no\\">{0}</span>"], format: "html" }),
    signal: AbortSignal.abort(),
  })
  .catch(() => {});
await globalThis
  .fetch("https://translation.googleapis.com/language/translate/v2?key=${FAKE_KEY}", {
    method: "POST",
    body: "not json",
    signal: AbortSignal.abort(),
  })
  .catch(() => {});
`;

async function runThroughRecorder(client: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-e2e-wire-"));
  const recorder = await prepareWireRecorder(dir);
  await execa("node", ["--input-type=module", "--eval", client], {
    env: { ...process.env, ...recorder.env },
  });
  return readWireLog(recorder.logPath);
}

const unrecordableLog = join(
  tmpdir(),
  "verbatra-e2e-wire-missing-dir",
  "nested",
  "wire-log.ndjson",
);

describe("wire recorder preload", () => {
  it("records the DeepL form body and the billed count from its reply, never the auth header", async () => {
    const log = await runThroughRecorder(deeplClient("200 OK", DEEPL_REPLY));
    expect(log).not.toContain(FAKE_KEY);
    expect(parseWireLog(log)).toEqual([
      { provider: "deepl", kind: "request", exchange: 1, body: MASKED_DEEPL_BODY },
      { provider: "deepl", kind: "response", exchange: 1, status: 200, billedCharacters: [12] },
    ]);
  });

  it("records no billed count for a DeepL error reply that carries no translations", async () => {
    const log = await runThroughRecorder(
      deeplClient("429 Too Many Requests", DEEPL_THROTTLED_REPLY),
    );
    expect(parseWireLog(log)).toEqual([
      { provider: "deepl", kind: "request", exchange: 1, body: MASKED_DEEPL_BODY },
      { provider: "deepl", kind: "response", exchange: 1, status: 429, billedCharacters: null },
    ]);
  });

  it("never breaks the request when the log cannot be written", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-e2e-wire-"));
    const recorder = await prepareWireRecorder(dir);
    const result = await execa(
      "node",
      ["--input-type=module", "--eval", deeplClient("200 OK", DEEPL_REPLY)],
      {
        env: { ...process.env, ...recorder.env, VERBATRA_E2E_WIRE_LOG: unrecordableLog },
        reject: false,
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("answered 200");
    expect(result.stderr).toBe("");
  });

  it("records the Google texts and format, never the keyed URL, and survives a body it cannot parse", async () => {
    const log = await runThroughRecorder(GOOGLE_CLIENT);
    expect(log).not.toContain(FAKE_KEY);
    expect(parseWireLog(log)).toEqual([
      {
        provider: "google-translate",
        kind: "request",
        texts: ['Hello <span translate="no">{0}</span>'],
        format: "html",
      },
      { provider: "unknown", kind: "unrecorded" },
    ]);
  });
});

describe("billing arithmetic", () => {
  it("counts code points, so an astral character is one character", () => {
    expect(characterCount(["ab", "\u{1F600}"])).toBe(3);
  });

  it("strips markup tags but keeps the marker and entity text", () => {
    expect(withoutMarkupTags(['Hi <span translate="no">{0}</span> &amp;'])).toEqual([
      "Hi {0} &amp;",
    ]);
  });

  it("strips the DeepL x tag and the Google span from the real masked strings", () => {
    expect(
      withoutMarkupTags([
        "Hello <x>{0}</x> &amp; you",
        'Hi <span translate="no">{0}</span>, <span translate="no">{1}</span> &lt;3',
      ]),
    ).toEqual(["Hello {0} &amp; you", "Hi {0}, {1} &lt;3"]);
  });

  it.each([
    ["<<span>span>", "span>"],
    ["<<script>script>alert(1)", "script>alert(1)"],
    ["a<sp<an>b", "ab"],
    ["keep <span", "keep "],
    ["<", ""],
    ["no tags > here", "no tags > here"],
  ])("leaves no tag opener behind in %j", (text, expected) => {
    const [stripped] = withoutMarkupTags([text]);
    expect(stripped).toBe(expected);
    expect(stripped).not.toContain("<");
  });

  it("counts the characters outside tags across a batch", () => {
    expect(characterCount(withoutMarkupTags(["<x>{0}</x>", "\u{1F600}<b>!</b>"]))).toBe(5);
  });

  it("keeps only the DeepL exchanges that succeeded, so a retried request counts once", () => {
    const exchanges = successfulDeepLExchanges(
      parseWireLog(
        [
          { provider: "deepl", kind: "request", exchange: 1, body: "text=first" },
          { provider: "deepl", kind: "response", exchange: 1, status: 429, billedCharacters: null },
          { provider: "deepl", kind: "request", exchange: 2, body: "text=retry" },
          { provider: "deepl", kind: "request", exchange: 3, body: "text=unanswered" },
          { provider: "deepl", kind: "response", exchange: 2, status: 200, billedCharacters: [5] },
        ]
          .map((record) => JSON.stringify(record))
          .join("\n"),
      ),
    );
    expect(exchanges).toEqual([{ body: "text=retry", billedCharacters: [5] }]);
    expect(successfulDeepLExchanges([])).toEqual([]);
  });

  it("sums billed counts across responses and refuses to sum a missing one", () => {
    expect(sumBilled([[3, 4], [5]])).toBe("12");
    expect(sumBilled([[3], null])).toBe("unavailable (no billed_characters recorded)");
    expect(sumBilled([])).toBe("unavailable (no billed_characters recorded)");
  });

  it("builds the unmasked DeepL body from the masked one's languages and the raw values", () => {
    const unmasked = new URLSearchParams(unmaskedDeepLBody(MASKED_DEEPL_BODY, ["Hello {{name}}"]));
    expect(unmasked.get("source_lang")).toBe("EN");
    expect(unmasked.get("target_lang")).toBe("DE");
    expect(unmasked.get("show_billed_characters")).toBe("1");
    expect(unmasked.getAll("text")).toEqual(["Hello {{name}}"]);
    expect(unmasked.has("tag_handling")).toBe(false);
    expect(deeplTexts(MASKED_DEEPL_BODY)).toEqual(["Hello <x>{0}</x> &amp; you"]);
  });

  it("renders one table row per batch with both character counts", () => {
    const table = billingTable([
      {
        provider: "deepl",
        variant: "masked",
        requests: 1,
        texts: ["a <x>{0}</x>"],
        billedCharacters: "5",
      },
    ]);
    expect(table.split("\n")).toHaveLength(3);
    expect(table).toContain("| deepl | masked | 1 | 12 | 5 | 5 |");
  });
});

describe("direct provider requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a thrown transport error by its name only", async () => {
    const failure = new TypeError(`connect failed for ${FAKE_KEY}`);
    vi.stubGlobal("fetch", () => Promise.reject(failure));
    const deepl = await deeplBilledCharacters(FAKE_KEY, "text=a");
    const google = await sendUnmaskedGoogleBatch(FAKE_KEY, {
      texts: ["a"],
      source: "en",
      target: "de",
    });
    expect(deepl).toBe("unavailable (TypeError)");
    expect(google).toBe("unavailable (TypeError)");
  });

  it("reports a non-2xx reply by its status only", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("denied", { status: 403 })));
    expect(await deeplBilledCharacters(FAKE_KEY, "text=a")).toBe("unavailable (HTTP 403)");
  });

  it("sums the billed count DeepL returns for the unmasked body", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(DEEPL_REPLY, { status: 200 })));
    expect(await deeplBilledCharacters(FAKE_KEY, "text=a")).toBe("12");
  });
});
