import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { CliUsageError } from "./cli-usage-error.js";
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

describe("askLine: input that ends before an answer", () => {
  it("rejects with a usage error when the input ends without a line", async () => {
    const cap = captureStreams();
    const input = new PassThrough();

    const answer = askLine("Provider? ", cap.streams, input);
    input.end();

    const error = await answer.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliUsageError);
    expect(error).toMatchObject({ code: "MISSING_OPTIONS" });
    expect((error as CliUsageError).message).toContain('answer to "Provider?"');
    expect((error as CliUsageError).message).toContain("--yes");
  });

  it("rejects at once when the input already ended at an earlier prompt", async () => {
    const cap = captureStreams();
    const input = new PassThrough();
    const first = askLine("Provider? ", cap.streams, input);
    input.end("gemini\n");
    expect(await first).toBe("gemini");
    input.resume();
    await new Promise((resolve) => input.once("end", resolve));

    await expect(askLine("Model? ", cap.streams, input)).rejects.toMatchObject({
      code: "MISSING_OPTIONS",
    });
    expect(cap.out()).toBe("Provider? Model? ");
  });
});

describe("stdinIsTty", () => {
  it("reports whether the process stdin is a terminal", () => {
    expect(stdinIsTty()).toBe(process.stdin.isTTY === true);
  });
});
