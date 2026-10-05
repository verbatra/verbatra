import process from "node:process";
import { createInterface } from "node:readline/promises";
import { CliUsageError } from "./cli-usage-error.js";
import type { Streams } from "./types.js";

export function stdinIsTty(): boolean {
  return process.stdin.isTTY === true;
}

function inputEndedError(question: string): CliUsageError {
  return new CliUsageError(
    "MISSING_OPTIONS",
    `Input ended before init got an answer to "${question.trim()}". Answer each prompt, or pass the options as flags (add --yes to accept the defaults).`,
  );
}

function hasEnded(input: NodeJS.ReadableStream): boolean {
  return "readableEnded" in input && input.readableEnded === true;
}

export async function askLine(
  question: string,
  streams: Streams,
  input: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
  streams.out(question);
  if (hasEnded(input)) {
    throw inputEndedError(question);
  }
  const rl = createInterface({ input, terminal: false });
  const closed = new Promise<undefined>((resolve) => {
    rl.once("close", () => resolve(undefined));
  });
  try {
    const answer = await Promise.race([rl.question(""), closed]);
    if (answer === undefined) {
      throw inputEndedError(question);
    }
    return answer.trim();
  } finally {
    rl.close();
  }
}
