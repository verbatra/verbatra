import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import { createValueMarker, SdkError } from "@verbatra/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import { MCP_SERVER_INSTRUCTIONS, serverInstructions } from "./server-instructions.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  defaultAdapterRegistry,
  makeProject,
  makeTempDir,
  nodeFs,
  staticProject,
  writeJsonFile,
} from "./test-support.js";
import { buildToolRegistry } from "./tools/registry.js";

const CANARY = "QZXJ";

const MARKER = /^\[redacted length=\d+ hash=([0-9a-f]{16})\]$/;

function translated(key: string, value: string): string {
  return key === "greeting" ? `[x] ${CANARY}-placeholder-dropped` : `[x] ${value}`;
}

function echoingProvider(): TranslationProvider {
  return {
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    async translateBatch(request: TranslateRequest): Promise<TranslateResult> {
      return {
        values: new Map(
          request.entries.map((entry) => [entry.key, translated(entry.key, entry.value)]),
        ),
        integrity: new Map(),
        notices: [{ code: "FORMALITY_DOWNGRADED", message: `${CANARY} provider notice` }],
      };
    },
  };
}

function git(dir: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: `${CANARY} Author`,
      GIT_AUTHOR_EMAIL: "author@example.com",
      GIT_COMMITTER_NAME: `${CANARY} Committer`,
      GIT_COMMITTER_EMAIL: "committer@example.com",
    },
    stdio: "ignore",
  });
}

async function canaryProject(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.arb"), {
    "@@locale": "en",
    greeting: `${CANARY}-greet {name} with ${CANARY}term`,
    "@greeting": { description: `${CANARY}-description` },
    farewell: `${CANARY}-bye`,
    long: `${CANARY}-long text`,
    count: `{n, plural, one {${CANARY}-one} other {${CANARY}-other}}`,
    contact: `Mail ${CANARY}@verbatra-canary.dev`,
  });
  await writeJsonFile(join(dir, "locales", "de.arb"), {
    "@@locale": "de",
    greeting: `${CANARY}-de-greet {name}`,
    count: `{n, plural, other {${CANARY}-de-other <b>x</b>}}`,
  });
  await writeJsonFile(join(dir, "glossary.json"), {
    version: 2,
    terms: [
      {
        source: `${CANARY}term`,
        target: `${CANARY}-target`,
        targets: { de: `${CANARY}-de-target` },
        forbidden: { de: [`${CANARY}-forbidden`] },
        note: `${CANARY}-note`,
        partOfSpeech: `${CANARY}-pos`,
      },
    ],
    doNotTranslate: [`${CANARY}keep`],
  });
  git(dir, "init", "--quiet");
  git(dir, "add", "locales");
  git(dir, "commit", "--quiet", "-m", "add locale files");
  return dir;
}

async function rewrite(path: string, changes: Record<string, unknown>): Promise<void> {
  const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeJsonFile(path, { ...current, ...changes });
}

async function editOutsideVerbatra(dir: string): Promise<void> {
  await rewrite(join(dir, "locales", "en.arb"), {
    count: `{n, plural, one {${CANARY}-one <b>y</b>} other {${CANARY}-more <b>y</b>}}`,
    farewell: `${CANARY}-bye-changed`,
    long: `${CANARY}-long text.`,
  });
  await rewrite(join(dir, "locales", "de.arb"), { farewell: `${CANARY}-hand-edited` });
}

