import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import { CLIENT_MESSAGE_NAMESPACES, pickClientMessages } from "./client-messages";

const DOCS_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [full] : [];
  });
}

const clientFiles = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(DOCS_ROOT, dir))).filter(
  (file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
);

function covered(namespace: string): boolean {
  return CLIENT_MESSAGE_NAMESPACES.some(
    (listed) => namespace === listed || namespace.startsWith(`${listed}.`),
  );
}

function lookup(messages: unknown, namespace: string): unknown {
  return namespace
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      messages,
    );
}

describe("client messages", () => {
  it("finds the client components that read translations", () => {
    expect(
      clientFiles.some((file) => readFileSync(file, "utf8").includes("useTranslations(")),
    ).toBe(true);
  });

  it.each(clientFiles.map((file) => [path.relative(DOCS_ROOT, file), file]))(
    "%s reads only namespaces the client provider receives",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      const calls = [...source.matchAll(/useTranslations\(([^)]*)\)/g)].map((match) => match[1]);
      for (const argument of calls) {
        const literal = argument?.match(/^\s*"([^"]+)"\s*$/)?.[1];
        expect(literal, `non-literal useTranslations(${argument}) in ${file}`).toBeDefined();
        expect(covered(literal ?? ""), `${literal} is not in CLIENT_MESSAGE_NAMESPACES`).toBe(true);
      }
    },
  );

  it.each(CLIENT_MESSAGE_NAMESPACES)("%s exists in the English catalog", (namespace) => {
    expect(lookup(en, namespace)).toBeTypeOf("object");
  });

  it("keeps the listed namespaces and drops everything else", () => {
    const picked = pickClientMessages(en);

    for (const namespace of CLIENT_MESSAGE_NAMESPACES) {
      expect(lookup(picked, namespace)).toEqual(lookup(en, namespace));
    }
    expect(lookup(picked, "landing.hero")).toBeUndefined();
    expect(lookup(picked, "legal.privacy")).toBeUndefined();
    expect(JSON.stringify(picked).length).toBeLessThan(JSON.stringify(en).length / 2);
  });

  it("merges sibling namespaces and skips a path the catalog lacks", () => {
    const messages = { a: { b: { x: "1" }, c: "2", d: "3" }, e: "4" };

    expect(pickClientMessages(messages, ["a.b", "a.c", "a.missing.deep", "e.f", "gone"])).toEqual({
      a: { b: { x: "1" }, c: "2" },
    });
  });
});
