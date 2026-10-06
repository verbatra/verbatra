import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DoctorResult, dataFlowManifestSchema, doctor } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGitignore } from "./gitignore.js";
import { run } from "./run.js";
import { captureStreams, parseEnvelope, recordingDeps } from "./test-support.js";

const KEY_CANARY = "deepl-cli-canary-5b8e1d3f7a:fx";

let projectDir: string;

async function writeProject(provider: Record<string, unknown>): Promise<void> {
  await writeFile(
    join(projectDir, ".verbatrarc.json"),
    JSON.stringify({
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider,
    }),
    "utf8",
  );
  await mkdir(join(projectDir, "locales"), { recursive: true });
  await writeFile(
    join(projectDir, "locales", "en.json"),
    JSON.stringify({ hi: "Hi", rich: "Open <b>{{name}}</b>" }),
    "utf8",
  );
}

function realDoctorDeps() {
  return recordingDeps({ doctor: (input) => doctor(input) });
}

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "verbatra-cli-data-flow-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("run doctor --data-flow", () => {
  it("asks the SDK for the data-flow run and names the task on stderr", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["doctor", "--data-flow", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.doctor).toEqual([{ cwd: "/proj", dataFlow: true }]);
    expect(cap.err()).toContain("describing the data flow");
  });

  it("prints the manifest under result.dataFlow, valid under the published schema", async () => {
    await writeProject({ id: "deepl", options: {} });
    vi.stubEnv("DEEPL_API_KEY", KEY_CANARY);
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    const code = await run(
      ["doctor", "--data-flow", "--json", "--cwd", projectDir],
      deps,
      cap.streams,
    );

    expect(code).toBe(0);
    const envelope = parseEnvelope(cap.out());
    expect(envelope.ok).toBe(true);
    const result = (envelope as { result: DoctorResult }).result;
    const manifest = dataFlowManifestSchema.parse(result.dataFlow);
    expect(manifest.destinations.map((destination) => destination.host)).toEqual([
      "api.deepl.com",
      "api-free.deepl.com",
    ]);
    expect(manifest.sent.counts?.keysWithheld).toBe(1);
    expect(`${cap.out()}${cap.err()}`).not.toContain("canary");
  });

  it("renders a compact table in human output", async () => {
    await writeProject({ id: "anthropic", options: { model: "m", maxTokens: 1 } });
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, cap.streams);

    const out = cap.out();
    expect(out).toContain("[ok  ] Data flow:");
    expect(out).toContain("  data flow (manifest version 1)");
    expect(out).toContain("    provider     anthropic (llm, model m)");
    expect(out).toContain("    network      any host (no policy set)");
    expect(out).toContain("    destination  api.anthropic.com  default  per-request  permitted");
    expect(out).toContain("    counts       2 source keys, 0 with a description or meaning");
    expect(out).toContain("    locale       de  sent as de  glossary terms: 0");
    expect(out).toContain("    agent        mcp  verbatra mcp  redactable");
    expect(out).toContain(
      "    local        cache  verbatra.cache.json  (source text, translations, gitignored by init)",
    );
    expect(out).toContain(
      "    local        provenance  verbatra.provenance.json  (reviewer names)",
    );
    expect(out).toContain(
      "    local        lock  verbatra.lock.json  (no source text, translations or personal data)",
    );
    expect(out).toContain(
      "    local        local-state  .verbatra-local  (source text, host name and process ID of a run holding a write lock, gitignored by init)",
    );
  });

  it("renders provider none as nothing sent", async () => {
    await writeProject({ id: "none" });
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, cap.streams);

    expect(cap.out()).toContain('    sent         nothing (provider "none")');
    expect(cap.out()).not.toContain("destination");
  });

  it("renders a refused host with its reason and an invalid policy with its error", async () => {
    await writeProject({ id: "anthropic", options: { model: "m", maxTokens: 1 } });
    const { deps } = realDoctorDeps();

    vi.stubEnv("VERBATRA_NETWORK_POLICY", "local-only");
    const refused = captureStreams();
    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, refused.streams);
    expect(refused.out()).toContain("    network      environment local-only");
    expect(refused.out()).toContain("per-request  refused: ");
    expect(refused.out()).toContain("[warn] Data flow:");

    vi.stubEnv("VERBATRA_NETWORK_POLICY", "nowhere");
    const invalid = captureStreams();
    const code = await run(["doctor", "--data-flow", "--cwd", projectDir], deps, invalid.streams);
    expect(code).toBe(0);
    expect(invalid.out()).toContain("    network      invalid: ");
    expect(invalid.out()).toContain("invalid-policy");
  });

  it("names the variable and free-key condition behind a host, and the language-list request", async () => {
    await writeProject({ id: "deepl", options: {} });
    vi.stubEnv("VERBATRA_NETWORK_POLICY", "allowlist");
    vi.stubEnv("VERBATRA_NETWORK_ALLOWED_HOSTS", "api.deepl.com");
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, cap.streams);

    expect(cap.out()).toContain("environment allowlist (api.deepl.com)");
    expect(cap.out()).toContain("api-free.deepl.com  default  free-key  before-construction");
    expect(cap.out()).toContain(
      "    request      language-list  verbatra doctor --live  sends the API key",
    );
    expect(cap.out()).toContain(", 1 with placeholders it cannot mask (withheld)");
  });

  it("names the base URL variable that redirects a hosted provider and a mapped locale", async () => {
    await writeProject({
      id: "openai",
      options: { model: "m", maxOutputTokens: 1, localeMap: { de: "de-DE" } },
    });
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.example/v1");
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, cap.streams);

    expect(cap.out()).toContain("gateway.example  OPENAI_BASE_URL  per-request  permitted");
    expect(cap.out()).toContain("de  sent as de-DE (localeMap)");
  });

  it("names the proxy a destination goes through, without its credentials", async () => {
    await writeProject({ id: "deepl", options: {} });
    vi.stubEnv("HTTPS_PROXY", "http://user:proxy-canary@proxy.corp.example:3128");
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, cap.streams);

    expect(cap.out()).toContain("permitted  via HTTPS_PROXY proxy.corp.example");
    expect(cap.out()).not.toContain("canary");
  });

  it("says why the counts are unavailable", async () => {
    await writeProject({ id: "anthropic", options: { model: "m", maxTokens: 1 } });
    await rm(join(projectDir, "locales"), { recursive: true });
    const { deps } = realDoctorDeps();
    const cap = captureStreams();

    await run(["doctor", "--data-flow", "--cwd", projectDir], deps, cap.streams);

    expect(cap.out()).toContain("    counts       unavailable: ");
  });

  it.each([["--literals"], ["--locales"], ["--live"]])(
    "refuses --data-flow with %s as a usage error with exit 2",
    async (flag) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["doctor", "--data-flow", flag], deps, cap.streams);

      expect(code).toBe(2);
      expect(calls.doctor).toEqual([]);
      expect(cap.err()).toContain("[INVALID_OPTION]");
      expect(cap.err()).toContain(flag);
    },
  );

  it("documents the flag in the command help", async () => {
    const cap = captureStreams();

    await run(["doctor", "--help"], recordingDeps().deps, cap.streams);

    expect(cap.out()).toContain("--data-flow");
  });

  it("marks as gitignored by init exactly what init writes to .gitignore", async () => {
    await writeProject({ id: "none" });
    ensureGitignore(projectDir, captureStreams().streams);
    const ignored = new Set(
      (await readFile(join(projectDir, ".gitignore"), "utf8"))
        .split("\n")
        .map((line) => line.replace(/\/$/, "")),
    );
    const result = await doctor({ cwd: projectDir, dataFlow: true });

    for (const file of result.dataFlow?.local ?? []) {
      expect([file.id, ignored.has(file.path)]).toEqual([file.id, file.gitignoredByInit]);
    }
    expect(result.dataFlow?.local).toHaveLength(4);
  });
});
