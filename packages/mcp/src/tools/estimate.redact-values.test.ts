import { createValueMarker } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { baseLoadedConfig, baseVerbatraConfig, makeContext, makeProject } from "../test-support.js";
import { estimateTool } from "./estimate.js";

const CANARY = "QZXJ";

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/sdk")>();
  return {
    ...actual,
    translate: async (...args: Parameters<typeof actual.translate>) => {
      const summary = await actual.translate(...args);
      const [de, fr] = summary.locales;
      if (de === undefined || fr === undefined) {
        throw new Error("expected two locales");
      }
      return {
        ...summary,
        locales: [
          {
            ...de,
            notices: [{ code: "SOURCE_FOREIGN_PLACEHOLDERS", message: `holds "${CANARY}-source"` }],
          },
          { ...fr, status: "failed", error: { code: "LOCALE_FAILED", message: `${CANARY} read` } },
        ],
      };
    },
  };
});

describe("translation.estimate with redacted values", () => {
  it("marks every notice and locale error message, and keeps the estimate", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {}, fr: {} });
    const context = makeContext({
      cwd: dir,
      config: baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }) }),
      valueMarker: createValueMarker(),
    });

    const outcome = await estimateTool.execute({}, context);

    expect(JSON.stringify(outcome)).not.toContain(CANARY);
    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        locales: [
          {
            locale: "de",
            notices: [
              {
                code: "SOURCE_FOREIGN_PLACEHOLDERS",
                message: expect.stringMatching(/^\[redacted length=\d+ hash=[0-9a-f]{16}\]$/),
              },
            ],
          },
          {
            locale: "fr",
            error: {
              code: "LOCALE_FAILED",
              message: expect.stringMatching(/^\[redacted length=\d+ hash=[0-9a-f]{16}\]$/),
            },
          },
        ],
        estimate: { keys: 2, locales: [{ locale: "de" }, { locale: "fr" }] },
      },
    });
  });
});
