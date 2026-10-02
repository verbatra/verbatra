import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

const SIGNATURE_BLOCK = /^```ts title="(?:Signature|Signatur|Firma)"\n([\s\S]*?)^```/gm;

const DECLARATIONS = "packages/sdk/dist/index.d.ts";

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function readDeclarations() {
  try {
    return readRepoFile(DECLARATIONS);
  } catch {
    throw new Error(`${DECLARATIONS} is missing; run pnpm build before pnpm test:scripts`);
  }
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function normalize(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/([({[<,]) /g, "$1")
    .replace(/ ([)}\]>,;])/g, "$1")
    .replace(/[,;]([)}\]>])/g, "$1")
    .trim();
}

const OPENERS = { "(": ")", "{": "}", "[": "]", "<": ">" };

function closingIndex(text, start) {
  const stack = [];
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "=" && text[index + 1] === ">") {
      index += 1;
    } else if (char in OPENERS) {
      stack.push(OPENERS[char]);
    } else if (char === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) {
        return index;
      }
    }
  }
  throw new Error(`unbalanced brackets in: ${text.slice(start, start + 80)}`);
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "=" && text[index + 1] === ">") {
      current += "=>";
      index += 1;
      continue;
    }
    if (char in OPENERS) {
      depth += 1;
    } else if (")}]>".includes(char)) {
      depth -= 1;
    }
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  return current.trim() === "" ? parts : [...parts, current];
}

function parseParameter(text) {
  const colon = text.indexOf(":");
  return {
    name: text.slice(0, colon).trim(),
    type: normalize(text.slice(colon + 1)),
  };
}

function parseFunctionAt(text, nameEnd) {
  let open = nameEnd;
  if (text[open] === "<") {
    open = closingIndex(text, open) + 1;
  }
  const close = closingIndex(text, open);
  const parameters = splitTopLevel(text.slice(open + 1, close), ",")
    .map((parameter) => parameter.trim())
    .filter((parameter) => parameter !== "")
    .map(parseParameter);
  const rest = text.slice(close + 1);
  const end = rest.search(/;(?:\s*$|\s*\n)/);
  const returns = normalize(rest.slice(rest.indexOf(":") + 1, end));
  return { parameters, returns };
}

function declaredFunctions(declarations, name) {
  const pattern = new RegExp(`declare function ${name}\\b`, "g");
  return [...declarations.matchAll(pattern)].map((match) =>
    parseFunctionAt(declarations, match.index + match[0].length),
  );
}

function declaredConstType(declarations, name) {
  const match = new RegExp(`declare const ${name}: `).exec(declarations);
  if (match === null) {
    return undefined;
  }
  const start = match.index + match[0].length;
  let index = start;
  while (declarations[index] !== ";") {
    index = declarations[index] in OPENERS ? closingIndex(declarations, index) + 1 : index + 1;
  }
  return normalize(declarations.slice(start, index));
}

function declaredClassHeader(declarations, name) {
  const match = new RegExp(`declare class ${name}\\b([^{]*)\\{`).exec(declarations);
  return match === null ? undefined : normalize(`class ${name}${match[1]}`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesWithElision(documented, declared) {
  const pattern = documented.split("...").map(escapeRegExp).join("[\\s\\S]*");
  return new RegExp(`^${pattern}$`).test(declared);
}

function signatureBlocks(suffix) {
  const pages = JSON.parse(readRepoFile("apps/docs/content/docs/sdk/meta.json")).pages;
  return pages.flatMap((page) => {
    const path = `apps/docs/content/docs/sdk/${page}${suffix}.mdx`;
    return [...readRepoFile(path).matchAll(SIGNATURE_BLOCK)].map((match) => ({
      path,
      code: stripComments(match[1]),
    }));
  });
}

function functionDrift(declarations, code) {
  const name = /^function (\w+)/.exec(code)?.[1];
  const documented = parseFunctionAt(code, code.indexOf(name) + name.length);
  const overloads = declaredFunctions(declarations, name);
  if (overloads.length === 0) {
    return `${name}: no declared function of that name`;
  }
  const matches = overloads.some(
    (overload) =>
      overload.returns === documented.returns &&
      JSON.stringify(overload.parameters) === JSON.stringify(documented.parameters),
  );
  return matches
    ? undefined
    : `${name}: documented ${JSON.stringify(documented)} matches no declared overload ${JSON.stringify(overloads)}`;
}

function constDrift(declarations, code) {
  const [, name, type] = /^const (\w+): ([\s\S]*);\s*$/.exec(code) ?? [];
  const declared = declaredConstType(declarations, name);
  if (declared === undefined) {
    return `${name}: no declared const of that name`;
  }
  return matchesWithElision(normalize(type), declared)
    ? undefined
    : `${name}: documented ${normalize(type)}, declared ${declared}`;
}

function classDrift(declarations, code) {
  const header = normalize(code.replace(/\{[\s\S]*$/, "").replace(/;\s*$/, ""));
  const name = /^class (\w+)/.exec(header)?.[1];
  const declared = declaredClassHeader(declarations, name);
  return declared === header ? undefined : `${name}: documented ${header}, declared ${declared}`;
}

function signatureDrift(declarations, code) {
  const trimmed = code.trim();
  if (trimmed.startsWith("function ")) {
    return functionDrift(declarations, trimmed);
  }
  if (trimmed.startsWith("const ")) {
    return constDrift(declarations, trimmed);
  }
  if (trimmed.startsWith("class ")) {
    return classDrift(declarations, trimmed);
  }
  return `unrecognized signature block: ${trimmed.split("\n")[0]}`;
}

describe("the sdk reference Signature blocks match the published declarations", () => {
  const declarations = stripComments(readDeclarations());

  it("parses a declared overload set, so the comparison cannot pass vacuously", () => {
    expect(declaredFunctions(declarations, "defineConfig").length).toBeGreaterThan(1);
    expect(declaredFunctions(declarations, "translate")[0]?.parameters.map((p) => p.name)).toEqual([
      "input",
      "deps?",
    ]);
    expect(signatureDrift(declarations, "function redact(text: number): string;")).toBeDefined();
    expect(signatureDrift(declarations, "function redact(input: string): string;")).toBeDefined();
    expect(signatureDrift(declarations, "function redact(text: string): void;")).toBeDefined();
    expect(signatureDrift(declarations, "function redact(text: string): string;")).toBeUndefined();
    expect(signatureDrift(declarations, "const nodeAdapterFs: SdkFs;")).toBeDefined();
    expect(
      signatureDrift(
        declarations,
        "const scaffoldingMetadata: { readonly providerEnv: { ... }; };",
      ),
    ).toBeDefined();
    expect(signatureDrift(declarations, "const nodeAdapterFs: AdapterFs;")).toBeUndefined();
  });

  it.each(LOCALE_SUFFIXES)("every Signature block in sdk/*%s.mdx names a declaration", (suffix) => {
    const blocks = signatureBlocks(suffix);
    const drift = blocks
      .map(({ path, code }) => ({ path, drift: signatureDrift(declarations, code) }))
      .filter(({ drift }) => drift !== undefined);

    expect(blocks.length).toBeGreaterThanOrEqual(60);
    expect(drift).toEqual([]);
  });
});
