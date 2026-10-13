import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig as cliDefineConfig } from "@verbatra/cli";
import { check, loadConfig, translate } from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import {
  LANDING_CONFIG_CODE,
  LANDING_SDK_IMPORTS,
  LANDING_SHOWCASE_CODE,
  LANDING_SHOWCASE_TABS,
  LANDING_STEP_CODE,
  LANDING_STEP_IDS,
  VERBATRA_ACTION_REF,
} from "@/lib/landing-code";
import { PACKAGE_VERSION } from "@/lib/site";

const RUN_TS = fileURLToPath(new URL("../../../packages/cli/src/run.ts", import.meta.url));
const CLI_MANIFEST = fileURLToPath(new URL("../../../packages/cli/package.json", import.meta.url));
const INIT_CONFIG_TS = fileURLToPath(
  new URL("../../../packages/cli/src/init-config.ts", import.meta.url),
);
const INIT_ANSWERS_TS = fileURLToPath(
  new URL("../../../packages/cli/src/init-answers.ts", import.meta.url),
);

const EM_DASH = String.fromCharCode(0x2014);

function sdkImports(code: string): ReadonlyArray<string> {
  return [...code.matchAll(/import \{([^}]+)\} from "@verbatra\/sdk"/g)].flatMap(([, names]) =>
    (names ?? "").split(",").map((name) => name.trim()),
  );
}

const samples = [...Object.values(LANDING_SHOWCASE_CODE), ...Object.values(LANDING_STEP_CODE)];

let cwd: string | undefined;

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

describe("the landing code samples", () => {
  it("has one sample per showcase tab and per step", () => {
    expect(Object.keys(LANDING_SHOWCASE_CODE)).toEqual([...LANDING_SHOWCASE_TABS]);
    expect(Object.keys(LANDING_STEP_CODE)).toEqual([...LANDING_STEP_IDS]);
  });

  it("imports only runtime exports the sdk has", () => {
    const imported = new Set(samples.flatMap((sample) => sdkImports(sample.code)));
    expect([...imported].sort()).toEqual([...LANDING_SDK_IMPORTS].sort());
    const exports: Record<(typeof LANDING_SDK_IMPORTS)[number], unknown> = {
      check,
      loadConfig,
      translate,
    };
    for (const name of LANDING_SDK_IMPORTS) expect(typeof exports[name], name).toBe("function");
  });

  it("imports defineConfig in the config tab from the package verbatra init writes into the config", () => {
    const cliName = (JSON.parse(readFileSync(CLI_MANIFEST, "utf8")) as { name: string }).name;
    expect(readFileSync(INIT_CONFIG_TS, "utf8")).toMatch(
      /import \{ defineConfig \} from \$\{JSON\.stringify\(draft\.importName\)\}/,
    );
    expect(readFileSync(INIT_ANSWERS_TS, "utf8")).toMatch(
      /importName: readPackageManifest\(\)\.name,/,
    );
    expect(LANDING_CONFIG_CODE.split("\n")[0]).toBe(
      `import { defineConfig } from ${JSON.stringify(cliName)};`,
    );
    expect(typeof cliDefineConfig).toBe("function");
  });

  it("ships a config file that the sdk loads and validates", async () => {
    cwd = await mkdtemp(join(tmpdir(), "verbatra-docs-landing-config-"));
    await writeFile(join(cwd, "verbatra.config.ts"), LANDING_CONFIG_CODE);
    const config = await loadConfig({ cwd });

    expect(config.sourceLocale).toBe("en");
    expect(config.targetLocales).toEqual(["de", "fr"]);
    expect(config.provider.id).toBe("gemini");
  });

  it("pins both actions to full commit SHAs and the CLI to an exact released version", () => {
    const action = LANDING_SHOWCASE_CODE.action.code;
    const uses = [...action.matchAll(/uses: (\S+)@(\S+) # (v\d+(?:\.\d+){0,2})\n/g)];
    expect(uses.map(([, name]) => name)).toEqual(["actions/checkout", "verbatra/action"]);
    for (const [, , ref, tag] of uses) {
      expect(ref).toMatch(/^[0-9a-f]{40}$/);
      expect(tag).toMatch(/^v\d/);
    }
    expect(action).not.toMatch(/@v\d/);
    expect(VERBATRA_ACTION_REF).toMatch(/ # v1\./);
    expect(LANDING_STEP_CODE.ci.code).toContain(`uses: ${VERBATRA_ACTION_REF}\n`);
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    for (const code of [action, LANDING_STEP_CODE.ci.code]) {
      expect(code).toContain(`version: ${PACKAGE_VERSION}\n`);
      expect(code).toContain("command: check\n");
    }
  });

  it("starts the CLI tab with the install command the rest of the site uses", () => {
    expect(LANDING_SHOWCASE_CODE.cli.code.split("\n")[0]).toBe(NPM_INSTALL_COMMAND);
  });

  it("runs only commands the CLI registers", () => {
    const commands = LANDING_SHOWCASE_CODE.cli.code
      .split("\n")
      .filter((line) => line.startsWith("npx @verbatra/cli "))
      .map((line) => line.split(" ")[2]);
    const registered = new Set(
      [...readFileSync(RUN_TS, "utf8").matchAll(/\.command\("([a-z]+)/g)].map(([, name]) => name),
    );
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(registered.has(command), command).toBe(true);
  });

  it("carries no em dash and ends every sample with a newline", () => {
    for (const sample of samples) {
      expect(sample.code).not.toContain(EM_DASH);
      expect(sample.code.endsWith("\n")).toBe(true);
    }
  });
});
