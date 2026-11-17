import { ProviderError } from "../errors.js";

const NO_OUTPUT_MESSAGE = "The provider returned no translation output.";
const NOT_JSON_MESSAGE = "The provider returned translation output that is not valid JSON.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstText(content: readonly unknown[]): string | undefined {
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return undefined;
}

export function readStructuredOutput(content: readonly unknown[]): unknown {
  const text = firstText(content);
  if (text === undefined || text.trim() === "") {
    throw new ProviderError("INVALID_RESPONSE", NO_OUTPUT_MESSAGE);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("INVALID_RESPONSE", NOT_JSON_MESSAGE);
  }
}
