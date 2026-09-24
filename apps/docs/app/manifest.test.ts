import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

function icoSizes(file: string): string {
  const bytes = readFileSync(file);
  const count = bytes.readUInt16LE(4);
  const sizes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes.readUInt8(entry) || 256;
    const height = bytes.readUInt8(entry + 1) || 256;
    sizes.push(`${width}x${height}`);
  }
  return sizes.join(" ");
}

function pngSize(file: string): string {
  const bytes = readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("web app manifest icons", () => {
  const icons = manifest().icons ?? [];

  it("declares the sizes the favicon actually contains", () => {
    const favicon = icons.find((icon) => icon.src === "/favicon.ico");
    expect(favicon?.type).toBe("image/x-icon");
    expect(favicon?.sizes).toBe(icoSizes(join(process.cwd(), "app/favicon.ico")));
  });

  it("declares the size the apple icon actually has", () => {
    const apple = icons.find((icon) => icon.src === "/apple-icon.png");
    expect(apple?.sizes).toBe(pngSize(join(process.cwd(), "app/apple-icon.png")));
  });
});
