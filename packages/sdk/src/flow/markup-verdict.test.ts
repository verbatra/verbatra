import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { keyIntegrity } from "./key-integrity.js";
import { judgeEntryMarkup } from "./markup-verdict.js";

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

const adapter = i18nextAdapter();

interface MarkupCase {
  readonly name: string;
  readonly source: string;
  readonly candidate: string;
  readonly matches: boolean;
  readonly details: readonly string[];
}

const cases: readonly MarkupCase[] = [
  {
    name: "no markup on either side",
    source: "Save changes",
    candidate: "Anderungen speichern",
    matches: true,
    details: [],
  },
  {
    name: "a faithful reorder",
    source: "<b>Save</b> then <i>close</i>",
    candidate: "<i>Schliessen</i> nach <b>Speichern</b>",
    matches: true,
    details: [],
  },
  {
    name: "a dropped pair",
    source: "Read <b>the docs</b>",
    candidate: "Lies die Doku",
    matches: false,
    details: ["-</b>", "-<b>"],
  },
  {
    name: "a renamed tag",
    source: "Read <b>the docs</b>",
    candidate: "Lies <strong>die Doku</strong>",
    matches: false,
    details: ["-</b>", "-<b>", "+</strong>", "+<strong>"],
  },
  {
    name: "mis-nested markup, where no single tag is at fault",
    source: "<b>Save</b><i>Close</i>",
    candidate: "<b>Speichern<i>Schliessen</b></i>",
    matches: false,
    details: [],
  },
  {
    name: "markup invented where the source had none",
    source: "Save changes",
    candidate: "<b>Anderungen speichern</b>",
    matches: false,
    details: ["+</b>", "+<b>"],
  },
  {
    name: "an unclosed script tag invented where the source had none",
    source: "Hello",
    candidate: "Hallo <script>alert(1)",
    matches: false,
    details: ["+<script>"],
  },
  {
    name: "a stray closing tag invented where the source had none",
    source: "Hello",
    candidate: "Hallo</div>",
    matches: false,
    details: ["+</div>"],
  },
  {
    name: "an unclosed bracketed word that is not an HTML element name",
    source: "Press Enter",
    candidate: "Druecke <Enter>",
    matches: true,
    details: [],
  },
  {
    name: "an unterminated comment that hides the rest of the candidate",
    source: "<b>x</b>",
    candidate: "<!-- <b>x</b>",
    matches: false,
    details: ["-</b>", "-<b>", "+<!-- <b>x</b>"],
  },
  {
    name: "a processing instruction the source never had",
    source: "Hello",
    candidate: "Hallo <?php ?>",
    matches: false,
    details: ["+<?php ?>"],
  },
  {
    name: "a candidate flooded past the tag ceiling",
    source: "<b>x</b>",
    candidate: `x${"<i></i>".repeat(200)}`,
    matches: false,
    details: ["+more than 256 inline tags"],
  },
];

function entryFor(value: string) {
  return {
    key: "greeting",
    namespace: "en",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

async function readOnlyVerdict(source: string, candidate: string) {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: source });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: candidate });
  await writeJsonFile(join(dir, "verbatra.lock.json"), {
    version: 1,
    locales: { de: { greeting: contentHash(entryFor(`${source} before the edit`)) } },
  });
  const config = baseConfig({ targetLocales: ["de"], format: "i18next-json" });
  const [locale] = await keyIntegrity({ config, cwd: dir });
  return locale?.entries[0];
}

describe.each(cases)("the write gate and the read-only verdict agree on markup: $name", (c) => {
  it("judgeEntryMarkup returns the expected verdict", () => {
    expect(judgeEntryMarkup(entryFor(c.source), c.candidate)).toEqual({
      matches: c.matches,
      details: c.details,
    });
  });

  it("gateCandidateValue refuses exactly when the verdict does, naming the same tags", () => {
    const gate = gateCandidateValue(entryFor(c.source), c.candidate, adapter);
    if (c.matches) {
      expect(gate.accepted).toBe(true);
      return;
    }
    expect(gate).toEqual(
      c.details.length > 0
        ? { accepted: false, reason: "markup", details: c.details }
        : { accepted: false, reason: "markup" },
    );
  });

  it("keyIntegrity reports the same verdict for the value already on disk", async () => {
    const verdict = await readOnlyVerdict(c.source, c.candidate);
    expect(verdict).toMatchObject({ markupMatches: c.matches, markupDetails: c.details });
  });
});
