import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { valueHash } from "../lock/provenance-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { type KeyHistoryResult, keyHistory } from "./key-history.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function repo(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  return fx;
}

function json(values: Record<string, string>): string {
  return `${JSON.stringify(values, null, 2)}\n`;
}

function available(result: KeyHistoryResult): Extract<KeyHistoryResult, { available: true }> {
  if (!result.available) {
    throw new Error(`unavailable: ${result.reason}`);
  }
  return result;
}

function run(fx: GitFixture, extra: { execFile?: GitExecFile; limit?: number } = {}) {
  return keyHistory(
    {
      config: baseConfig(),
      cwd: fx.root,
      locale: "de",
      key: "a",
      ...(extra.limit === undefined ? {} : { limit: extra.limit }),
    },
    extra.execFile === undefined ? {} : { execFile: extra.execFile },
  );
}

async function sourceHash(fx: GitFixture): Promise<string> {
  const read = await selectAdapter("i18next-json").read(join(fx.root, "locales/en.json"), "en");
  return contentHash(read.resource.entries.get("a") as never);
}

function lockWithPadding(hash: string, bytes: number): string {
  const text = (pad: string): string =>
    JSON.stringify({ version: 1, locales: { de: { a: hash, pad } } });
  return text("p".repeat(Math.max(0, bytes - text("").length)));
}

function provenanceWithPadding(value: string, bytes: number): string {
  const text = (pad: string): string =>
    JSON.stringify({
      version: 1,
      locales: {
        de: {
          a: { origin: "human", valueHash: valueHash(value) },
          [pad]: { origin: "human", valueHash: valueHash("x") },
        },
      },
    });
  return text("p".repeat(Math.max(0, bytes - text("").length)));
}

async function committedOnce(fx: GitFixture, files: Record<string, string>): Promise<void> {
  await fx.write("locales/en.json", json({ a: "A" }));
  await fx.write("locales/de.json", json({ a: "one" }));
  for (const [path, content] of Object.entries(files)) {
    await fx.write(path, content);
  }
  await fx.commitAll("one");
}

const MIB = 1024 * 1024;

describe("keyHistory lock file and provenance file limits", () => {
  it("reads a lock file just under 4 MiB", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await committedOnce(fx, {
      "verbatra.lock.json": lockWithPadding(await sourceHash(fx), 4 * MIB - 64),
    });

    const result = available(await run(fx));

    expect(result.revisions[0]?.sourceChanged).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it("does not read a lock file above 4 MiB, answers unknown and says so", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await committedOnce(fx, {
      "verbatra.lock.json": lockWithPadding(await sourceHash(fx), 4 * MIB + 1),
    });
    const blobs: string[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("cat-file")) {
        blobs.push(args.join(" "));
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, { execFile }));

    expect(result.revisions[0]?.sourceChanged).toBe("unknown");
    expect(result.truncated).toBe(true);
    expect(blobs.some((line) => line.includes("verbatra.lock.json"))).toBe(false);
  });

  it("reads a provenance file just under 4 MiB", async () => {
    const fx = await repo();
    await committedOnce(fx, {
      "verbatra.provenance.json": provenanceWithPadding("one", 4 * MIB - 64),
    });

    const result = available(await run(fx));

    expect(result.revisions[0]?.origin).toBe("human");
    expect(result.truncated).toBe(false);
  });

  it("does not read a provenance file above 4 MiB, leaves the origin out and says so", async () => {
    const fx = await repo();
    await committedOnce(fx, {
      "verbatra.provenance.json": provenanceWithPadding("one", 4 * MIB + 1),
    });

    const result = available(await run(fx));

    expect(result.revisions[0]).not.toHaveProperty("origin");
    expect(result.truncated).toBe(true);
  });

  it("says so when a committed lock file or provenance file does not parse", async () => {
    const lock = await repo();
    await committedOnce(lock, { "verbatra.lock.json": "{ not json" });
    const provenance = await repo();
    await committedOnce(provenance, { "verbatra.provenance.json": "{ not json" });

    const lockResult = available(await run(lock));
    const provenanceResult = available(await run(provenance));

    expect(lockResult.truncated).toBe(true);
    expect(lockResult.revisions[0]?.sourceChanged).toBe("unknown");
    expect(provenanceResult.truncated).toBe(true);
    expect(provenanceResult.revisions[0]).not.toHaveProperty("origin");
  });

  it("is not truncated when the records are simply absent", async () => {
    const fx = await repo();
    await committedOnce(fx, {});

    const result = available(await run(fx));

    expect(result.revisions[0]).toMatchObject({ origin: "unrecorded", sourceChanged: "unknown" });
    expect(result.truncated).toBe(false);
  });
});

