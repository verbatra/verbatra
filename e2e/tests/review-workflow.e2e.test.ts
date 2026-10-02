import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  makeConsumer,
  parseEnvelope,
  pollUntil,
  readJsonIn,
  runVerbatra,
  type Subprocess,
  spawnVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

const BANNER_URL_PATTERN = /Verbatra Studio running at (\S+)/;

const VALUES = {
  greeting: "Hallo",
  farewell: "Auf Wiedersehen",
  title: "Titel",
  subtitle: "Untertitel",
} as const;

interface ReviewCheck {
  readonly inSync: boolean;
  readonly review: { reviewed: boolean; unreviewed: number; code?: string };
  readonly locales: readonly {
    locale: string;
    missing: number;
    review: { unreviewed: readonly string[] };
  }[];
}

async function scaffoldProject(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, "locales/en.json", {
    greeting: "Hello",
    farewell: "Goodbye",
    title: "Title",
    subtitle: "Subtitle",
  });
  await writeJsonIn(dir, "locales/de.json", {});
  await writeFileIn(
    dir,
    "verbatra.config.ts",
    `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "none", options: {} },\n});\n`,
  );
}

interface RpcSession {
  readonly call: (method: string, params: unknown) => Promise<unknown>;
}

async function openSession(url: string): Promise<RpcSession> {
  const bootstrap = await fetch(url, { redirect: "manual" });
  const cookie = (bootstrap.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const origin = new URL(url).origin;
  return {
    call: async (method, params) => {
      const response = await fetch(new URL("/rpc", url), {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ method, params }),
      });
      const body = (await response.json()) as { ok: boolean; result?: unknown; error?: unknown };
      if (!body.ok) {
        throw new Error(`${method} failed: ${JSON.stringify(body.error)}`);
      }
      return body.result;
    },
  };
}

async function reviewInStudio(consumer: Consumer, dir: string): Promise<void> {
  const studio: Subprocess = spawnVerbatra(consumer, ["studio", "--cwd", dir]);
  let stdout = "";
  studio.stdout?.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  try {
    await pollUntil(() => BANNER_URL_PATTERN.test(stdout), { timeoutMs: 60_000, intervalMs: 250 });
    const session = await openSession(BANNER_URL_PATTERN.exec(stdout)?.[1] as string);
    for (const [key, value] of Object.entries(VALUES)) {
      await session.call("translation.editEntry", { locale: "de", key, value, actor: "agent" });
    }
    const queued = (await session.call("review.queue", {})) as {
      locales: { needsReview: { key: string; provenance: { origin: string } }[] }[];
    };
    expect(queued.locales[0]?.needsReview.map((entry) => entry.key)).toEqual(Object.keys(VALUES));
    expect(queued.locales[0]?.needsReview[0]?.provenance.origin).toBe("agent");

    for (const key of ["greeting", "farewell"] as const) {
      await session.call("review.approve", { locale: "de", key, expectedValue: VALUES[key] });
    }
    await session.call("review.reject", {
      locale: "de",
      key: "title",
      expectedValue: VALUES.title,
    });
  } finally {
    studio.kill("SIGINT");
    await studio;
  }
}

async function checkReviewed(consumer: Consumer, dir: string): Promise<ReviewCheck> {
  const result = await runVerbatra(consumer, [
    "check",
    "--require-reviewed",
    "--json",
    "--cwd",
    dir,
  ]);
  expect(result.exitCode).toBe(1);
  const envelope = parseEnvelope<ReviewCheck>(result.stdout);
  if (!envelope.ok) {
    throw new Error(`check failed: ${envelope.code}`);
  }
  return envelope.result;
}

describe("persisted review workflow (no key)", () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await makeConsumer({ withStudio: true });
  }, 180_000);

  it("shares Studio's approvals and rejection with a teammate's check --require-reviewed", async () => {
    const dir = join(consumer.dir, "review-workflow");
    await scaffoldProject(dir);

    await reviewInStudio(consumer, dir);

    const teammate = join(consumer.dir, "review-workflow-teammate");
    await cp(dir, teammate, {
      recursive: true,
      filter: (path) => !path.includes(".verbatra-local") && !path.includes("node_modules"),
    });

    const mine = await checkReviewed(consumer, dir);
    const theirs = await checkReviewed(consumer, teammate);

    expect(theirs).toEqual(mine);
    expect(theirs.review).toEqual({ reviewed: false, unreviewed: 1, code: "REVIEW_REQUIRED" });
    expect(theirs.locales[0]?.review.unreviewed).toEqual(["subtitle"]);
    expect(theirs.locales[0]?.missing).toBe(1);
    expect(await readJsonIn(teammate, "locales/de.json")).toEqual({
      greeting: VALUES.greeting,
      farewell: VALUES.farewell,
      subtitle: VALUES.subtitle,
    });

    const human = await runVerbatra(consumer, ["check", "--require-reviewed", "--cwd", teammate]);
    expect(human.stdout).toContain(
      "review: failed [REVIEW_REQUIRED] 1 machine-written translation not approved",
    );
    expect(human.stdout).toContain("  de: 1 unreviewed: subtitle");
  }, 180_000);
});
