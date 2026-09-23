import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = "docker-compose.yml";
const ROTATING_DRIVERS = new Set(["json-file", "local"]);

function readCompose() {
  return readFileSync(resolve(REPO_ROOT, COMPOSE_FILE), "utf8");
}

function serviceBlocks(yamlText) {
  const services = /^services:\n([\s\S]*?)(?=^\S|(?![\s\S]))/m.exec(yamlText)?.[1] ?? "";
  return [...services.matchAll(/^ {2}([\w.-]+):\n((?: {4}.*\n?|\s*\n)*)/gm)].map((match) => ({
    name: match[1],
    body: match[2],
  }));
}

function loggingOf(serviceBody) {
  const block = /^ {4}logging:\n((?: {6}.*\n?)*)/m.exec(serviceBody)?.[1] ?? "";
  const driver = /^ {6}driver:\s*"?([\w-]+)"?\s*$/m.exec(block)?.[1];
  const option = (name) => new RegExp(`^ {8}${name}:\\s*"?([^"\\s]+)"?\\s*$`, "m").exec(block)?.[1];
  return { driver, maxSize: option("max-size"), maxFile: option("max-file") };
}

describe(`${COMPOSE_FILE} keeps container log rotation configured`, () => {
  const services = serviceBlocks(readCompose());

  it("finds at least one service to check", () => {
    expect(services.map((service) => service.name)).toContain("docs");
  });

  it.each(services.map((service) => [service.name, service.body]))(
    "service %s logs through a rotating driver with a size and file-count bound",
    (_name, body) => {
      const { driver, maxSize, maxFile } = loggingOf(body);

      expect(ROTATING_DRIVERS.has(driver ?? "")).toBe(true);
      expect(maxSize).toMatch(/^[1-9]\d*[kmg]$/i);
      expect(Number(maxFile)).toBeGreaterThanOrEqual(1);
    },
  );

  it("bounds the docs container log at three files of 10 MB, as the privacy policy states", () => {
    const docs = services.find((service) => service.name === "docs");

    expect(loggingOf(docs?.body ?? "")).toEqual({
      driver: "json-file",
      maxSize: "10m",
      maxFile: "3",
    });
  });
});
