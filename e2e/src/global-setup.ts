import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { makeConsumer } from "./harness.js";

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(e2eDir, "..");
const manifestPath = join(e2eDir, ".tarballs.json");

async function findTarball(dir: string, prefix: string): Promise<string> {
  const entries = await readdir(dir);
  const match = entries.find((name) => name.startsWith(prefix) && name.endsWith(".tgz"));
  if (!match) {
    throw new Error(`No tarball matching ${prefix}*.tgz in ${dir}`);
  }
  return join(dir, match);
}

async function buildPackables(): Promise<void> {
  await execa(
    "pnpm",
    ["turbo", "run", "build", "--filter=@verbatra/sdk...", "--filter=@verbatra/cli..."],
    { cwd: repoRoot },
  );
}

const TARBALL_ENV_VARS = [
  "VERBATRA_SDK_TARBALL",
  "VERBATRA_CLI_TARBALL",
  "VERBATRA_STUDIO_TARBALL",
] as const;

async function packTarballs(): Promise<{ sdk: string; cli: string; studio: string }> {
  const set = TARBALL_ENV_VARS.filter((name) => process.env[name]);
  if (set.length === TARBALL_ENV_VARS.length) {
    return {
      sdk: resolve(process.env.VERBATRA_SDK_TARBALL as string),
      cli: resolve(process.env.VERBATRA_CLI_TARBALL as string),
      studio: resolve(process.env.VERBATRA_STUDIO_TARBALL as string),
    };
  }
  if (set.length > 0) {
    throw new Error(
      `${TARBALL_ENV_VARS.join(", ")} must all be set or all be unset. Only ${set.join(", ")} ` +
        "was provided, which is more likely a misconfiguration than an intentional partial override.",
    );
  }

  await buildPackables();

  const dest = await mkdtemp(join(tmpdir(), "verbatra-e2e-packs-"));
  const pack = (filter: string) =>
    execa("pnpm", ["--filter", filter, "pack", "--pack-destination", dest], { cwd: repoRoot });
  await pack("@verbatra/sdk");
  await pack("@verbatra/cli");
  await pack("@verbatra/studio");
  return {
    sdk: await findTarball(dest, "verbatra-sdk-"),
    cli: await findTarball(dest, "verbatra-cli-"),
    studio: await findTarball(dest, "verbatra-studio-"),
  };
}

export async function setup(): Promise<void> {
  const tarballs = await packTarballs();
  await writeFile(manifestPath, JSON.stringify(tarballs, null, 2));

  const sharedConsumer = await makeConsumer();
  await writeFile(
    manifestPath,
    JSON.stringify({ ...tarballs, sharedConsumerDir: sharedConsumer.dir }, null, 2),
  );
}
