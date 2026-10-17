import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = "docker-compose.yml";
const POLICY_LOCALES = ["en", "de", "es", "fr"];
const ROTATING_DRIVERS = new Set(["json-file", "local"]);

const POLICY_BOUND = {
  en: (files, megabytes) => `limited to ${files} files of ${megabytes} MB each`,
  de: (files, megabytes) => `auf ${files} Dateien mit je ${megabytes} MB begrenzt`,
  es: (files, megabytes) => `limitado a ${files} archivos de ${megabytes} MB cada uno`,
  fr: (files, megabytes) => `limité à ${files} fichiers de ${megabytes} Mo chacun`,
};

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function composeServices() {
  return Object.entries(parse(readRepoFile(COMPOSE_FILE)).services ?? {});
}

function docsLogging() {
  return parse(readRepoFile(COMPOSE_FILE)).services?.docs?.logging;
}

function hostingSection(locale) {
  return JSON.parse(readRepoFile(`apps/docs/messages/${locale}.json`)).legal.privacy.s3.body;
}

describe(`${COMPOSE_FILE} keeps container log rotation configured`, () => {
  it("finds the docs service", () => {
    expect(composeServices().map(([name]) => name)).toContain("docs");
  });

  it.each(composeServices())(
    "service %s logs through a rotating driver with a size and file-count bound",
    (_name, service) => {
      const logging = service?.logging;

      expect(ROTATING_DRIVERS.has(logging?.driver)).toBe(true);
      expect(String(logging?.options?.["max-size"])).toMatch(/^[1-9]\d*m$/);
      expect(String(logging?.options?.["max-file"])).toMatch(/^[1-9]\d*$/);
    },
  );
});

describe("the privacy policy states the container log bound the compose file configures", () => {
  it.each(POLICY_LOCALES)("%s section 3 names the configured file count and size", (locale) => {
    const options = docsLogging()?.options ?? {};
    const files = String(options["max-file"]);
    const megabytes = String(options["max-size"]).replace(/m$/, "");

    expect(hostingSection(locale)).toContain(POLICY_BOUND[locale](files, megabytes));
  });
});
