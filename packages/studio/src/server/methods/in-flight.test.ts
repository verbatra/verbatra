import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { InFlightEntry } from "../in-flight-guard.js";
import type { RpcHandlerDeps } from "../rpc.js";
import { inFlightHandler } from "./in-flight.js";

const loaded = { config: {}, source: { kind: "override" }, glossary: { source: "none" } };

function deps(entries?: readonly InFlightEntry[]): RpcHandlerDeps {
  return {
    config: loaded as unknown as LoadedConfig,
    projectRoot: "/project",
    ...(entries !== undefined ? { inFlightEntries: () => entries } : {}),
  };
}

describe("inFlightHandler", () => {
  it("lists only the retranslations the server is still running", async () => {
    const result = await inFlightHandler(
      {},
      deps([
        { method: "translation.retranslateEntry", locale: "de", key: "a", elapsedMs: 1200 },
        { method: "translation.retranslateEntries", locale: "fr", key: "b", elapsedMs: 300 },
        { method: "translation.editEntry", locale: "de", key: "c", elapsedMs: 10 },
      ]),
    );

    expect(result).toEqual({
      retranslating: [
        { locale: "de", key: "a", elapsedMs: 1200 },
        { locale: "fr", key: "b", elapsedMs: 300 },
      ],
    });
  });

  it("reports nothing when the server tracks no calls", async () => {
    expect(await inFlightHandler({}, deps())).toEqual({ retranslating: [] });
  });
});
