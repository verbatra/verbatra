import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import {
  billingTable,
  characterCount,
  deeplTexts,
  prepareWireRecorder,
  readWireRecords,
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

const DEEPL_CLIENT = `
import https from "node:https";
const request = https.request({
  hostname: "api-free.deepl.com",
  path: "/v2/translate",
  method: "POST",
  headers: { authorization: "DeepL-Auth-Key ${FAKE_KEY}" },
});
request.on("error", () => {});
request.write(${JSON.stringify(MASKED_DEEPL_BODY.slice(0, 20))});
request.end(${JSON.stringify(MASKED_DEEPL_BODY.slice(20))});
process.exit(0);
`;

const GOOGLE_CLIENT = `
await globalThis
  .fetch("https://translation.googleapis.com/language/translate/v2?key=${FAKE_KEY}", {
    method: "POST",
    body: JSON.stringify({ q: ["Hello <span translate=\\"no\\">{0}</span>"], format: "html" }),
    signal: AbortSignal.abort(),
  })
  .catch(() => {});
`;

async function runThroughRecorder(client: string): Promise<{ log: string; logPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-e2e-wire-"));
  const recorder = await prepareWireRecorder(dir);
  await execa("node", ["--input-type=module", "--eval", client], {
    env: { ...process.env, ...recorder.env },
  });
  return { log: await readFile(recorder.logPath, "utf8"), logPath: recorder.logPath };
}

describe("wire recorder preload", () => {
  it("records the DeepL form body across write and end, never the auth header", async () => {
    const { log, logPath } = await runThroughRecorder(DEEPL_CLIENT);
    expect(log).not.toContain(FAKE_KEY);
    expect(await readWireRecords(logPath)).toEqual([
      { provider: "deepl", body: MASKED_DEEPL_BODY },
    ]);
  });

  it("records the Google texts and format, never the keyed URL", async () => {
    const { log, logPath } = await runThroughRecorder(GOOGLE_CLIENT);
    expect(log).not.toContain(FAKE_KEY);
    expect(await readWireRecords(logPath)).toEqual([
      {
        provider: "google-translate",
        texts: ['Hello <span translate="no">{0}</span>'],
        format: "html",
      },
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
