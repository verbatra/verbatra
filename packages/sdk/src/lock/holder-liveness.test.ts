import { hostname } from "node:os";
import { describe, expect, it } from "vitest";
import {
  currentHostLiveness,
  identityTag,
  isHolderProvablyDead,
  isLocalPidGone,
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

describe("isHolderProvablyDead: kernel identity", () => {
  const gone: SignalProbe = errnoProbe("ESRCH");
  const linux: LivenessContext = {
    host: "build-host",
    bootId: "boot-a",
    pidNamespace: "pid:[4026531836]",
    probe: gone,
  };

  it("is true when every identity field the holder recorded matches this process", () => {
    expect(
      isHolderProvablyDead(
        { pid: 4242, hostname: "build-host", bootId: "boot-a", pidNamespace: "pid:[4026531836]" },
        linux,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "another boot of the kernel, as a second machine sharing the host name has",
      { bootId: "boot-b", pidNamespace: "pid:[4026531836]" },
    ],
    [
      "another PID namespace, as a container sharing the host name and a volume has",
      { bootId: "boot-a", pidNamespace: "pid:[4026532999]" },
    ],
    ["no boot ID, as a lock written without one", { pidNamespace: "pid:[4026531836]" }],
    ["no PID namespace, as a lock written without one", { bootId: "boot-a" }],
    ["neither field, as a lock written before they were recorded", {}],
  ])("treats a holder with %s as alive", (_label, identity) => {
    expect(isHolderProvablyDead({ pid: 4242, hostname: "build-host", ...identity }, linux)).toBe(
      false,
    );
  });

  it("treats a holder that recorded an identity field this process cannot read as alive", () => {
    expect(
      isHolderProvablyDead(
        { pid: 4242, hostname: "build-host", bootId: "boot-a", pidNamespace: "pid:[4026531836]" },
        { host: "build-host", probe: gone },
      ),
    ).toBe(false);
  });
});

describe("currentHostLiveness", () => {
  it("names this machine and reports the running process as alive", () => {
    const current = currentHostLiveness();

    expect(current.host).toBe(hostname());
    expect(
      isHolderProvablyDead(
        {
          pid: process.pid,
          hostname: hostname(),
          ...(current.bootId !== undefined ? { bootId: current.bootId } : {}),
          ...(current.pidNamespace !== undefined ? { pidNamespace: current.pidNamespace } : {}),
        },
        current,
      ),
    ).toBe(false);
  });

  it("reads the machine identity once and reuses it", () => {
    expect(currentHostLiveness()).toBe(currentHostLiveness());
  });
});

describe("identityTag", () => {
  it("is twelve hex characters, stable for the same machine identity", () => {
    const tag = identityTag(context(aliveProbe));

    expect(tag).toMatch(/^[0-9a-f]{12}$/);
    expect(identityTag(context(errnoProbe("ESRCH")))).toBe(tag);
  });

  it.each([
    ["host", { host: "other-host" }],
    ["boot ID", { bootId: "boot-2" }],
    ["PID namespace", { pidNamespace: "pid:[2]" }],
  ])("differs when the %s differs", (_label, change) => {
    const base: LivenessContext = {
      ...context(aliveProbe),
      bootId: "boot-1",
      pidNamespace: "pid:[1]",
    };

    expect(identityTag({ ...base, ...change })).not.toBe(identityTag(base));
  });
});

describe("isLocalPidGone", () => {
  it("is true only for a positive integer pid the probe reports gone", () => {
    const gone = context(errnoProbe("ESRCH"));

    expect(isLocalPidGone(4242, gone)).toBe(true);
    expect(isLocalPidGone(0, gone)).toBe(false);
    expect(isLocalPidGone(4242, context(aliveProbe))).toBe(false);
  });
});