describe("keyHistory buffer bounds", () => {
  it("passes the cap of the format to the read of a locale file and 4 MiB to the read of a record", async () => {
    const fx = await repo();
    await committedOnce(fx, {
      "verbatra.lock.json": JSON.stringify({ version: 1, locales: { de: {} } }),
      "verbatra.provenance.json": JSON.stringify({ version: 1, locales: {} }),
    });
    const bounds = new Map<string, number | undefined>();
    const execFile: GitExecFile = (file, args, options) => {
      const spec = args.find((arg) => /^[0-9a-f]{40}:/.test(arg));
      if (args.includes("cat-file") && spec !== undefined) {
        bounds.set(spec.slice(41), options.maxBuffer);
      }
      return defaultGitExecFile(file, args, options);
    };

    available(await run(fx, { execFile }));

    expect(Object.fromEntries(bounds)).toEqual({
      "locales/de.json": 4 * MIB,
      "verbatra.lock.json": 4 * MIB,
      "verbatra.provenance.json": 4 * MIB,
    });
  });

  it("passes 512 KiB to the read of a yaml file", async () => {
    const fx = await repo();
    const config = baseConfig({ format: "yaml", files: { pattern: "locales/{locale}.yaml" } });
    await fx.write("locales/de.yaml", "a: one\n");
    await fx.commitAll("one");
    const bounds: (number | undefined)[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("cat-file") && args.some((arg) => arg.endsWith(":locales/de.yaml"))) {
        bounds.push(options.maxBuffer);
      }
      return defaultGitExecFile(file, args, options);
    };

    await keyHistory({ config, cwd: fx.root, locale: "de", key: "a" }, { execFile });

    expect(bounds).toEqual([512 * 1024]);
  });
});

describe("keyHistory source file limit", () => {
  const YAML = baseConfig({ format: "yaml", files: { pattern: "locales/{locale}.yaml" } });

  async function yamlRepo(sourceBytes: number): Promise<GitFixture> {
    const fx = await repo();
    await fx.write("locales/en.yaml", `a: A\npad: "${"q".repeat(sourceBytes)}"\n`);
    await fx.write("locales/de.yaml", "a: one\n");
    await fx.commitAll("one");
    return fx;
  }

  it("reads a source file under 512 KiB for the yaml format", async () => {
    const fx = await yamlRepo(500_000);

    const result = available(
      await keyHistory({ config: YAML, cwd: fx.root, locale: "de", key: "a" }),
    );

    expect(result.truncated).toBe(false);
  });

  it("does not parse a source file above 512 KiB, still answers and says so", async () => {
    const fx = await yamlRepo(530_000);

    const result = available(
      await keyHistory({ config: YAML, cwd: fx.root, locale: "de", key: "a" }),
    );

    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
    expect(result.revisions[0]?.sourceChanged).toBe("unknown");
    expect(result.truncated).toBe(true);
  });
});

describe("keyHistory limits on the apple-strings pair", () => {
  const APPLE = baseConfig({
    format: "apple-strings",
    files: { pattern: "locales/{locale}.lproj/Localizable.strings" },
  });
  const HEADER =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';

  function strings(value: string, bytes: number): string {
    return `"a" = "${value}";\n/* ${"p".repeat(bytes)} */\n`;
  }

  function dict(bytes: number): string {
    return `${HEADER}<plist version="1.0"><dict></dict><!-- ${"p".repeat(bytes)} --></plist>\n`;
  }

  async function pair(
    fx: GitFixture,
    locale: "en" | "de",
    value: string,
    bytes: number,
  ): Promise<void> {
    await fx.write(`locales/${locale}.lproj/Localizable.strings`, strings(value, bytes));
    await fx.write(`locales/${locale}.lproj/Localizable.stringsdict`, dict(bytes));
  }

  it("counts the two files of a commit together against the cap", async () => {
    const fx = await repo();
    await pair(fx, "en", "A", 100);
    await pair(fx, "de", "one", 200_000);
    await fx.commitAll("small pair");
    await pair(fx, "de", "two", 300_000);
    await fx.commitAll("pair above the cap together, each file under it");

    const result = available(
      await keyHistory({ config: APPLE, cwd: fx.root, locale: "de", key: "a" }),
    );

    expect(result.unreadableRevisions).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
  });

  it("counts the two files of the source together against the cap", async () => {
    const small = await repo();
    await pair(small, "en", "A", 200_000);
    await pair(small, "de", "one", 100);
    await small.commitAll("one");
    const large = await repo();
    await pair(large, "en", "A", 300_000);
    await pair(large, "de", "one", 100);
    await large.commitAll("one");

    const readable = available(
      await keyHistory({ config: APPLE, cwd: small.root, locale: "de", key: "a" }),
    );
    const skipped = available(
      await keyHistory({ config: APPLE, cwd: large.root, locale: "de", key: "a" }),
    );

    expect(readable.truncated).toBe(false);
    expect(skipped.truncated).toBe(true);
    expect(skipped.revisions.map((revision) => revision.value)).toEqual(["one"]);
  });

  it("counts the two files on disk together against the cap", async () => {
    const fx = await repo();
    await pair(fx, "en", "A", 100);
    await pair(fx, "de", "one", 100);
    await fx.commitAll("one");
    await pair(fx, "de", "two", 300_000);

    const result = available(
      await keyHistory({ config: APPLE, cwd: fx.root, locale: "de", key: "a" }),
    );

    expect(result.workingTreeUnreadable).toBe(true);
    expect(result.workingTree).toBeUndefined();
  });
});

