import { describe, expect, it } from "vitest";
import { baseLoadedConfig, baseVerbatraConfig, makeContext, makeProject } from "../test-support.js";
import { localeIntegrityTool } from "./locale-integrity.js";

describe("locale.integrity", () => {
  it("lists only the broken translations, each with its key and outcomes", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}", title: "Welcome" },
      { de: { greeting: "Hallo", title: "Willkommen" }, fr: { greeting: "Salut {{name}}" } },
    );
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }) }),
    });

    const outcome = await localeIntegrityTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        locales: [
          {
            locale: "de",
            entries: [{ key: "greeting", matches: false, missing: ["{{name}}"], extra: [] }],
          },
          { locale: "fr", entries: [] },
        ],
      },
    });
  });

  it("narrows to the requested locales", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await localeIntegrityTool.execute(
      { locales: ["de"] },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toEqual({ kind: "ok", result: { locales: [{ locale: "de", entries: [] }] } });
  });

  it("fails with UNKNOWN_LOCALE for a locale that is not a target", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await localeIntegrityTool.execute(
      { locales: ["xx"] },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("UNKNOWN_LOCALE"),
    });
  });

  it.each([{ locales: [] }, { key: "greeting" }])(
    "rejects the invalid input %j",
    async (params) => {
      const outcome = await localeIntegrityTool.execute(params, makeContext());

      expect(outcome.kind).toBe("invalid");
    },
  );
});
