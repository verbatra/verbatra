import { describe, expect, it } from "vitest";
import { formatRequestLog, isRequestLogLine } from "./request-log.js";

describe("formatRequestLog", () => {
  it("formats method, path, and status", () => {
    expect(formatRequestLog({ method: "GET", path: "/", status: 200 })).toBe("GET / 200");
  });

  it("does not accept a path with a query string as part of its own contract, but formats whatever it is given verbatim", () => {
    expect(formatRequestLog({ method: "POST", path: "/rpc", status: 401 })).toBe("POST /rpc 401");
  });

  it("names a recognized RPC method between the path and the status", () => {
    expect(
      formatRequestLog({ method: "POST", path: "/rpc", status: 200, rpcMethod: "status.check" }),
    ).toBe("POST /rpc status.check 200");
  });
});

describe("isRequestLogLine", () => {
  it.each([
    { method: "GET", path: "/", status: 200 },
    { method: "GET", path: "/?token=abc", status: 303 },
    { method: "POST", path: "/rpc", status: 401 },
    { method: "POST", path: "/rpc", status: 200, rpcMethod: "status.check" },
    { method: "POST", path: "/rpc", status: 500, rpcMethod: "translation.retranslateEntries" },
  ])("accepts every line formatRequestLog produces: $method $path $rpcMethod $status", (entry) => {
    expect(isRequestLogLine(formatRequestLog(entry))).toBe(true);
  });

  it.each([
    "Verbatra Studio running at http://127.0.0.1:5849/?token=abc",
    "studio error: project.snapshot failed: EIO",
    "studio server internal log line",
    "POST /rpc status.check",
  ])("rejects a line that is not a request log line: %s", (line) => {
    expect(isRequestLogLine(line)).toBe(false);
  });
});
