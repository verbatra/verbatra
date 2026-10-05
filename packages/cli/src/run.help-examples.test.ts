import { describe, expect, it } from "vitest";
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
