import { hostname } from "node:os";
import { describe, expect, it } from "vitest";
import {
  currentHostLiveness,
  isHolderProvablyDead,
  type LivenessContext,
  type SignalProbe,
} from "./holder-liveness.js";

function errnoProbe(code: string): SignalProbe {
  return () => {
    throw Object.assign(new Error(code), { code });
  };
}

const aliveProbe: SignalProbe = () => {};

function context(probe: SignalProbe): LivenessContext {
  return { host: "build-host", probe };
}

describe("isHolderProvablyDead", () => {
  it("is true for a holder on this host whose pid no longer exists", () => {
    expect(
      isHolderProvablyDead({ pid: 4242, hostname: "build-host" }, context(errnoProbe("ESRCH"))),
    ).toBe(true);
  });

  it("treats a pid owned by another user (EPERM) as alive", () => {
    expect(
      isHolderProvablyDead({ pid: 1, hostname: "build-host" }, context(errnoProbe("EPERM"))),
    ).toBe(false);
  });

  it("treats any other probe failure as alive", () => {
    expect(
      isHolderProvablyDead({ pid: 4242, hostname: "build-host" }, context(errnoProbe("EINVAL"))),
    ).toBe(false);
  });

  it("treats a holder whose pid answers the probe as alive", () => {
    expect(isHolderProvablyDead({ pid: 4242, hostname: "build-host" }, context(aliveProbe))).toBe(
      false,
    );
  });

  it.each([
    ["another host", { pid: 4242, hostname: "other-host" }],
    ["no recorded host, as an older version wrote it", { pid: 4242 }],
    ["no recorded pid", { hostname: "build-host" }],
    ["pid zero, which would signal the whole process group", { pid: 0, hostname: "build-host" }],
    ["a negative pid", { pid: -12, hostname: "build-host" }],
    ["a fractional pid", { pid: 1.5, hostname: "build-host" }],
  ])("never judges a holder dead with %s", (_label, holder) => {
    let probed = false;
    const probe: SignalProbe = () => {
      probed = true;
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    };

    expect(isHolderProvablyDead(holder, context(probe))).toBe(false);
    expect(probed).toBe(false);
  });
});

describe("currentHostLiveness", () => {
  it("names this machine and reports the running process as alive", () => {
    expect(currentHostLiveness.host).toBe(hostname());
    expect(
      isHolderProvablyDead({ pid: process.pid, hostname: hostname() }, currentHostLiveness),
    ).toBe(false);
  });
});
