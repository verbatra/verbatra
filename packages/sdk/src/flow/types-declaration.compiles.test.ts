import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { DeclaredMessage } from "./types-declaration.js";
import { renderTypesDeclaration } from "./types-declaration.js";

const run = promisify(execFile);

const TSC = join(dirname(dirname(import.meta.dirname)), "node_modules", ".bin", "tsc");

const MESSAGES: readonly DeclaredMessage[] = [
  { key: "app.title", arguments: { style: "none" }, isPlural: false },
  {
    key: "app.greeting",
    arguments: { style: "named", named: [{ name: "name", type: "unknown" }] },
    isPlural: false,
  },
  {
    key: "cart.items",
    arguments: { style: "named", named: [{ name: "count", type: "number" }] },
    isPlural: false,
  },
  { key: "a.b.c", arguments: { style: "none" }, isPlural: false },
  { key: "class", arguments: { style: "none" }, isPlural: false },
  { key: "1st", arguments: { style: "none" }, isPlural: false },
  { key: "", arguments: { style: "none" }, isPlural: false },
  { key: 'say "hi"', arguments: { style: "none" }, isPlural: false },
  { key: "a\\b\nc", arguments: { style: "none" }, isPlural: false },
  {
    key: "legacy",
    arguments: { style: "positional", positional: ["unknown", "number"] },
    isPlural: false,
  },
  {
    key: "broken",
    arguments: { style: "unresolved", reason: "invalid-message-syntax" },
    isPlural: false,
  },
  { key: "cart.item_one", arguments: { style: "none" }, isPlural: true },
];

const USAGE = `import type {
  VerbatraMessageArguments,
  VerbatraMessageKey,
  VerbatraMessages,
  VerbatraPluralMessageKey,
} from "./verbatra-types.js";

declare function t<Key extends VerbatraMessageKey>(
  key: Key,
  args: VerbatraMessageArguments<Key>,
): string;

t("app.title", {});
// @ts-expect-error a message that takes no argument must reject one
t("app.title", { name: "Ada" });

t("app.greeting", { name: "Ada" });
// @ts-expect-error the declared argument is required
t("app.greeting", {});
// @ts-expect-error only the name the catalog carries is accepted
t("app.greeting", { other: "Ada" });

t("cart.items", { count: 2 });
// @ts-expect-error a number-typed argument must reject a string
t("cart.items", { count: "2" });

t("a.b.c", {});
t("class", {});
t("1st", {});
t("", {});
t('say "hi"', {});
t("a\\\\b\\nc", {});

t("legacy", ["anything", 1]);
// @ts-expect-error the second position is a number
t("legacy", ["anything", "two"]);

t("broken", { whatever: 1 });

// @ts-expect-error a key the catalog does not carry is not a key
t("nope", {});

export const plural: VerbatraPluralMessageKey = "cart.item_one";
export const key: VerbatraMessageKey = "app.title";
export type Greeting = VerbatraMessages["app.greeting"];
`;

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
  files: ["usage.ts"],
};

describe("the generated declaration is real TypeScript a consumer can rely on", () => {
  it("compiles under strict TypeScript and rejects every wrong call site", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-types-"));
    await writeFile(
      join(dir, "verbatra-types.d.ts"),
      renderTypesDeclaration({
        sourcePath: "locales/en.json",
        format: "i18next-json",
        messages: MESSAGES,
      }),
      "utf8",
    );
    await writeFile(join(dir, "usage.ts"), USAGE, "utf8");
    await writeFile(join(dir, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2), "utf8");

    let out = "";
    try {
      out = (await run(TSC, ["-p", dir], { cwd: dir })).stdout;
    } catch (error) {
      out = String((error as { stdout?: string }).stdout ?? error);
    }

    expect(out).toBe("");
  }, 120_000);
});
