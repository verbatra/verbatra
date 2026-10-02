import type { LocaleGlossary } from "@verbatra/ai-providers";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { SensitiveDataConfig } from "../config/sensitive-config.js";
import { createSensitiveGuard, type SensitiveGuard } from "./guard.js";
import { NO_SENSITIVE_PLAN, planSensitive, sensitiveNotices } from "./locale-plan.js";

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "", value, placeholders: [], isPlural: false };
}

function guard(config: SensitiveDataConfig): SensitiveGuard {
  const created = createSensitiveGuard(config, "llm");
  if (created === undefined) {
    throw new Error("expected a guard");
  }
  return created;
}

const GLOSSARY: LocaleGlossary = {
  terms: [{ source: "Falcon", target: "Falke", forbidden: [], caseSensitive: false }],
  doNotTranslate: [],
};

const MANY = Array.from({ length: 7 }, (_unused, index) =>
  entry(`k${index}`, `mail u${index}@acme.io`),
);

describe("planSensitive", () => {
  it("plans nothing without a guard", () => {
    expect(planSensitive(undefined, MANY, GLOSSARY)).toBe(NO_SENSITIVE_PLAN);
    expect(sensitiveNotices(undefined, NO_SENSITIVE_PLAN, [])).toEqual([]);
  });

  it("sorts each key into withheld or redacted by the guard's verdict", () => {
    const redact = guard({ mode: "redact" });
    const plan = planSensitive(
      redact,
      [entry("a", "mail x@acme.io"), entry("x@acme.io", "key"), entry("c", "clean")],
      undefined,
    );

    expect([...plan.redacted]).toEqual(["a"]);
    expect([...plan.withheld]).toEqual(["x@acme.io"]);
    expect(plan.flagged).toEqual(["a", "x@acme.io"]);
  });
});

describe("sensitiveNotices", () => {
  it("names at most five keys and counts the rest", () => {
    const warn = guard({ mode: "warn" });
    const [notice] = sensitiveNotices(warn, planSensitive(warn, MANY, undefined), []);

    expect(notice?.message).toMatch(/^7 keys sent to the provider/);
    expect(notice?.message).toContain('"k4", and 2 more');
  });

  it("counts glossary terms, alone or beside keys", () => {
    const warn = guard({ mode: "warn", patterns: ["Falcon"] });
    const termOnly = sensitiveNotices(warn, planSensitive(warn, [], GLOSSARY), []);
    const both = sensitiveNotices(warn, planSensitive(warn, MANY.slice(0, 1), GLOSSARY), []);

    expect(termOnly[0]?.message).toMatch(/^1 glossary term sent to the provider holds/);
    expect(both[0]?.message).toMatch(/^1 key and 1 glossary term sent/);
  });

  it("is silent under warn when nothing matched", () => {
    const warn = guard({ mode: "warn" });

    expect(sensitiveNotices(warn, planSensitive(warn, [entry("a", "Hi")], undefined), [])).toEqual(
      [],
    );
  });

  it("reports redacted keys apart from those finally withheld", () => {
    const redact = guard({ mode: "redact", patterns: ["Falcon"] });
    const plan = planSensitive(redact, MANY.slice(0, 2), GLOSSARY);
    const notices = sensitiveNotices(redact, plan, ["k1"]);

    expect(notices.map((notice) => notice.code)).toEqual([
      "SENSITIVE_CONTENT_REDACTED",
      "SENSITIVE_CONTENT_WITHHELD",
    ]);
    expect(notices[0]?.message).toBe(
      '1 key had content that looks sensitive replaced before sending and restored in the translation: "k0".',
    );
    expect(notices[1]?.message).toMatch(/^1 key and 1 glossary term were not sent/);
  });

  it("reports a glossary term dropped under block with no key withheld", () => {
    const block = guard({ mode: "block", patterns: ["Falcon"] });
    const notices = sensitiveNotices(block, planSensitive(block, [], GLOSSARY), []);

    expect(notices).toEqual([
      {
        code: "SENSITIVE_CONTENT_WITHHELD",
        message:
          "1 glossary term was not sent because it holds content that looks sensitive (pattern). Remove it, or allow it in sensitiveData.allow.",
      },
    ]);
  });

  it("is silent under block when nothing matched", () => {
    const block = guard({ mode: "block" });

    expect(sensitiveNotices(block, planSensitive(block, [], undefined), [])).toEqual([]);
  });
});
