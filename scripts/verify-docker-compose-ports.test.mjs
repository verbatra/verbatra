import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = "docker-compose.yml";
const LOOPBACK_PUBLISH = /^127\.0\.0\.1:\d+:\d+(\/tcp)?$/;

function composeServices() {
  const compose = parse(readFileSync(resolve(REPO_ROOT, COMPOSE_FILE), "utf8"));
  return Object.entries(compose.services ?? {});
}

function longSyntaxIsLoopback(port) {
  return port.host_ip === "127.0.0.1" && port.published !== undefined;
}

describe(`${COMPOSE_FILE} publishes ports on loopback only`, () => {
  it("publishes the docs app as 127.0.0.1:3000:3000", () => {
    const docs = Object.fromEntries(composeServices()).docs;
    expect(docs?.ports).toEqual(["127.0.0.1:3000:3000"]);
  });

  it.each(composeServices())(
    "service %s binds every published port to 127.0.0.1",
    (_name, service) => {
      for (const port of service?.ports ?? []) {
        if (typeof port === "object") {
          expect(longSyntaxIsLoopback(port)).toBe(true);
        } else {
          expect(String(port)).toMatch(LOOPBACK_PUBLISH);
        }
      }
      expect(service?.network_mode).not.toBe("host");
    },
  );
});
