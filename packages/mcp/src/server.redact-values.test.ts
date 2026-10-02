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
import { beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import { MCP_SERVER_INSTRUCTIONS, serverInstructions } from "./server-instructions.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeTempDir,
  nodeFs,
  staticProject,
  writeJsonFile,
} from "./test-support.js";
import { buildToolRegistry } from "./tools/registry.js";

const CANARY = "CANARY";

const MARKER = /^\[redacted length=\d+ hash=([0-9a-f]{16})\]$/;

function echoingProvider(): TranslationProvider {
  return {
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    async translateBatch(request: TranslateRequest): Promise<TranslateResult> {
      return {
        values: new Map(request.entries.map((entry) => [entry.key, `[x] ${entry.value}`])),
        integrity: new Map(),
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
    long: `${CANARY}-long`,
    count: `{n, plural, one {${CANARY}-one} other {${CANARY}-other}}`,
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
        partOfSpeech: "noun",
      },
    ],
    doNotTranslate: [`${CANARY}keep`],
  });
  git(dir, "init", "--quiet");
  git(dir, "add", "locales");
  git(dir, "commit", "--quiet", "-m", "add locale files");
  return dir;
}

async function editSource(dir: string): Promise<void> {
  const path = join(dir, "locales", "en.arb");
  const source = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeJsonFile(path, {
    ...source,
    count: `{n, plural, one {${CANARY}-one <b>y</b>} other {${CANARY}-more <b>y</b>}}`,
  });
}

async function redactedClient(dir: string): Promise<Client> {
  const server = createMcpServer({
    project: staticProject(
      baseLoadedConfig({
        config: baseVerbatraConfig({
          targetLocales: ["de", "fr"],
          format: "arb",
          files: { pattern: "locales/{locale}.arb" },
        }),
        glossary: { source: "file", path: join(dir, "glossary.json") },
      }),
    ),
    cwd: dir,
    allowSpend: true,
    redactValues: true,
    fs: nodeFs,
    createProvider: echoingProvider,
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

const READS: readonly Call[] = [
  { name: "project.snapshot", arguments: {} },
  { name: "project.doctor", arguments: {} },
  { name: "lock.state", arguments: {} },
  { name: "status.check", arguments: {} },
  { name: "status.diff", arguments: {} },
  { name: "translation.estimate", arguments: {} },
  { name: "translation.translatePending", arguments: {} },
  { name: "review.queue", arguments: {} },
  { name: "usage.summary", arguments: {} },
  { name: "key.integrity", arguments: { key: "count" } },
  { name: "locale.integrity", arguments: {} },
  { name: "locale.values", arguments: {} },
  { name: "locale.values", arguments: { query: CANARY } },
  { name: "key.context", arguments: { locale: "de", key: "greeting" } },
  { name: "key.context", arguments: { locale: "de", key: "greeting", draft: `${CANARY}` } },
  { name: "report.provenance", arguments: { includeEntries: true } },
  { name: "history.list", arguments: {} },
  { name: "glossary.get", arguments: { locale: "de" } },
  { name: "glossary.write", arguments: { term: `${CANARY}new`, translation: `${CANARY}-new` } },
  {
    name: "translation.editEntry",
    arguments: { locale: "de", key: "farewell", value: `${CANARY}-edited` },
  },
  {
    name: "translation.editEntry",
    arguments: { locale: "de", key: "greeting", value: `${CANARY}-dropped-placeholder` },
  },
  { name: "translation.retranslateEntry", arguments: { locale: "de", key: "long" } },
];

describe("createMcpServer with redactValues: no value reaches the client", () => {
  const answers: Answer[] = [];
  let approvedReviewer: Answer | undefined;
  let instructions: string | undefined;

  beforeAll(async () => {
    const dir = await canaryProject();
    const client = await redactedClient(dir);
    instructions = client.getInstructions();
    for (const call of READS) {
      answers.push(await ask(client, call));
      if (call.name === "translation.translatePending") {
        await editSource(dir);
      }
    }
    const read = await ask(client, {
      name: "key.value",
      arguments: { locale: "fr", key: "long" },
    });
    answers.push(read);
    const expectedHash = hashOf(structuredOf(read).target);
    const reviewer = `${CANARY} Reviewer`;
    answers.push(
      await ask(client, {
        name: "review.approve",
        arguments: { locale: "fr", key: "long", expectedHash: "0".repeat(16), reviewer },
      }),
    );
    answers.push(
      await ask(client, {
        name: "review.approve",
        arguments: { locale: "fr", key: "long", expectedHash, reviewer },
      }),
    );
    approvedReviewer = await ask(client, {
      name: "key.value",
      arguments: { locale: "fr", key: "long" },
    });
    answers.push(approvedReviewer);
    answers.push(
      await ask(client, {
        name: "review.reject",
        arguments: {
          locale: "fr",
          key: "farewell",
          expectedHash: hashOf(
            structuredOf(
              await ask(client, {
                name: "key.value",
                arguments: { locale: "fr", key: "farewell" },
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

  it("tells the agent about the markers and the hash in its instructions", () => {
    expect(instructions).toBe(serverInstructions({ valuesRedacted: true }));
    expect(instructions).toContain(MCP_SERVER_INSTRUCTIONS);
    expect(instructions).toContain("--redact-values");
    expect(instructions).toContain("expectedHash");
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

  it("records an approval from the marker's hash and refuses a stale one", () => {
    const approvals = answers.filter((answer) => answer.call.name === "review.approve");

    expect(approvals[0]?.isError).toBe(true);
    expect(approvals[0]?.text).toContain("REVIEW_VALUE_CHANGED");
    expect(approvals[1]?.isError).toBe(false);
    expect(structuredOf(approvals[1] as Answer).provenance).toMatchObject({
      reviewState: "approved",
    });
    expect(structuredOf(approvedReviewer as Answer).provenance).toMatchObject({
      reviewState: "approved",
    });
  });
});
