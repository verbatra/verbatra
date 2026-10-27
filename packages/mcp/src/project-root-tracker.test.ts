import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { trackProjectRoot } from "./project-root-tracker.js";
import { openProjectSession } from "./project-session.js";
import { baseVerbatraConfig, makeProject, writeJsonFile } from "./test-support.js";

describe("trackProjectRoot", () => {
  it("reports a root that a config created in a parent directory after the start moves", async () => {
    const root = await makeProject({ greeting: "Hello" }, { de: {} });
    await mkdir(join(root, ".git"), { recursive: true });
    const nested = join(root, "src");
    await mkdir(nested, { recursive: true });
    const onChange = vi.fn();
    const tracked = trackProjectRoot(await openProjectSession({ cwd: nested }), nested, onChange);

    expect(tracked.root()).toBe(nested);
    expect(tracked.project.latest().kind).toBe("unconfigured");

    await writeJsonFile(
      join(root, ".verbatrarc.json"),
      baseVerbatraConfig({ provider: { id: "none", options: {} } }),
    );
    const state = await tracked.project.current();
    await tracked.project.current();

    expect(state.kind).toBe("configured");
    expect(tracked.root()).toBe(root);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(root);
  });

  it("keeps the root and stays quiet while the config does not move", async () => {
    const root = await makeProject({ greeting: "Hello" }, { de: {} });
    await writeJsonFile(
      join(root, ".verbatrarc.json"),
      baseVerbatraConfig({ provider: { id: "none", options: {} } }),
    );
    const onChange = vi.fn();
    const tracked = trackProjectRoot(await openProjectSession({ cwd: root }), root, onChange);

    await tracked.project.current();

    expect(tracked.root()).toBe(root);
    expect(onChange).not.toHaveBeenCalled();
  });
});
