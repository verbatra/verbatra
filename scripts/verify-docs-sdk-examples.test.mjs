import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sdkReferencePages } from "./sdk-reference-pages.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = resolve(REPO_ROOT, "apps/docs/content/docs");
const SDK_DIR = resolve(REPO_ROOT, "packages/sdk");
const TSC = resolve(REPO_ROOT, "node_modules/typescript/bin/tsc");

const QUICKSTART = "(sdk)/sdk-quickstart";
const RECIPES = "(sdk)/programmatic-api";
const EXAMPLE_PAGES = [QUICKSTART, RECIPES];
const REFERENCE_PAGES = sdkReferencePages().map((page) => `sdk/${page}`);
const EXAMPLE_TITLES = { "": "Example", ".de": "Beispiel", ".es": "Ejemplo", ".fr": "Exemple" };
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];
const SLOW = 180_000;

function readPage(page, suffix = "") {
  return readFileSync(join(CONTENT_DIR, `${page}${suffix}.mdx`), "utf8");
}

function fencedBlocks(source) {
  const blocks = [];
  let open;
  for (const line of source.split("\n")) {
    if (open === undefined) {
      const fence = /^(`{3,}|~{3,})/.exec(line);
      if (fence?.[1] !== undefined) open = { fence: fence[1], opening: line, lines: [] };
      continue;
    }
    if (line.trim() === open.fence) {
      blocks.push({ opening: open.opening, body: open.lines.join("\n") });
      open = undefined;
    } else {
      open.lines.push(line);
    }
  }
  return blocks;
}

function blockTitle(block) {
  return /title="([^"]+)"/.exec(block.opening)?.[1];
}

function typeScriptBlocks(source) {
  return fencedBlocks(source).filter(
    (block) => /^`{3,}ts(\s|$)/.test(block.opening) && blockTitle(block) !== "Signature",
  );
}

function blockTitled(page, title) {
  const block = fencedBlocks(readPage(page)).find((candidate) => blockTitle(candidate) === title);
  if (block === undefined) throw new Error(`${page}.mdx has no code block titled ${title}`);
  return block.body;
}

function typecheck(sources) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "verbatra-docs-examples-"));
  try {
    const include = sources.map((source, index) => {
      const file = `example-${index}.mts`;
      writeFileSync(join(dir, file), `${source}\n`);
      return file;
    });
    const tsconfig = {
      compilerOptions: {
        strict: true,
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "es2022",
        noEmit: true,
        skipLibCheck: true,
        types: ["node"],
        typeRoots: [join(SDK_DIR, "node_modules/@types")],
        paths: { "@verbatra/sdk": [join(SDK_DIR, "dist/index.d.ts")] },
      },
      include,
    };
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
    const result = spawnSync(process.execPath, [TSC, "-p", join(dir, "tsconfig.json")], {
      encoding: "utf8",
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function keylessEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.endsWith("_API_KEY")),
  );
}

const TYPELESS_WARNING = "MODULE_TYPELESS_PACKAGE_JSON";

function spawnScript(project, file) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", file], {
    cwd: project,
    encoding: "utf8",
    env: keylessEnv(),
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function projectSetupBlock() {
  const block = fencedBlocks(readPage(QUICKSTART)).find(
    (candidate) => candidate.opening === "```bash" && candidate.body.includes("npm pkg set"),
  );
  if (block === undefined) throw new Error("the SDK quickstart shows no project setup block");
  return block.body.split("\n");
}

function spawnSetupCommand(project, command) {
  return spawnSync(command, {
    cwd: project,
    encoding: "utf8",
    env: keylessEnv(),
    shell: true,
    timeout: 60_000,
  });
}

function runSetupCommand(project, command) {
  const result = spawnSetupCommand(project, command);
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
}

function runScript(project, file) {
  const result = spawnScript(project, file);
  expect(result.stderr, result.stderr).not.toContain(TYPELESS_WARNING);
  return result;
}

