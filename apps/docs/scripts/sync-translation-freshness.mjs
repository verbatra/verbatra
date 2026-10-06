import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncCommitTimes } from "../lib/commit-times.ts";
import { foldIncludedTimes } from "../lib/docs-pages.ts";

const here = dirname(fileURLToPath(import.meta.url));
const contentRoot = resolve(here, "../content");
const outputPath = resolve(here, "../lib/translation-freshness.generated.json");

const git = (args) =>
  execFileSync("git", args, {
    cwd: contentRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });

const readContent = (file) => {
  const path = resolve(contentRoot, file);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
};

const outcome = syncCommitTimes(git, {
  exists: () => existsSync(outputPath),
  write: (times) =>
    writeFileSync(
      outputPath,
      `${JSON.stringify(foldIncludedTimes(times, "docs", readContent), null, 2)}\n`,
    ),
});

if (outcome !== "written") {
  console.log(
    outcome === "kept"
      ? "No full git history: kept the existing translation freshness snapshot."
      : "No full git history: outdated-translation notices are off for this build.",
  );
}
