import { describe, expect, it } from "vitest";
import { formatRequestLog } from "./request-log.js";

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
