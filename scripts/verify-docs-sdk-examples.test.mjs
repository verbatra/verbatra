import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = resolve(REPO_ROOT, "apps/docs/content/docs");
const SDK_DIR = resolve(REPO_ROOT, "packages/sdk");
const TSC = resolve(REPO_ROOT, "node_modules/typescript/bin/tsc");

const QUICKSTART = "(sdk)/sdk-quickstart";
const RECIPES = "(sdk)/programmatic-api";
const EXAMPLE_PAGES = [QUICKSTART, RECIPES];
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

function runScript(project, file) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", file],
    { cwd: project, encoding: "utf8", env: keylessEnv(), timeout: 60_000 },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
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
    expect(typeScriptBlocks(readPage(RECIPES)).length).toBeGreaterThanOrEqual(13);
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

describe("the SDK examples run end to end without an API key", () => {
  let project;

  beforeAll(() => {
    project = mkdtempSync(join(realpathSync(tmpdir()), "verbatra-docs-project-"));
    mkdirSync(join(project, "locales"));
    mkdirSync(join(project, "node_modules/@verbatra"), { recursive: true });
    symlinkSync(SDK_DIR, join(project, "node_modules/@verbatra/sdk"), "dir");
    writeFileSync(join(project, "package.json"), '{"type":"module","private":true}\n');
    const files = {
      [QUICKSTART]: [
        "locales/en.json",
        "verbatra.config.ts",
        "preview.ts",
        "safe-translate.ts",
        "check.ts",
      ],
      [RECIPES]: ["fake-provider.ts", "review.ts"],
    };
    for (const [page, titles] of Object.entries(files)) {
      for (const title of titles) {
        writeFileSync(join(project, title), `${blockTitled(page, title)}\n`);
      }
    }
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it(
    "previews, gates, reports the missing key, translates with a fake provider, and reviews",
    () => {
      const preview = runScript(project, "preview.ts");
      const shownOutput = fencedBlocks(readPage(QUICKSTART)).find((block) =>
        block.opening.startsWith("```text output"),
      );
      expect(preview.status).toBe(0);
      expect(preview.stdout.trim()).toBe(shownOutput?.body.trim());

      const outOfSync = runScript(project, "check.ts");
      expect(outOfSync.stdout).toContain("de: 2 missing, 0 stale");
      expect(outOfSync.status).toBe(1);

      const noKey = runScript(project, "safe-translate.ts");
      expect(noKey.stderr).toContain("PROVIDER_CONSTRUCTION_FAILED");
      expect(noKey.stderr).toContain("GEMINI_API_KEY");
      expect(noKey.status).toBe(2);

      const fake = runScript(project, "fake-provider.ts");
      expect(fake.stdout).toContain("1 locales translated, in sync: true");
      expect(fake.status).toBe(0);
      expect(JSON.parse(readFileSync(join(project, "locales/de.json"), "utf8"))).toEqual({
        greeting: "[de] Hello, {{name}}!",
        cart: { empty: "[de] Your cart is empty." },
      });

      const review = runScript(project, "review.ts");
      expect(review.stdout).toContain("approved de/greeting");
      expect(review.stdout).toContain("approved de/cart.empty");
      expect(review.status).toBe(0);

      const inSync = runScript(project, "check.ts");
      expect(inSync.stdout).toContain("de: 0 missing, 0 stale");
      expect(inSync.status).toBe(0);
    },
    SLOW,
  );
});
