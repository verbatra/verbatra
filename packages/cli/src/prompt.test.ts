import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { askLine, stdinIsTty } from "./prompt.js";
import { redactingStreams } from "./redacting-streams.js";
import { captureStreams } from "./test-support.js";

describe("askLine: prompts go through the Streams", () => {
  it("writes the question to the out stream and resolves with the trimmed answer", async () => {
    const cap = captureStreams();
    const input = new PassThrough();

    const answer = askLine("Provider? ", cap.streams, input);
    input.write("  gemini  \n");

    expect(await answer).toBe("gemini");
    expect(cap.out()).toBe("Provider? ");
    expect(cap.err()).toBe("");
  });

  it("passes the question through the redacting streams it is given", async () => {
    const cap = captureStreams();
    const input = new PassThrough();
    const key = `sk-ant-${"a".repeat(40)}`;

    const answer = askLine(`Key ${key}? `, redactingStreams(cap.streams), input);
    input.end("\n");

    expect(await answer).toBe("");
    expect(cap.out()).not.toContain(key);
  });
});

describe("stdinIsTty", () => {
  it("reports whether the process stdin is a terminal", () => {
    expect(stdinIsTty()).toBe(process.stdin.isTTY === true);
  });
});