async function redactedClient(dir: string, logs: string[]): Promise<Client> {
  const server = createMcpServer({
    project: staticProject(
      baseLoadedConfig({
        config: baseVerbatraConfig({
          targetLocales: ["de", "fr"],
          format: "arb",
          files: { pattern: "locales/{locale}.arb" },
          humanEdits: "suggest",
          fuzzyCache: { enabled: true },
          sensitiveData: { mode: "block" },
        }),
        glossary: { source: "file", path: join(dir, "glossary.json") },
      }),
    ),
    cwd: dir,
    allowSpend: true,
    valueMarker: createValueMarker(),
    fs: nodeFs,
    createProvider: echoingProvider,
    onLog: (line) => logs.push(line),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

interface Call {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

interface Answer {
  readonly call: Call;
  readonly isError: boolean;
  readonly text: string;
  readonly structured: unknown;
}

async function ask(client: Client, call: Call): Promise<Answer> {
  const result = await client.callTool(call);
  const content = result.content as readonly { readonly text?: string }[];
  return {
    call,
    isError: result.isError === true,
    text: content.map((part) => part.text ?? "").join("\n"),
    structured: result.structuredContent,
  };
}

function structuredOf(answer: Answer): Record<string, unknown> {
  return answer.structured as Record<string, unknown>;
}

function hashOf(marker: unknown): string {
  const match = typeof marker === "string" ? MARKER.exec(marker) : null;
  if (match?.[1] === undefined) {
    throw new Error(`not a value marker: ${String(marker)}`);
  }
  return match[1];
}

const FIRST_RUN: readonly Call[] = [
  { name: "project.snapshot", arguments: {} },
  { name: "project.doctor", arguments: {} },
  { name: "lock.state", arguments: {} },
  { name: "status.check", arguments: {} },
  { name: "status.diff", arguments: {} },
  { name: "translation.estimate", arguments: {} },
  { name: "translation.translatePending", arguments: {} },
];

const READS: readonly Call[] = [
  { name: "review.queue", arguments: {} },
  { name: "usage.summary", arguments: {} },
  { name: "locale.values", arguments: {} },
  { name: "locale.values", arguments: { query: CANARY } },
  { name: "key.context", arguments: { locale: "de", key: "greeting" } },
  { name: "key.context", arguments: { locale: "de", key: "greeting", draft: `${CANARY}` } },
  { name: "report.provenance", arguments: { includeEntries: true } },
  { name: "history.list", arguments: {} },
  { name: "glossary.get", arguments: { locale: "de" } },
  { name: "glossary.write", arguments: { term: `${CANARY}new`, translation: `${CANARY}-new` } },
  {
    name: "glossary.write",
    arguments: { term: `${CANARY}term`, locale: "de", forbidden: [`${CANARY}-de-target`] },
  },
  {
    name: "translation.editEntry",
    arguments: { locale: "de", key: "farewell", value: `${CANARY}-edited` },
  },
  {
    name: "translation.editEntry",
    arguments: { locale: "de", key: "greeting", value: `${CANARY}-dropped-placeholder` },
  },
  { name: "translation.retranslateEntry", arguments: { locale: "de", key: "long" } },
  { name: "key.value", arguments: { locale: "xx-unknown", key: "greeting" } },
  { name: "key.value", arguments: { locale: "de", key: "missing.key" } },
];

describe("createMcpServer with redactValues: no value reaches the client", () => {
  const answers: Answer[] = [];
  const logs: string[] = [];
  const progress: string[] = [];
  let secondRun: Answer | undefined;
  let approvedReviewer: Answer | undefined;
  let instructions: string | undefined;

  beforeAll(async () => {
    const dir = await canaryProject();
    const client = await redactedClient(dir, logs);
    instructions = client.getInstructions();
    for (const call of FIRST_RUN) {
      answers.push(await ask(client, call));
    }
    await editOutsideVerbatra(dir);
    answers.push(await ask(client, { name: "key.integrity", arguments: { key: "count" } }));
    answers.push(await ask(client, { name: "locale.integrity", arguments: {} }));
    const pending = { name: "translation.translatePending", arguments: {} };
    const result = await client.callTool(pending, undefined, {
      onprogress: (update) => progress.push(JSON.stringify(update)),
    });
    secondRun = {
      call: pending,
      isError: result.isError === true,
      text: (result.content as readonly { readonly text?: string }[])
        .map((part) => part.text ?? "")
        .join("\n"),
      structured: result.structuredContent,
    };
    answers.push(secondRun);
    for (const call of READS) {
      answers.push(await ask(client, call));
    }
    const read = await ask(client, {
      name: "key.value",
      arguments: { locale: "fr", key: "farewell" },
    });
    answers.push(read);
    const expectedHash = hashOf(structuredOf(read).target);
    const reviewer = `${CANARY} Reviewer`;
    answers.push(
      await ask(client, {
        name: "review.approve",
        arguments: { locale: "fr", key: "farewell", expectedValue: "anything", reviewer },
      }),
    );
    answers.push(
      await ask(client, {
        name: "review.approve",
        arguments: { locale: "fr", key: "farewell", expectedHash: "0".repeat(16), reviewer },
      }),
    );
    answers.push(
      await ask(client, {
        name: "review.approve",
        arguments: { locale: "fr", key: "farewell", expectedHash, reviewer },
      }),
    );
    approvedReviewer = await ask(client, {
      name: "key.value",
      arguments: { locale: "fr", key: "farewell" },
    });
    answers.push(approvedReviewer);
    answers.push(
      await ask(client, {
        name: "review.reject",
        arguments: {
          locale: "fr",
          key: "long",
          expectedHash: hashOf(
            structuredOf(
              await ask(client, {
                name: "key.value",
                arguments: { locale: "fr", key: "long" },
              }),
            ).target,
          ),
          reviewer,
        },
      }),
    );
  }, 60_000);

  it("calls every tool the server registers", () => {
    const called = new Set(answers.map((answer) => answer.call.name));

    expect([...called].sort()).toEqual(
      buildToolRegistry(true)
        .map((tool) => tool.name)
        .sort(),
    );
  });

  it("puts no canary in any text or structured result, ok or failed", () => {
    for (const answer of answers) {
      expect(`${answer.call.name}: ${answer.text}`).not.toContain(CANARY);
      expect(`${answer.call.name}: ${JSON.stringify(answer.structured ?? null)}`).not.toContain(
        CANARY,
      );
    }
  });

  it("reaches every value-bearing field a run summary carries, and marks it", () => {
    const firstRun = answers.find((answer) => answer.call.name === "translation.translatePending");
    const firstLocales = JSON.stringify(structuredOf(firstRun as Answer).locales);
    const second = JSON.stringify(structuredOf(secondRun as Answer).locales);

    expect(firstLocales).toContain('{"key":"greeting","reason":"placeholder"}');
    expect(firstLocales).not.toContain('"details"');
    expect(second).toMatch(/"suggestion":"\[redacted length=\d+ hash=/);
    expect(second).toMatch(/"previousSource":"\[redacted length=\d+ hash=/);
    expect(second).toMatch(/"code":"FORMALITY_DOWNGRADED","message":"\[redacted length=\d+ hash=/);
  });

  it("withholds the flagged value and reports it by key name only", () => {
    const firstRun = answers.find((answer) => answer.call.name === "translation.translatePending");
    const locales = structuredOf(firstRun as Answer).locales as readonly {
      readonly locale: string;
      readonly sensitiveWithheld: readonly string[];
      readonly notices: readonly { readonly code: string; readonly message: string }[];
    }[];

    expect(locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
    for (const locale of locales) {
      expect(locale.sensitiveWithheld).toEqual(["contact"]);
      const withheld = locale.notices.find(
        (notice) => notice.code === "SENSITIVE_CONTENT_WITHHELD",
      );
      expect(withheld?.message).toMatch(MARKER);
    }
  });

  it("sends progress and log lines with no canary", () => {
    expect(progress.length).toBeGreaterThan(0);
    expect(logs.length).toBeGreaterThan(0);
    expect(progress.join("\n")).not.toContain(CANARY);
    expect(logs.join("\n")).not.toContain(CANARY);
  });

  it("answers glossary.write with counts, and redacts the text of a refused write", () => {
    const writes = answers.filter((answer) => answer.call.name === "glossary.write");

    expect(structuredOf(writes[0] as Answer)).toMatchObject({
      terms: [],
      doNotTranslate: [],
      redactedTerms: [],
      termCount: 2,
      doNotTranslateCount: 1,
    });
    expect(writes[1]?.isError).toBe(true);
    expect(writes[1]?.text).toContain("CONFIG_INVALID");
  });

  it("tells the agent about the markers and the hash in its instructions", () => {
    expect(instructions).toBe(serverInstructions({ valuesRedacted: true }));
    expect(instructions).toContain(MCP_SERVER_INSTRUCTIONS);
    expect(instructions).toContain("--redact-values");
    expect(instructions).toContain("expectedHash");
    expect(instructions).toContain("author names are left out of results");
    expect(serverInstructions({ valuesRedacted: false })).toBe(MCP_SERVER_INSTRUCTIONS);
  });

  it("says in project.snapshot that values are redacted", () => {
    const snapshot = answers.find((answer) => answer.call.name === "project.snapshot");

    expect(snapshot?.structured).toMatchObject({ valuesRedacted: true });
  });

  it("refuses the value-searching parameters as invalid input", () => {
    const refused = answers.filter(
      (answer) =>
        (answer.call.name === "locale.values" && "query" in answer.call.arguments) ||
        (answer.call.name === "key.context" && "draft" in answer.call.arguments),
    );

    expect(refused).toHaveLength(2);
    for (const answer of refused) {
      expect(answer.isError).toBe(true);
      expect(answer.text).toContain("this server redacts translation values");
    }
  });

  it("keeps the integrity verdicts and drops their free-text details", () => {
    const integrity = answers.find((answer) => answer.call.name === "key.integrity");
    const locales = structuredOf(integrity as Answer).locales as readonly {
      readonly locale: string;
      readonly entries: readonly Record<string, unknown>[];
    }[];
    const de = locales.find((locale) => locale.locale === "de");

    expect(de?.entries[0]).toMatchObject({ icuArmDetails: [], markupDetails: [] });
    expect(
      de?.entries.some((entry) => entry.icuArmsMatch === false || entry.markupMatches === false),
    ).toBe(true);
  });

  it("returns no author name from history.list", () => {
    const history = answers.find((answer) => answer.call.name === "history.list");
    const commits = structuredOf(history as Answer).commits as readonly Record<string, unknown>[];

    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      expect(commit).not.toHaveProperty("author");
      expect(commit.subject).toBe("add locale files");
    }
  });

  it("writes an edit and answers with a marker instead of the value", () => {
    const edit = answers.find(
      (answer) =>
        answer.call.name === "translation.editEntry" && answer.call.arguments.key === "farewell",
    );

    expect(edit?.isError).toBe(false);
    expect(structuredOf(edit as Answer).accepted).toBe(true);
    expect(structuredOf(edit as Answer).value).toMatch(MARKER);
  });

  it("drops the integrity details of a refused edit and keeps the reason", () => {
    const refused = answers.find(
      (answer) =>
        answer.call.name === "translation.editEntry" && answer.call.arguments.key === "greeting",
    );

    expect(structuredOf(refused as Answer)).toMatchObject({
      accepted: false,
      reason: "placeholder",
    });
    expect(structuredOf(refused as Answer)).not.toHaveProperty("details");
  });

  it("keeps key names and locale codes readable in the errors that name them", () => {
    const failed = answers.filter((answer) => answer.isError);
    const unknownLocale = failed.find((answer) => answer.call.arguments.locale === "xx-unknown");
    const unknownKey = failed.find((answer) => answer.call.arguments.key === "missing.key");
    const stale = answers.find(
      (answer) =>
        answer.call.name === "review.approve" &&
        answer.call.arguments.expectedHash === "0".repeat(16),
    );

    expect(unknownLocale?.text).toContain("xx-unknown");
    expect(unknownKey?.text).toContain('"missing.key"');
    expect(stale?.text).toContain('REVIEW_VALUE_CHANGED: The translation of "farewell" in fr');
  });

  it("records an approval from the marker's hash and refuses a stale one", () => {
    const approvals = answers.filter((answer) => answer.call.name === "review.approve");

    expect(approvals[0]?.isError).toBe(true);
    expect(approvals[0]?.text).toContain('Invalid input for field "expectedValue"');
    expect(approvals[1]?.isError).toBe(true);
    expect(approvals[1]?.text).toContain("REVIEW_VALUE_CHANGED");
    expect(approvals[2]?.isError).toBe(false);
    expect(structuredOf(approvals[2] as Answer).provenance).toMatchObject({
      reviewState: "approved",
    });
    expect(structuredOf(approvedReviewer as Answer).provenance).toMatchObject({
      reviewState: "approved",
    });
  });
});

type AdapterRegistry = typeof defaultAdapterRegistry;

function registryFailingReadsOf(locale: string): AdapterRegistry {
  return {
    resolve(filePath: string, options?: Parameters<AdapterRegistry["resolve"]>[1]) {
      const resolution = defaultAdapterRegistry.resolve(filePath, options);
      if (resolution.status !== "resolved") {
        return resolution;
      }
      const adapter = resolution.adapter;
      return {
        ...resolution,
        adapter: {
          ...adapter,
          read: (path: string, ...rest: unknown[]) =>
            path.endsWith(`${locale}.json`)
              ? Promise.reject(new Error(`${CANARY}-value quoted by a format plugin`))
              : (adapter.read as (path: string, ...rest: unknown[]) => unknown)(path, ...rest),
        },
      };
    },
  } as unknown as AdapterRegistry;
}

describe("createMcpServer with redactValues: translation.estimate", () => {
  it("marks a locale error message that quotes a value, and keeps the estimate", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {}, fr: {} });
    const server = createMcpServer({
      project: staticProject(
        baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }) }),
      ),
      cwd: dir,
      valueMarker: createValueMarker(),
      fs: nodeFs,
      adapterRegistry: registryFailingReadsOf("fr"),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const answer = await ask(client, { name: "translation.estimate", arguments: {} });

    expect(`${answer.text} ${JSON.stringify(answer.structured)}`).not.toContain(CANARY);
    expect(structuredOf(answer)).toMatchObject({
      failed: ["fr"],
      locales: [
        { locale: "de" },
        { locale: "fr", error: { code: "LOCALE_FAILED", message: expect.stringMatching(MARKER) } },
      ],
      estimate: {
        locales: [
          { locale: "de", keys: 1 },
          { locale: "fr", keys: 0 },
        ],
      },
    });
  });
});

describe("createMcpServer with redactValues and no usable config", () => {
  it("keeps a value quoted in the config error out of every answer and log line", async () => {
    const dir = await makeTempDir();
    const error = new SdkError(
      "CONFIG_INVALID",
      `The verbatra configuration is invalid: glossary.terms.1: repeats the term "${CANARY}-dup"`,
    );
    const state = { kind: "unconfigured", error } as const;
    const logs: string[] = [];
    const server = createMcpServer({
      project: { current: async () => state, latest: () => state },
      cwd: dir,
      valueMarker: createValueMarker(),
      fs: nodeFs,
      onLog: (line) => logs.push(line),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const answers = [
      await ask(client, { name: "project.snapshot", arguments: {} }),
      await ask(client, { name: "project.doctor", arguments: {} }),
      await ask(client, { name: "key.value", arguments: { locale: "de", key: "greeting" } }),
    ];

    expect(structuredOf(answers[0] as Answer)).toMatchObject({
      configured: false,
      valuesRedacted: true,
      configProblem: { code: "CONFIG_INVALID" },
    });
    expect(answers[2]?.isError).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    for (const answer of answers) {
      expect(`${answer.text} ${JSON.stringify(answer.structured ?? null)}`).not.toContain(CANARY);
    }
    expect(logs.join("\n")).not.toContain(CANARY);
  });
});
