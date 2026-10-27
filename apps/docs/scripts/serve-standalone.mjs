import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const appDir = join(import.meta.dirname, "..");
const standaloneDir = join(appDir, ".next", "standalone");
const standaloneAppDir = join(standaloneDir, "apps", "docs");
const serverFile = join(standaloneAppDir, "server.js");

if (!existsSync(serverFile)) {
  console.error(`No standalone build at ${serverFile}; run the docs build first.`);
  process.exit(1);
}

cpSync(join(appDir, ".next", "static"), join(standaloneAppDir, ".next", "static"), {
  recursive: true,
});
cpSync(join(appDir, "public"), join(standaloneAppDir, "public"), { recursive: true });

const port = process.env.PORT ?? "3107";
console.error(`Serving the standalone docs build on http://localhost:${port}`);

const server = spawn(process.execPath, [serverFile], {
  cwd: standaloneDir,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: port, HOSTNAME: "localhost" },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
