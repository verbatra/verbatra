import process from "node:process";
import { createInterface } from "node:readline/promises";
import type { Streams } from "./types.js";

export function stdinIsTty(): boolean {
  return process.stdin.isTTY === true;
}

export async function askLine(
  question: string,
  streams: Streams,
  input: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
  streams.out(question);
  const rl = createInterface({ input, terminal: false });
  try {
    return (await rl.question("")).trim();
  } finally {
    rl.close();
  }
}
