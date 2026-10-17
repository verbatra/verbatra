import { afterEach, describe, expect, it, vi } from "vitest";

const reportContactEnvMock = vi.fn();

vi.mock("@/lib/contact-env", () => ({ reportContactEnv: reportContactEnvMock }));

const { register } = await import("./instrumentation");

afterEach(() => {
  vi.unstubAllEnvs();
  reportContactEnvMock.mockReset();
});

describe("register", () => {
  it("checks the contact form environment when the Node.js server boots", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    await register();
    expect(reportContactEnvMock).toHaveBeenCalledTimes(1);
  });

  it("skips the check during next build, which runs without the runtime secrets", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await register();
    expect(reportContactEnvMock).not.toHaveBeenCalled();
  });

  it("skips the check on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(reportContactEnvMock).not.toHaveBeenCalled();
  });

  it("resolves instead of throwing when the variables are missing, so the site keeps serving", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    reportContactEnvMock.mockReturnValue(["ARCJET_KEY"]);
    await expect(register()).resolves.toBeUndefined();
  });
});