describe("keyHistory yields and ordering", () => {
  async function history(commits: number): Promise<number> {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    for (let index = 0; index < commits; index += 1) {
      await fx.write("locales/de.json", json({ a: `v${index}` }));
      await fx.commitAll(`v${index}`);
    }
    const yields = vi.spyOn(globalThis, "setImmediate");
    available(await run(fx));
    const count = yields.mock.calls.length;
    yields.mockRestore();
    return count;
  }

  it("yields to the event loop before every parse of a locale file and of the lock and provenance records", async () => {
    const one = await history(1);
    const four = await history(4);

    expect(four - one).toBe(3 * 3);
  });

  it("gives the same answer however the reads complete, and cuts at the same commit", async () => {
    const fx = await repo();
    const config = baseConfig({ format: "yaml", files: { pattern: "locales/{locale}.yaml" } });
    await fx.write("locales/en.yaml", "a: A\n");
    for (let index = 0; index < 36; index += 1) {
      await fx.write("locales/de.yaml", `a: v${index}\npad: "${"q".repeat(524_000)}"\n`);
      await fx.commitAll(`v${index}`);
    }
    const answers: string[] = [];
    for (const seed of [1, 2, 3]) {
      let counter = seed;
      const execFile: GitExecFile = async (file, args, options) => {
        counter = (counter * 1103515245 + 12345) % 2147483648;
        await new Promise((resolve) => setTimeout(resolve, counter % 7));
        return defaultGitExecFile(file, args, options);
      };
      const result = available(
        await keyHistory(
          { config, cwd: fx.root, locale: "de", key: "a", limit: 200 },
          { execFile },
        ),
      );
      answers.push(
        JSON.stringify([
          result.revisions.map((revision) => revision.commit),
          result.truncated,
          result.unreadableRevisions,
        ]),
      );
    }

    expect(new Set(answers).size).toBe(1);
    expect(JSON.parse(answers[0] as string)[0]).toHaveLength(31);
  });
});

describe("keyHistory reads each commit once", () => {
  it("does not read the copy at HEAD a second time for the working tree", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    for (const value of ["one", "two", "three"]) {
      await fx.write("locales/de.json", json({ a: value }));
      await fx.commitAll(value);
    }
    await fx.write("locales/de.json", json({ a: "edited" }));
    const blobs: string[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("cat-file") && args.some((arg) => arg.endsWith(":locales/de.json"))) {
        blobs.push(args.join(" "));
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, { execFile }));

    expect(result.workingTree?.value).toBe("edited");
    expect(blobs).toHaveLength(3);
  });
});

describe("keyHistory working tree against an unreadable HEAD", () => {
  it("flags the working tree as unreadable instead of comparing it with nothing", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", "<<<<<<< HEAD\n{ not json\n");
    await fx.commitAll("conflict markers committed");
    await fx.write("locales/de.json", json({ a: "edited" }));

    const result = available(await run(fx));

    expect(result.workingTree).toBeUndefined();
    expect(result.workingTreeUnreadable).toBe(true);
    expect(result.truncated).toBe(true);
  });
});

describe("keyHistory with a pattern that resolves to the project root", () => {
  it("answers working-file-unreadable without calling git", async () => {
    const fx = await repo();
    const config = baseConfig({
      format: "apple-xcstrings",
      files: { pattern: "x{locale}/.." },
    });
    let calls = 0;
    const execFile: GitExecFile = async () => {
      calls += 1;
      throw new Error("git must not run");
    };

    const result = await keyHistory({ config, cwd: fx.root, locale: "de", key: "a" }, { execFile });

    expect(result).toEqual({ available: false, reason: "working-file-unreadable" });
    expect(calls).toBe(0);
  });
});
