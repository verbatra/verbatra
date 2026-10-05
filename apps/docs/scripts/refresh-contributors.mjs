import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readContributors } from "../lib/contributors.ts";
import { refreshContributors } from "../lib/contributors-refresh.ts";

const here = dirname(fileURLToPath(import.meta.url));

const contributors = await refreshContributors({
  avatarDir: resolve(here, "../public/contributors"),
  manifestPath: resolve(here, "../lib/contributors.json"),
  validate: readContributors,
  token: process.env.GITHUB_TOKEN,
});

console.log(`Wrote ${contributors.length} contributors and their avatars.`);
