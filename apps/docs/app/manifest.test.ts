import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_COLORS } from "@/lib/theme";
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

  it.each([
    ["/icon-192.png", "public/icon-192.png"],
    ["/icon-512.png", "public/icon-512.png"],
    ["/icon-maskable-512.png", "public/icon-maskable-512.png"],
  ])("declares the size %s actually has", (src, file) => {
    const icon = icons.find((entry) => entry.src === src);
    expect(icon?.type).toBe("image/png");
    expect(icon?.sizes).toBe(pngSize(join(process.cwd(), file)));
  });

  it("offers the install sizes 192 and 512, a scalable icon and one maskable icon", () => {
    const sizes = icons.flatMap((icon) => icon.sizes?.split(" ") ?? []);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512", "any"]));
    expect(icons.filter((icon) => icon.purpose === "maskable")).toHaveLength(1);
    const svg = icons.find((icon) => icon.src === "/icon.svg");
    expect(svg?.type).toBe("image/svg+xml");
    expect(readFileSync(join(process.cwd(), "app/icon.svg"), "utf8")).toMatch(/^<svg /);
  });
});

describe("web app manifest colors", () => {
  it("paints the installed app in the default dark theme", () => {
    expect(manifest().theme_color).toBe(THEME_COLORS.dark);
    expect(manifest().background_color).toBe(THEME_COLORS.dark);
  });

  it("keeps the icons the browser fetches during the first load small", () => {
    for (const file of ["app/favicon.ico", "app/apple-icon.png", "app/icon.svg"]) {
      expect(readFileSync(join(process.cwd(), file)).byteLength, file).toBeLessThan(8 * 1024);
    }
  });
});
