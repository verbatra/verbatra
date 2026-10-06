import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileIn } from "./harness.js";

export const NETWORK_ATTEMPT_MESSAGE = "a network call was attempted";

function preloadSource(label: string): string {
  return [
    'import dns from "node:dns";',
    'import { syncBuiltinESMExports } from "node:module";',
    'import net from "node:net";',
    "const refuse = () => {",
    `  throw new Error("${label}: ${NETWORK_ATTEMPT_MESSAGE}");`,
    "};",
    "globalThis.fetch = refuse;",
    "net.Socket.prototype.connect = refuse;",
    "dns.lookup = refuse;",
    "dns.promises.lookup = refuse;",
    "syncBuiltinESMExports();",
    "",
  ].join("\n");
}

export async function noNetworkNodeOptions(dir: string, label: string): Promise<string> {
  const preloadDir = join(dir, `${label}-preload`);
  await writeFileIn(preloadDir, "no-network.mjs", preloadSource(`${label} e2e`));
  return `--import ${pathToFileURL(join(preloadDir, "no-network.mjs")).href}`;
}
