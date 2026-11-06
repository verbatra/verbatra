import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type LocaleResource,
  SUPPORTED_FORMATS,
  type SupportedFormat,
  type TranslationEntry,
} from "@verbatra/core";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it } from "vitest";
import { type GitFixture, makeGitFixture } from "../git-fixture.js";
import { defaultGitExecFile } from "./git-exec.js";
import {
  blobSpec,
  LOCALE_GIT_BLOB_MAX_BYTES,
  parseRevisionContent,
  readBlobAtHead,
  singleFileFs,
} from "./git-revision.js";
import { openGitWorkTree } from "./git-worktree.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function repo(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  return fx;
}

interface FormatSample {
  readonly path: string;
  readonly values: readonly (readonly [string, string])[];
  readonly literal?: string;
}

const XLIFF = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext"><body>
<trans-unit id="title"><source>Verbatra</source></trans-unit>
<trans-unit id="greeting"><source>Hello {name}</source></trans-unit>
</body></file></xliff>
`;

const XCSTRINGS = `${JSON.stringify({
  sourceLanguage: "en",
  version: "1.0",
  strings: {
    title: { localizations: { en: { stringUnit: { state: "translated", value: "Verbatra" } } } },
    greeting: {
      localizations: { en: { stringUnit: { state: "translated", value: "Hello %@ now" } } },
    },
  },
})}\n`;

const TITLE_GREETING = (greeting: string): FormatSample["values"] => [
  ["title", "Verbatra"],
  ["greeting", greeting],
];

const SAMPLES: Record<SupportedFormat, FormatSample> = {
  "i18next-json": { path: "locales/en.json", values: TITLE_GREETING("Hello {{name}}") },
  "vue-i18n-json": { path: "locales/en.json", values: TITLE_GREETING("Hello {name}") },
  "next-intl-json": {
    path: "messages/en.json",
    values: [
      ...TITLE_GREETING("Hello {name}"),
      ["cart", "{count, plural, one {# item} other {# items}}"],
    ],
  },
  "ngx-translate-json": { path: "locales/en.json", values: TITLE_GREETING("Hello {{name}}") },
  xliff: { path: "locales/en.xlf", values: [], literal: XLIFF },
  yaml: { path: "locales/en.yaml", values: TITLE_GREETING("Hello {name}") },
  arb: { path: "locales/app_en.arb", values: TITLE_GREETING("Hello {name}") },
  properties: { path: "locales/messages_en.properties", values: TITLE_GREETING("Hello {0}") },
  "apple-strings": {
    path: "locales/en.lproj/Localizable.strings",
    values: TITLE_GREETING("Hello %@ you have %d"),
  },
  "apple-xcstrings": { path: "locales/Localizable.xcstrings", values: [], literal: XCSTRINGS },
  "android-xml": {
    path: "res/values-en/strings.xml",
    values: TITLE_GREETING("Hello %1$s you have %2$d"),
  },
  "gettext-po": { path: "locales/en.po", values: TITLE_GREETING("Hello %(name)s") },
  ini: {
    path: "locales/en.ini",
    values: [
      ["section.title", "Verbatra"],
      ["section.greeting", "Hello {name}"],
    ],
  },
  resx: { path: "locales/Messages.en.resx", values: TITLE_GREETING("Hello {0}") },
};

function entry(key: string, value: string, placeholders: readonly string[]): TranslationEntry {
  return { key, namespace: "", value, placeholders, isPlural: false };
}

async function writeSample(dir: string, format: SupportedFormat): Promise<string> {
  const sample = SAMPLES[format];
  const path = join(dir, sample.path);
  await mkdir(dirname(path), { recursive: true });
  if (sample.literal !== undefined) {
    await writeFile(path, sample.literal, "utf8");
    return path;
  }
  const adapter = createDefaultRegistry().resolve("", { format });
  if (adapter.status !== "resolved") {
    throw new Error(`no adapter for ${format}`);
  }
  const entries = new Map(
    sample.values.map(([key, value]) => [
      key,
      entry(key, value, adapter.adapter.extractPlaceholders(value)),
    ]),
  );
  const resource: LocaleResource = { locale: "en", namespace: "", format, entries };
  await adapter.adapter.write(resource, path);
  return path;
}

describe("parseRevisionContent reads every supported format from memory", () => {
  it("covers exactly the supported formats", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...SUPPORTED_FORMATS].sort());
    expect(SUPPORTED_FORMATS).toHaveLength(14);
  });

  it.each([...SUPPORTED_FORMATS])("%s gives the entries the disk read gives", async (format) => {
    const fx = await repo();
    const path = await writeSample(fx.root, format);
    const content = await readFile(path, "utf8");
    const disk = createDefaultRegistry().resolve("", { format });
    if (disk.status !== "resolved") {
      throw new Error("unresolved");
    }
    const expected = (await disk.adapter.read(path, "en")).resource;

    const parsed = await parseRevisionContent({
      format,
      locale: "en",
      absolutePath: path,
      content,
    });

    expect(expected.entries.size).toBeGreaterThan(0);
    expect(parsed?.entries).toEqual(expected.entries);
  });

  it("reads one locale of a shared catalogue and finds nothing for another", async () => {
    const fx = await repo();
    const path = await writeSample(fx.root, "apple-xcstrings");

    const other = await parseRevisionContent({
      format: "apple-xcstrings",
      locale: "de",
      absolutePath: path,
      content: XCSTRINGS,
    });

    expect(other?.entries.size).toBe(0);
  });

  it("returns nothing for malformed content, a custom format and an unknown format", async () => {
    const base = { locale: "en", absolutePath: "/p/en.json", content: "{ not json" };

    expect(await parseRevisionContent({ ...base, format: "i18next-json" })).toBeUndefined();
    expect(await parseRevisionContent({ ...base, format: "custom:mine" })).toBeUndefined();
  });
});

describe("singleFileFs", () => {
  it("serves its one path, refuses every other with ENOENT and refuses writes", async () => {
    const fs = singleFileFs("/p/en.json", "abc");

    expect(await fs.readBounded("/p/en.json", 10)).toEqual({ kind: "ok", content: "abc" });
    expect(await fs.readBounded("/p/en.json", 2)).toEqual({ kind: "too-large" });
    await expect(fs.readBounded("/p/de.json", 10)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.writeFileAtomic("/p/en.json", "x")).rejects.toThrow("read-only");
  });
});

describe("blobSpec", () => {
  const hash = "a".repeat(40);

  it("joins the commit hash and a repository-relative path", () => {
    expect(blobSpec(hash, "packages/app/locales/de.json")).toBe(
      `${hash}:packages/app/locales/de.json`,
    );
  });

  it.each([
    "./locales/de.json",
    "../locales/de.json",
    "locales/../de.json",
    "locales/./de.json",
    "/locales/de.json",
    "locales//de.json",
    "locales/",
    "",
  ])("refuses the path %j", (path) => {
    expect(blobSpec(hash, path)).toBeUndefined();
  });

  it.each(["HEAD", "main", `${"A".repeat(40)}`, "abc123", `${hash}0`, "-x"])(
    "refuses the revision %j",
    (revision) => {
      expect(blobSpec(revision, "a.json")).toBeUndefined();
    },
  );

  it("keeps a leading dash, a colon and a newline inside the path", () => {
    expect(blobSpec(hash, "-x/:a\nb.json")).toBe(`${hash}:-x/:a\nb.json`);
  });
});

describe("readBlobAtHead", () => {
  async function open(fx: GitFixture, cwd = fx.root) {
    const opened = await openGitWorkTree(defaultGitExecFile, cwd);
    if (!opened.ok) {
      throw new Error(opened.reason);
    }
    return opened.tree;
  }

  it("reads the committed content, not the working file", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", '{"a":"committed"}\n');
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"edited"}\n');

    const read = await readBlobAtHead(await open(fx), "locales/de.json");

    expect(read).toEqual({ kind: "ok", content: '{"a":"committed"}\n' });
  });

  it("reads a path from the repository root, never relative to the working directory", async () => {
    const fx = await repo();
    await fx.write("de.json", "root\n");
    await fx.write("sub/de.json", "sub\n");
    await fx.commitAll();
    const tree = await open(fx, join(fx.root, "sub"));
    const dotted = await fx.git(["cat-file", "blob", "HEAD:./de.json"], join(fx.root, "sub"));

    const read = await readBlobAtHead(tree, "de.json");

    expect(dotted).toBe("sub\n");
    expect(read).toEqual({ kind: "ok", content: "root\n" });
    expect(await readBlobAtHead(tree, `${tree.prefix}de.json`)).toEqual({
      kind: "ok",
      content: "sub\n",
    });
  });

  it("reports a file that is not in HEAD, and a repository with no commits, as absent", async () => {
    const fx = await repo();
    await fx.write("other.json", "{}\n");
    const empty = await open(fx);
    await fx.commitAll();

    expect(await readBlobAtHead(empty, "other.json")).toEqual({ kind: "absent" });
    expect(await readBlobAtHead(await open(fx), "nope.json")).toEqual({ kind: "absent" });
  });

  it("refuses a symbolic link, a directory and a path that is not repository-relative", async () => {
    const fx = await repo();
    await fx.write("real.json", "{}\n");
    await fx.write("dir/inner.json", "{}\n");
    await symlink("real.json", join(fx.root, "link.json"));
    await fx.commitAll();
    const tree = await open(fx);

    expect(await readBlobAtHead(tree, "link.json")).toEqual({ kind: "unreadable" });
    expect(await readBlobAtHead(tree, "dir")).toEqual({ kind: "unreadable" });
    expect(await readBlobAtHead(tree, "./real.json")).toEqual({ kind: "unreadable" });
  });

  it("reads an executable file", async () => {
    const fx = await repo();
    await fx.write("run.json", "{}\n");
    await chmod(join(fx.root, "run.json"), 0o755);
    await fx.commitAll();

    expect(await readBlobAtHead(await open(fx), "run.json")).toEqual({
      kind: "ok",
      content: "{}\n",
    });
  });

  it("refuses a committed file larger than the bound without reading it", async () => {
    const fx = await repo();
    await fx.write("big.json", "x".repeat(LOCALE_GIT_BLOB_MAX_BYTES + 1));
    await fx.commitAll();

    expect(await readBlobAtHead(await open(fx), "big.json")).toEqual({
      kind: "failed",
      reason: "output-too-large",
    });
  });

  it("reports a git failure while listing", async () => {
    const fx = await repo();
    await fx.write("a.json", "{}\n");
    await fx.commitAll();
    const tree = await open(fx);
    await rm(join(fx.root, ".git", "objects"), { recursive: true, force: true });

    expect(await readBlobAtHead(tree, "a.json")).toMatchObject({ kind: "failed" });
  });

  it("does not apply a text conversion driver to the committed content", async () => {
    const fx = await repo();
    const hook = join(fx.base, "textconv.sh");
    await writeFile(hook, `#!/bin/sh\necho ran >> "${join(fx.base, "marker")}"\necho converted\n`);
    await chmod(hook, 0o755);
    await fx.write(".gitattributes", "*.json diff=evil\n");
    await fx.write("de.json", "{}\n");
    await fx.git(["config", "diff.evil.textconv", hook]);
    await fx.commitAll();

    const read = await readBlobAtHead(await open(fx), "de.json");

    expect(read).toEqual({ kind: "ok", content: "{}\n" });
    expect(await fx.exists("marker")).toBe(false);
  });
});