describe("the SDK quickstart and recipes", () => {
  it.each(
    EXAMPLE_PAGES.flatMap((page) => LOCALE_SUFFIXES.slice(1).map((suffix) => [page, suffix])),
  )("%s%s.mdx carries the English page's code blocks verbatim", (page, suffix) => {
    expect(fencedBlocks(readPage(page, suffix))).toEqual(fencedBlocks(readPage(page)));
  });

  it("reads every fenced block, so the locale comparison cannot pass vacuously", () => {
    const blocks = fencedBlocks('text\n```ts title="a.ts"\nconst a = 1;\n```\n~~~bash\nls\n~~~\n');
    expect(blocks).toEqual([
      { opening: '```ts title="a.ts"', body: "const a = 1;" },
      { opening: "~~~bash", body: "ls" },
    ]);
    expect(typeScriptBlocks(readPage(QUICKSTART)).length).toBeGreaterThanOrEqual(5);
    expect(typeScriptBlocks(readPage(RECIPES)).length).toBeGreaterThanOrEqual(15);
  });

  it(
    "typechecks every TypeScript example against the built @verbatra/sdk declarations",
    () => {
      const sources = EXAMPLE_PAGES.flatMap((page) =>
        typeScriptBlocks(readPage(page)).map((block) => block.body),
      );
      const result = typecheck(sources);
      expect(result.output).toBe("");
      expect(result.status).toBe(0);
    },
    SLOW,
  );

  it(
    "fails the typecheck on an example that uses an export the SDK does not have",
    () => {
      const result = typecheck(['import { translateEverything } from "@verbatra/sdk";\n']);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("translateEverything");
    },
    SLOW,
  );
});

function referenceExamples(page, suffix = "") {
  return typeScriptBlocks(readPage(page, suffix))
    .filter((block) => blockTitle(block) === EXAMPLE_TITLES[suffix])
    .map(({ body }) => body);
}

function untitledFragments(page, suffix) {
  return typeScriptBlocks(readPage(page, suffix)).filter(
    (block) => blockTitle(block) === undefined && !block.body.startsWith("interface "),
  );
}

describe("the SDK reference examples", () => {
  it("finds Example blocks on the reference pages, so the checks cannot pass vacuously", () => {
    expect(REFERENCE_PAGES).toEqual(expect.arrayContaining(["sdk/index", "sdk/run"]));
    expect(
      REFERENCE_PAGES.flatMap((page) => referenceExamples(page)).length,
    ).toBeGreaterThanOrEqual(7);
    expect(referenceExamples("sdk/index").every((body) => body.includes("@verbatra/sdk"))).toBe(
      true,
    );
  });

  it.each(
    REFERENCE_PAGES.flatMap((page) => LOCALE_SUFFIXES.slice(1).map((suffix) => [page, suffix])),
  )("%s%s.mdx carries the English page's Example bodies verbatim", (page, suffix) => {
    expect(referenceExamples(page, suffix)).toEqual(referenceExamples(page));
  });

  it.each(REFERENCE_PAGES.flatMap((page) => LOCALE_SUFFIXES.map((suffix) => [page, suffix])))(
    "%s%s.mdx shows no untitled TypeScript fragment",
    (page, suffix) => {
      expect(untitledFragments(page, suffix)).toEqual([]);
    },
  );

  it(
    "typechecks every Example block against the built @verbatra/sdk declarations",
    () => {
      const sources = REFERENCE_PAGES.flatMap((page) =>
        referenceExamples(page).map(({ body }) => body),
      );
      const result = typecheck(sources);
      expect(result.output).toBe("");
      expect(result.status).toBe(0);
    },
    SLOW,
  );

  it(
    "fails the typecheck on an Example that uses a given it never declares",
    () => {
      const result = typecheck([
        'import { translate } from "@verbatra/sdk";\nawait translate({ config });\n',
      ]);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("config");
    },
    SLOW,
  );
});

