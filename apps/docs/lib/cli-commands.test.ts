import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMAND_GROUPS, LANDING_COMMANDS } from "@/lib/cli-commands";
import { i18n } from "@/lib/i18n";

type MessageTree = { [key: string]: string | MessageTree };

function registeredCommands(): ReadonlyArray<string> {
  const source = readFileSync(
    fileURLToPath(new URL("../../../packages/cli/src/run.ts", import.meta.url)),
    "utf8",
  );
  return [...source.matchAll(/\.command\("([a-z-]+)"\)/g)].map((match) => match[1] as string);
}

function commandDescriptions(locale: string): MessageTree {
  const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
  const doc = JSON.parse(readFileSync(path, "utf8")) as MessageTree;
  const landing = doc.landing as MessageTree;
  const commands = landing.commands as MessageTree;
  return commands.items as MessageTree;
}

describe("landing command coverage", () => {
  const registered = registeredCommands();

  it("finds the command table in the CLI source", () => {
    expect(registered.length).toBeGreaterThan(0);
    expect(registered).toContain("translate");
  });

  it("lists every command run.ts registers, and nothing it does not", () => {
    expect([...LANDING_COMMANDS].toSorted()).toEqual([...registered].toSorted());
  });

  it("names each command exactly once across the groups", () => {
    expect(new Set(LANDING_COMMANDS).size).toBe(LANDING_COMMANDS.length);
  });

  it("gives every group at least one command", () => {
    for (const group of COMMAND_GROUPS) {
      expect(group.commands.length).toBeGreaterThan(0);
    }
  });

  for (const locale of i18n.languages) {
    it(`${locale} describes every listed command`, () => {
      const items = commandDescriptions(locale);
      for (const command of LANDING_COMMANDS) {
        expect(typeof items[command], `landing.commands.items.${command}`).toBe("string");
      }
      expect(Object.keys(items).toSorted()).toEqual([...LANDING_COMMANDS].toSorted());
    });
  }
});
