import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { loadConfig } from "./load-config.js";

const SK_PROJ = ["sk", "proj", ""].join("-");

const OPENAI_SHAPED = `${SK_PROJ}abcdefghijklmnopqrstuvwxyz0123456789`;
const ANTHROPIC_SHAPED = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const CUSTOM_VALUE = "custom-local-secret-7f3a9c";

async function loadFailure(fileName: string, contents: string): Promise<SdkError> {
  const dir = await makeTempDir();
  await writeFile(join(dir, fileName), contents, "utf8");
  const error = await loadConfig({ cwd: dir, configPath: fileName }).catch((caught) => caught);
  expect(error).toBeInstanceOf(SdkError);
  return error as SdkError;
}

function expectNoSecret(message: string): void {
  for (const fragment of ["sk-proj", "sk-ant", "custom-local", "abcdefghij"]) {
    expect(message).not.toContain(fragment);
  }
}

describe("loadConfig: load failures never echo file content", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports malformed JSON without the parser's content snippet", async () => {
    vi.stubEnv("LOCAL_MODEL_KEY", CUSTOM_VALUE);
    const error = await loadFailure(
      ".verbatrarc.json",
      `{"provider": {"id": "openai-compatible", "options": {"apiKeyEnvVar": "LOCAL_MODEL_KEY"}},
       "key": ${OPENAI_SHAPED}, "other": ${ANTHROPIC_SHAPED}, "custom": ${CUSTOM_VALUE} }`,
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toMatch(/\.verbatrarc\.json: the file is not valid JSON\.$/);
    expectNoSecret(error.message);
  });

  it("reports malformed YAML with its position but without the parser's code frame", async () => {
    vi.stubEnv("LOCAL_MODEL_KEY", CUSTOM_VALUE);
    const error = await loadFailure(
      ".verbatrarc.yaml",
      [
        "provider:",
        "  id: openai-compatible",
        "  options:",
        "    apiKeyEnvVar: LOCAL_MODEL_KEY",
        `key: ${OPENAI_SHAPED}`,
        `other: ${ANTHROPIC_SHAPED}`,
        `custom: "${CUSTOM_VALUE}`,
        "  : : bad: [",
      ].join("\n"),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toMatch(
      /\.verbatrarc\.yaml: the file is not valid YAML at line \d+, column \d+\.$/,
    );
    expect(error.message).not.toContain("\n");
    expectNoSecret(error.message);
  });

  it("redacts a secret-shaped key that the schema reports as unrecognized", async () => {
    const error = await loadFailure(
      ".verbatrarc.json",
      JSON.stringify({ ...baseConfig(), [OPENAI_SHAPED]: ANTHROPIC_SHAPED }),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("[REDACTED]");
    expectNoSecret(error.message);
  });
});