describe("the SDK examples run end to end without an API key", () => {
  let project;

  beforeAll(() => {
    project = mkdtempSync(join(realpathSync(tmpdir()), "verbatra-docs-project-"));
    for (const command of projectSetupBlock()) {
      if (command.startsWith("npm install")) continue;
      runSetupCommand(project, command);
    }
    mkdirSync(join(project, "locales"));
    mkdirSync(join(project, "node_modules/@verbatra"), { recursive: true });
    symlinkSync(SDK_DIR, join(project, "node_modules/@verbatra/sdk"), "junction");
    const files = {
      [QUICKSTART]: [
        "locales/en.json",
        "verbatra.config.ts",
        "preview.ts",
        "safe-translate.ts",
        "check.ts",
      ],
      [RECIPES]: ["fake-provider.ts", "review.ts", "scan-values.ts"],
    };
    for (const [page, titles] of Object.entries(files)) {
      for (const title of titles) {
        writeFileSync(join(project, title), `${blockTitled(page, title)}\n`);
      }
    }
  }, SLOW);

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it(
    "needs npm init -y first, since npm pkg set alone fails in an empty directory",
    () => {
      const empty = mkdtempSync(join(realpathSync(tmpdir()), "verbatra-docs-empty-"));
      try {
        expect(readdirSync(empty)).toEqual([]);
        const alone = spawnSetupCommand(empty, "npm pkg set type=module");
        expect(alone.status).not.toBe(0);
        expect(readdirSync(empty)).toEqual([]);
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    },
    SLOW,
  );

  it("sets the project up from an empty directory with the page's own commands", () => {
    expect(projectSetupBlock()).toEqual([
      "npm init -y",
      "npm pkg set type=module",
      "npm install --save-dev @verbatra/sdk",
    ]);
    const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    expect(manifest.type).toBe("module");
  });

  it(
    "sees the typeless-package warning when a script's package.json declares no type",
    () => {
      mkdirSync(join(project, "typeless"));
      writeFileSync(join(project, "typeless/package.json"), "{}\n");
      writeFileSync(
        join(project, "typeless/preview.ts"),
        `${blockTitled(QUICKSTART, "preview.ts")}\n`,
      );
      const typeless = spawnScript(project, "typeless/preview.ts");
      expect(typeless.status, typeless.stderr).toBe(0);
      expect(typeless.stderr).toContain(TYPELESS_WARNING);
    },
    SLOW,
  );

  it(
    "previews the run without a key, exactly as the page shows it",
    () => {
      const preview = runScript(project, "preview.ts");
      const shownOutput = fencedBlocks(readPage(QUICKSTART)).find((block) =>
        block.opening.startsWith("```text output"),
      );
      expect(preview.status, preview.stderr).toBe(0);
      expect(preview.stdout.trim()).toBe(shownOutput?.body.trim());
    },
    SLOW,
  );

  it(
    "fails the CI gate while the target locale is missing",
    () => {
      const outOfSync = runScript(project, "check.ts");
      expect(outOfSync.status, outOfSync.stderr).toBe(1);
      expect(outOfSync.stdout).toContain("de: 2 missing, 0 stale");
    },
    SLOW,
  );

  it(
    "scans the configured target locales in bulk, naming none the config lacks",
    () => {
      const scan = runScript(project, "scan-values.ts");
      expect(scan.status, scan.stderr).toBe(0);
      expect(scan.stderr).not.toContain("UNKNOWN_LOCALE");
      expect(scan.stderr).toContain("de/greeting: not translated yet");
      expect(scan.stderr).toContain("de/cart.empty: not translated yet");
    },
    SLOW,
  );

  it(
    "refuses to review on a machine with no record of the last run",
    () => {
      const review = runScript(project, "review.ts");
      expect(review.status, review.stderr).toBe(1);
      expect(review.stderr).toContain("no run recorded on this machine");
    },
    SLOW,
  );

  it(
    "reports the missing key by code and hint, never by value",
    () => {
      const noKey = runScript(project, "safe-translate.ts");
      expect(noKey.status, noKey.stderr).toBe(2);
      expect(noKey.stderr).toContain("PROVIDER_CONSTRUCTION_FAILED");
      expect(noKey.stderr).toContain("GEMINI_API_KEY");
    },
    SLOW,
  );

  it(
    "translates through a fake provider and leaves every locale in sync",
    () => {
      const fake = runScript(project, "fake-provider.ts");
      expect(fake.status, fake.stderr).toBe(0);
      expect(fake.stdout).toContain("1 locales translated, in sync: true");
      expect(JSON.parse(readFileSync(join(project, "locales/de.json"), "utf8"))).toEqual({
        greeting: "[de] Hello, {{name}}!",
        cart: { empty: "[de] Your cart is empty." },
      });
    },
    SLOW,
  );

  it(
    "approves the unflagged values once a run has been recorded",
    () => {
      const review = runScript(project, "review.ts");
      expect(review.status, review.stderr).toBe(0);
      expect(review.stdout).toContain("approved de/greeting");
      expect(review.stdout).toContain("approved de/cart.empty");
    },
    SLOW,
  );

  it(
    "finds nothing left to flag in the bulk scan after the translation",
    () => {
      const scan = runScript(project, "scan-values.ts");
      expect(scan.status, scan.stderr).toBe(0);
      expect(scan.stderr).not.toContain("not translated yet");
      expect(scan.stdout).toBe("");
    },
    SLOW,
  );

  it(
    "passes the CI gate after the translation",
    () => {
      const inSync = runScript(project, "check.ts");
      expect(inSync.status, inSync.stderr).toBe(0);
      expect(inSync.stdout).toContain("de: 0 missing, 0 stale");
    },
    SLOW,
  );
});
