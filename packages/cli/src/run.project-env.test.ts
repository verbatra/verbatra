import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StartMcpServerOptions } from "@verbatra/mcp";
import { loadConfigWithMeta, translate } from "@verbatra/sdk";
import type { StudioServerOptions } from "@verbatra/studio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeMcpHandle,
  makeMcpModule,
  makeStudioModule,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";
import type { RunHooks, Session } from "./types.js";

const FLAGS = [
  "VERBATRA_MCP_REDACT_VALUES",
  "VERBATRA_MCP_ALLOW_SPEND",
  "VERBATRA_STUDIO_ALLOW_SPEND",
  "VERBATRA_E2E_TARGET",
  "ANTHROPIC_API_KEY",
] as const;

function sessionHooks(): { hooks: RunHooks; session: () => Session | undefined } {
  let session: Session | undefined;
  const capture = (started: Session) => {
    session = started;
  };
  return {
    hooks: { onMcpSession: capture, onStudioSession: capture, onWatchSession: capture },
    session: () => session,
  };
}

describe("the root .env of a project started from a subdirectory", () => {
  let original: string;
  let saved: Record<string, string | undefined>;
  let root: string;

  beforeEach(() => {
    original = process.cwd();
    saved = Object.fromEntries(FLAGS.map((name) => [name, process.env[name]]));
    for (const name of FLAGS) {
      delete process.env[name];
    }
    root = realpathSync(mkdtempSync(join(tmpdir(), "verbatra-project-env-")));
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "locales"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "locales", "en.json"), JSON.stringify({ hello: "Hello" }));
    writeFileSync(join(root, "locales", "de.json"), JSON.stringify({ hello: "Hallo" }));
    writeFileSync(join(root, "locales", "fr.json"), JSON.stringify({ hello: "Bonjour" }));
    writeFileSync(
      join(root, ".verbatrarc.json"),
      JSON.stringify({
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "anthropic", options: { model: "m", maxTokens: 256 } },
      }),
    );
    process.chdir(join(root, "src"));
  });

  afterEach(() => {
    process.chdir(original);
    for (const name of FLAGS) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
    rmSync(root, { recursive: true, force: true });
  });

  async function startMcp(): Promise<StartMcpServerOptions[]> {
    const started: StartMcpServerOptions[] = [];
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async (options) => {
            started.push(options);
            return makeMcpHandle({ valuesRedacted: options.redactValues === true });
          },
        }),
    });
    const captured = sessionHooks();
    const done = run(["mcp"], deps, captureStreams().streams, captured.hooks);
    await vi.waitFor(() => expect(captured.session()).toBeDefined());
    captured.session()?.requestStop();
    await done;
    return started;
  }

  it("redacts MCP values when only the root .env asks for it", async () => {
    writeFileSync(join(root, ".env"), "VERBATRA_MCP_REDACT_VALUES=1\n");

    const started = await startMcp();

    expect(started[0]?.redactValues).toBe(true);
  });

  it("advertises the MCP spend tools when only the root .env allows them", async () => {
    writeFileSync(join(root, ".env"), "VERBATRA_MCP_ALLOW_SPEND=1\n");

    const started = await startMcp();

    expect(started[0]?.allowSpend).toBe(true);
  });

  it("lets Studio spend when only the root .env allows it", async () => {
    writeFileSync(join(root, ".env"), "VERBATRA_STUDIO_ALLOW_SPEND=1\n");
    const started: StudioServerOptions[] = [];
    const { deps } = recordingDeps({
      loadConfigWithMeta,
      importStudio: async () =>
        makeStudioModule({
          startStudioServer: async (options) => {
            started.push(options);
            return { url: "http://127.0.0.1:5849/", port: 5849, close: async () => {} };
          },
        }),
    });
    const captured = sessionHooks();

    const done = run(["studio"], deps, captureStreams().streams, captured.hooks);
    await vi.waitFor(() => expect(captured.session()).toBeDefined());
    captured.session()?.requestStop();
    await done;

    expect(started[0]?.spend).toBe(true);
    expect(started[0]?.cwd).toBe(root);
  });

  it("loads the root .env before watch starts", async () => {
    writeFileSync(join(root, ".env"), "ANTHROPIC_API_KEY=from-the-root\n");
    const { deps } = recordingDeps({
      loadConfigWithMeta,
      watch: async (input) => {
        input.onReady?.();
        return { stop: async () => {} };
      },
    });
    const captured = sessionHooks();

    const done = run(["watch"], deps, captureStreams().streams, captured.hooks);
    await vi.waitFor(() => expect(captured.session()).toBeDefined());
    captured.session()?.requestStop();
    await done;

    expect(process.env.ANTHROPIC_API_KEY).toBe("from-the-root");
  });

  it("gives a TypeScript config the root .env's values before it is evaluated", async () => {
    rmSync(join(root, ".verbatrarc.json"));
    writeFileSync(
      join(root, "verbatra.config.ts"),
      `export default {
  sourceLocale: "en",
  targetLocales: [process.env.VERBATRA_E2E_TARGET ?? "de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "none" },
};
`,
    );
    writeFileSync(join(root, ".env"), "VERBATRA_E2E_TARGET=fr\n");
    const cap = captureStreams();

    await run(
      ["translate", "--dry-run", "--json"],
      recordingDeps({ loadConfigWithMeta, translate }).deps,
      cap.streams,
    );
    const envelope = parseEnvelope(cap.out().trim().split("\n").at(-1) ?? "") as {
      result: { locales: { locale: string }[] };
    };

    expect(envelope.result.locales.map((locale) => locale.locale)).toEqual(["fr"]);
  });
});
