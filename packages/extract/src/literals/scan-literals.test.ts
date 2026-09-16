import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createI18nextLiteralRules } from "../i18next/i18next-literal-rules.js";
import type { SourceFs } from "../source-fs-port.js";
import { scanLiterals } from "./scan-literals.js";

const cwd = join("/", "project");
const root = join(cwd, "src");

interface FakeFsOptions {
  readonly unreadableDirectories?: readonly string[];
  readonly writes?: string[];
}

function fakeFs(files: Readonly<Record<string, string>>, options: FakeFsOptions = {}): SourceFs {
  const directoriesUnder = (path: string) =>
    [
      ...new Set(
        Object.keys(files)
          .filter((file) => file.startsWith(`${path}/`))
          .map((file) => file.slice(path.length + 1).split("/"))
          .filter((parts) => parts.length > 1)
          .map((parts) => parts[0] ?? ""),
      ),
    ].map((name) => ({ name, kind: "directory" as const }));
  return {
    listDirectory: async (path) => {
      if (options.unreadableDirectories?.includes(path)) {
        throw new Error("EACCES");
      }
      const direct = Object.keys(files)
        .filter((file) => file.startsWith(`${path}/`) && !file.slice(path.length + 1).includes("/"))
        .map((file) => ({ name: file.slice(path.length + 1), kind: "file" as const }));
      return [...direct, ...directoriesUnder(path)];
    },
    readTextBounded: async (path, maxBytes) => {
      const content = files[path];
      if (content === undefined) {
        return { kind: "missing" };
      }
      return content.length > maxBytes ? { kind: "too-large" } : { kind: "ok", content };
    },
  };
}

function scan(
  files: Readonly<Record<string, string>>,
  extra: { ignore?: readonly string[]; exclude?: readonly string[]; maxFileBytes?: number } = {},
  options: FakeFsOptions = {},
) {
  return scanLiterals(
    { cwd, roots: [root], rules: createI18nextLiteralRules(), ...extra },
    fakeFs(files, options),
  );
}

describe("scanLiterals", () => {
  it("reports a clean project as zero findings", async () => {
    const result = await scan({
      [join(root, "app.tsx")]: 'export const A = () => <p>{t("home.title")}</p>;',
    });

    expect(result).toEqual({ scannedFiles: 1, findings: [], suppressed: [], diagnostics: [] });
  });

  it("reports each finding with a working-directory-relative file, line, and column", async () => {
    const result = await scan({
      [join(root, "app.tsx")]: "export const A = () => (\n  <p>Hello world</p>\n);",
      [join(root, "lib", "copy.ts")]: 'export const b = "Welcome back";',
    });

    expect(result.findings).toEqual([
      { file: "src/app.tsx", line: 2, column: 6, text: "Hello world", truncated: false },
      { file: "src/lib/copy.ts", line: 1, column: 18, text: "Welcome back", truncated: false },
    ]);
  });

  it("reads JSX only in files whose extension can carry it", async () => {
    const result = await scan({ [join(root, "cast.ts")]: "const a = <p>Hello world</p>;" });

    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("bounds the reported text", async () => {
    const result = await scan({ [join(root, "a.ts")]: `const a = "${"word ".repeat(100)}";` });

    expect(result.findings[0]?.truncated).toBe(true);
    expect(result.findings[0]?.text.length).toBeLessThanOrEqual(83);
  });

  it("accounts for literals suppressed by a directive and by the ignore list", async () => {
    const result = await scan(
      {
        [join(root, "a.ts")]:
          '// verbatra-ignore-next-line\nconst a = "Hidden by comment";\nconst b = "Hidden  by list";\nconst c = "Still shown here";',
      },
      { ignore: ["Hidden by list "] },
    );

    expect(result.findings.map((finding) => finding.text)).toEqual(["Still shown here"]);
    expect(result.suppressed).toEqual([
      {
        file: "src/a.ts",
        line: 3,
        column: 11,
        text: "Hidden by list",
        truncated: false,
        reason: "ignore-list",
      },
      {
        file: "src/a.ts",
        line: 2,
        column: 11,
        text: "Hidden by comment",
        truncated: false,
        reason: "directive",
      },
    ]);
  });

  it("skips test, story, declaration, and config files and test directories", async () => {
    const result = await scan(
      {
        [join(root, "a.test.tsx")]: 'const a = "Welcome back";',
        [join(root, "a.spec.ts")]: 'const a = "Welcome back";',
        [join(root, "a.stories.tsx")]: 'const a = "Welcome back";',
        [join(root, "a.d.ts")]: 'declare const a: "Welcome back";',
        [join(root, "vite.config.ts")]: 'const a = "Welcome back";',
        [join(root, "__tests__", "a.ts")]: 'const a = "Welcome back";',
        [join(root, "generated", "a.ts")]: 'const a = "Welcome back";',
      },
      { exclude: ["generated"] },
    );

    expect(result).toEqual({ scannedFiles: 0, findings: [], suppressed: [], diagnostics: [] });
  });

  it("reports a file it cannot parse as a diagnostic and carries on with the rest", async () => {
    const result = await scan({
      [join(root, "a-broken.tsx")]: 'const a = "Welcome back";\nconst b = <p>never closed',
      [join(root, "b-fine.ts")]: 'const c = "Also welcome here";',
    });

    expect(result.scannedFiles).toBe(2);
    expect(result.diagnostics).toEqual([{ file: "src/a-broken.tsx", reason: "unparseable" }]);
    expect(result.findings.map((finding) => finding.file)).toEqual([
      "src/a-broken.tsx",
      "src/b-fine.ts",
    ]);
  });

  it("reports unreadable, oversized, and unlistable sources as diagnostics", async () => {
    const result = await scan(
      { [join(root, "big.ts")]: 'const a = "Welcome back";', [join(root, "locked", "x.ts")]: "" },
      { maxFileBytes: 4 },
      { unreadableDirectories: [join(root, "locked")] },
    );

    expect(result.diagnostics).toEqual([
      { file: "src/locked", reason: "unreadable-directory" },
      { file: "src/big.ts", reason: "too-large" },
    ]);
  });

  it("reports a file that vanished between listing and reading as unreadable", async () => {
    const fs = fakeFs({});
    const result = await scanLiterals(
      { cwd, roots: [root], rules: createI18nextLiteralRules() },
      { ...fs, listDirectory: async () => [{ name: "gone.ts", kind: "file" }] },
    );

    expect(result.diagnostics).toEqual([{ file: "src/gone.ts", reason: "unreadable" }]);
  });

  it("reports a file whose scan throws as unparseable rather than aborting", async () => {
    const rules = createI18nextLiteralRules();
    const throwing = {
      ...rules,
      calleeNames: {
        has: () => {
          throw new Error("boom");
        },
      } as unknown as ReadonlySet<string>,
    };
    const result = await scanLiterals(
      { cwd, roots: [root], rules: throwing },
      fakeFs({ [join(root, "a.ts")]: 'f("Welcome back")' }),
    );

    expect(result.diagnostics).toEqual([{ file: "src/a.ts", reason: "unparseable" }]);
    expect(result.scannedFiles).toBe(0);
  });
});
