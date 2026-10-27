import { AdapterError, type SyntaxPosition } from "../errors.js";

const OFFSET_IN_MESSAGE = /\bat position (\d+)\b/;
const UNEXPECTED_END = /Unexpected end of JSON input/;

export function positionAt(content: string, offset: number): SyntaxPosition {
  const bounded = Math.max(0, Math.min(offset, content.length));
  const before = content.slice(0, bounded);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, column: bounded - lineStart + 1 };
}

function syntaxErrorOffset(content: string, message: string): number | undefined {
  const reported = OFFSET_IN_MESSAGE.exec(message)?.[1];
  if (reported !== undefined) {
    return Number(reported);
  }
  return UNEXPECTED_END.test(message) ? content.length : undefined;
}

export function jsonSyntaxPosition(content: string): SyntaxPosition | undefined {
  try {
    JSON.parse(content);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const offset = syntaxErrorOffset(content, message);
    return offset === undefined ? undefined : positionAt(content, offset);
  }
}

export function describePosition(message: string, position: SyntaxPosition | undefined): string {
  if (position === undefined) {
    return message;
  }
  const where = `(line ${position.line}, column ${position.column})`;
  return message.endsWith(".") ? `${message.slice(0, -1)} ${where}.` : `${message} ${where}`;
}

export function invalidJson(content: string, message: string): AdapterError {
  const position = jsonSyntaxPosition(content);
  return new AdapterError(
    "INVALID_JSON",
    describePosition(message, position),
    position === undefined ? undefined : { position },
  );
}
