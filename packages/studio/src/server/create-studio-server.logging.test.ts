import { afterEach, describe, expect, it } from "vitest";
import { startStudioServer } from "./create-studio-server.js";
import { authenticatedCookie, stubLoader } from "./test-support.js";
import type { StudioServer } from "./types.js";

describe("token-once banner and request logging", () => {
  let server: StudioServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("prints the token exactly once, in the startup banner, and never in a request log line", async () => {
    const lines: string[] = [];

    server = await startStudioServer({
      port: 0,
      output: (line) => lines.push(line),
      loader: stubLoader(),
    });
    const bannerLine = lines[0] ?? "";
    const tokenMatch = /\?token=([0-9a-f]+)$/.exec(bannerLine);
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch?.[1] ?? "";
    expect(token.length).toBeGreaterThanOrEqual(32);

    const cookie = (
      await fetch(`${server.url}?token=${token}`, { redirect: "manual" })
    ).headers.get("set-cookie");
    await fetch(server.url, { headers: { Cookie: cookie?.split(";")[0] ?? "" } });
    await fetch(new URL("missing-asset.js", server.url), {
      headers: { Cookie: cookie?.split(";")[0] ?? "" },
    });

    const occurrences = lines.filter((line) => line.includes(token)).length;
    expect(occurrences).toBe(1);

    const requestLines = lines.slice(1);
    expect(requestLines.length).toBeGreaterThan(0);
    for (const line of requestLines) {
      expect(line).not.toContain("token");
      expect(line).not.toContain("?");
    }
  });

  it("logs the method, the path without a query string, and the status", async () => {
    const lines: string[] = [];
    server = await startStudioServer({
      port: 0,
      output: (line) => lines.push(line),
      loader: stubLoader(),
    });

    await fetch(new URL("/some/path?with=query", server.url));

    const requestLine = lines.find((line) => line.startsWith("GET /some/path"));
    expect(requestLine).toBe("GET /some/path 401");
  });

  it("names a recognized RPC method in the request line, and never an unrecognized one", async () => {
    const lines: string[] = [];
    const token = "logging-test-token-0123456789abcdef0123";
    server = await startStudioServer({
      port: 0,
      token,
      output: (line) => lines.push(line),
      loader: stubLoader(),
    });
    const cookie = await authenticatedCookie(server.url, token);
    const post = (method: string, params: object): Promise<Response> =>
      fetch(new URL("/rpc", server?.url), {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          Origin: server?.url.replace(/\/$/, "") ?? "",
        },
        body: JSON.stringify({ method, params }),
      });

    await post("status.check", {});
    await post("attacker.chosen-name", { secret: "value-canary" });

    const rpcLines = lines.filter((line) => line.startsWith("POST /rpc"));
    expect(rpcLines).toEqual(["POST /rpc status.check 200", "POST /rpc 400"]);
    expect(lines.join("\n")).not.toContain("value-canary");
  });
});
