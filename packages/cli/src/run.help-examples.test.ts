import { describe, expect, it } from "vitest";
import { AGENT_CLIENT_CONFIGS, AGENT_CLIENT_IDS, CLIENT_FLAG_VALUES } from "./agent-clients.js";
import { run } from "./run.js";
import { captureStreams, recordingDeps } from "./test-support.js";

async function helpOf(argv: readonly string[]): Promise<string> {
  const cap = captureStreams();
  await run([...argv], recordingDeps().deps, cap.streams);
  return cap.out();
}

async function registeredCommands(): Promise<readonly string[]> {
  const listing = (await helpOf(["--help"])).split("Commands:")[1] ?? "";
  return [...listing.matchAll(/^ {2}([a-z]+) \[options\]/gm)].map((match) => match[1] ?? "");
}

describe("command help", () => {
  it("lists the commands it checks, so the check below cannot pass vacuously", async () => {
    expect(await registeredCommands()).toEqual(expect.arrayContaining(["translate", "watch"]));
  });

  it("ends every command's help with an Examples block", async () => {
    const withoutExamples: string[] = [];
    for (const command of await registeredCommands()) {
      if (!(await helpOf([command, "--help"])).includes("\nExamples:\n  $ verbatra ")) {
        withoutExamples.push(command);
      }
    }

    expect(withoutExamples).toEqual([]);
  });
});

describe("init help", () => {
  it("names every client --agent can wire and every --client value", async () => {
    const help = (await helpOf(["init", "--help"])).replace(/\s+/g, " ");

    for (const id of AGENT_CLIENT_IDS) {
      expect(help).toContain(AGENT_CLIENT_CONFIGS[id].file);
    }
    expect(help).toContain(CLIENT_FLAG_VALUES.join(", "));
  });

  it("defers the --path fallback to the chosen format's layout", async () => {
    const help = (await helpOf(["init", "--help"])).replace(/\s+/g, " ");

    expect(help).toContain("else the format's default layout");
  });
});
