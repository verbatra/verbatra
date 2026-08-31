import type { CreateProvider } from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { startStudioServer } from "./create-studio-server.js";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  stubLoader,
  withServer,
} from "./test-support.js";
import type { CreateStudioWatcher, StudioServer, StudioWatcher } from "./types.js";

const TOKEN = "sse-test-token-0123456789abcdef01234567";

function multiWatcherHarness() {
  const calls: { paths: readonly string[]; listener?: () => void }[] = [];
  const createWatcher: CreateStudioWatcher = (paths): StudioWatcher => {
    const call: { paths: readonly string[]; listener?: () => void } = { paths };
    calls.push(call);
    return {
      onChange: (listener) => {
        call.listener = listener;
      },
      close: async () => {},
    };
  };
  return {
    createWatcher,
    emit(index: number): void {
      calls[index]?.listener?.();
    },
  };
}

type SseReader = ReadableStreamDefaultReader<Uint8Array>;

async function readFrames(reader: SseReader, count: number): Promise<string[]> {
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: string[] = [];
  while (frames.length < count) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      frames.push(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  return frames;
}

async function readUntilDone(reader: SseReader): Promise<string[]> {
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: string[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      frames.push(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  return frames;
}

async function connectEvents(url: string, cookie: string, signal: AbortSignal): Promise<Response> {
  return fetch(`${url}events`, { headers: { Cookie: cookie }, signal });
}

describe("GET /events: authentication", () => {
  it(
    "requires the session cookie, exactly like every other GET route",
    () =>
      withServer(async (server) => {
        const response = await fetch(`${server.url}events`);
        expect(response.status).toBe(401);
      }),
    5000,
  );

  it(
    "opens a text/event-stream response for an authenticated client",
    () =>
      withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const controller = new AbortController();
          try {
            const response = await connectEvents(server.url, cookie, controller.signal);
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("text/event-stream");
            expect(response.headers.get("cache-control")).toBe("no-store");
          } finally {
            controller.abort();
          }
        },
        { token: TOKEN },
      ),
    5000,
  );
});

describe("GET /events: refresh delivery", () => {
  const harness = multiWatcherHarness();

  it(
    "a debounced watcher change reaches a connected client as a correctly tagged refresh frame",
    () =>
      withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const controller = new AbortController();
          const response = await connectEvents(server.url, cookie, controller.signal);
          const reader = response.body?.getReader();
          expect(reader).toBeDefined();
          if (reader === undefined) {
            controller.abort();
            return;
          }
          try {
            await readFrames(reader, 1);

            harness.emit(0);

            const frames = await readFrames(reader, 1);
            const refreshFrame = frames.find((frame) => frame.includes("event: refresh"));
            expect(refreshFrame).toBeDefined();
            expect(refreshFrame).toContain('"reason":"source"');
          } finally {
            await reader.cancel();
            controller.abort();
          }
        },
        { token: TOKEN, createWatcher: harness.createWatcher },
      ),
    5000,
  );
});

describe("GET /events: secret sweep", () => {
  const SENTINELS = {
    ANTHROPIC_API_KEY: "sentinel-anthropic-sse-1a2b3c",
    OPENAI_API_KEY: "sentinel-openai-sse-4d5e6f",
    GEMINI_API_KEY: "sentinel-gemini-sse-7a8b9c",
    DEEPL_API_KEY: "sentinel-deepl-sse-0d1e2f",
    GOOGLE_TRANSLATE_API_KEY: "sentinel-google-translate-sse-3f4a5b",
  } as const;
  const ENV_VAR_NAMES = Object.keys(SENTINELS) as (keyof typeof SENTINELS)[];
  const originalValues: Record<string, string | undefined> = {};

  function plantSentinels(): void {
    for (const name of ENV_VAR_NAMES) {
      originalValues[name] = process.env[name];
      process.env[name] = SENTINELS[name];
    }
  }

  function restoreSentinels(): void {
    for (const name of ENV_VAR_NAMES) {
      const value = originalValues[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }

  it("no sentinel substring appears in any frame of a real refresh delivered over SSE", async () => {
    plantSentinels();
    const harness = multiWatcherHarness();
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const controller = new AbortController();
          const response = await connectEvents(server.url, cookie, controller.signal);
          const reader = response.body?.getReader();
          expect(reader).toBeDefined();
          if (reader === undefined) {
            controller.abort();
            return;
          }
          try {
            await readFrames(reader, 1);
            harness.emit(0);
            const frames = await readFrames(reader, 1);
            const combined = frames.join("\n");
            for (const sentinel of Object.values(SENTINELS)) {
              expect(combined).not.toContain(sentinel);
            }
          } finally {
            await reader.cancel();
            controller.abort();
          }
        },
        { token: TOKEN, createWatcher: harness.createWatcher },
      );
    } finally {
      restoreSentinels();
    }
  }, 5000);
});

describe("GET /events: no sentinel leaks through the refresh event a retranslateEntry write triggers", () => {
  it("the refresh frame delivered after a successful retranslateEntry call carries no sentinel from the provider's own output", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "Hello {{name}}" },
    );
    const harness = multiWatcherHarness();
    const sentinel = "sentinel-provider-output-sse-9e7b3a";
    const stubCreateProvider: CreateProvider = () => ({
      id: "stub",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async (request) => ({
        values: new Map(request.entries.map((entry) => [entry.key, `Hallo {{name}} ${sentinel}`])),
        integrity: new Map(),
      }),
    });

    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const controller = new AbortController();
          const response = await connectEvents(server.url, cookie, controller.signal);
          const reader = response.body?.getReader();
          expect(reader).toBeDefined();
          if (reader === undefined) {
            controller.abort();
            return;
          }
          try {
            await readFrames(reader, 1);

            const rpcResponse = await fetch(new URL("/rpc", server.url), {
              method: "POST",
              headers: {
                Cookie: cookie,
                "Content-Type": "application/json",
                Origin: server.url.replace(/\/$/, ""),
              },
              body: JSON.stringify({
                method: "translation.retranslateEntry",
                params: { locale: "de", key: "greeting" },
              }),
            });
            const rpcBody = (await rpcResponse.json()) as {
              ok: boolean;
              result?: { accepted: boolean };
            };
            expect(rpcBody).toMatchObject({ ok: true, result: { accepted: true } });

            harness.emit(1);
            const frames = await readFrames(reader, 1);
            const combined = frames.join("\n");
            expect(combined).toContain("event: refresh");
            expect(combined).not.toContain(sentinel);
          } finally {
            await reader.cancel();
            controller.abort();
          }
        },
        {
          token: TOKEN,
          cwd: project.root,
          loader: fixtureLoader(project),
          createWatcher: harness.createWatcher,
          spend: true,
          createProvider: stubCreateProvider,
        },
      );
    } finally {
      await project.cleanup();
    }
  }, 5000);
});

describe("shutdown: the SSE stream", () => {
  let server: StudioServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("writes the shutdown frame as the final payload, ends the stream, and still closes within 2 seconds", async () => {
    server = await startStudioServer({ port: 0, token: TOKEN, loader: stubLoader() });
    const cookie = await authenticatedCookie(server.url, TOKEN);
    const controller = new AbortController();
    const response = await connectEvents(server.url, cookie, controller.signal);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (reader === undefined) {
      controller.abort();
      return;
    }
    await readFrames(reader, 1);

    const start = Date.now();
    await server.close();
    const elapsed = Date.now() - start;
    server = undefined;

    expect(elapsed).toBeLessThan(2000);

    const remaining = await readUntilDone(reader);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.at(-1)).toContain("event: shutdown");
    controller.abort();
  }, 5000);
});
