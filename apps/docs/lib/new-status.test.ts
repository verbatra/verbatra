import { loader } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { expiringStatusPlugin, pageStatus } from "./new-status";
import type { ReleasedVersions } from "./release-line";

const released: ReleasedVersions = { cli: "0.11.1", studio: "0.5.2", mcp: "0.2.2" };

describe("pageStatus", () => {
  it("keeps a fresh new status and drops an expired or undated one", () => {
    const fresh = { status: "new", _exports: { introducedIn: { version: "0.11.0" } } };
    expect(pageStatus(fresh, released)).toBe("new");
    const expired = { status: "new", _exports: { introducedIn: { version: "0.9.0" } } };
    expect(pageStatus(expired, released)).toBeUndefined();
    expect(pageStatus({ status: "new" }, released)).toBeUndefined();
  });

  it("passes other statuses through and ignores pages without one", () => {
    expect(pageStatus({ status: "beta" }, released)).toBe("beta");
    expect(pageStatus({ title: "Diff" }, released)).toBeUndefined();
  });
});

describe("expiringStatusPlugin", () => {
  function page(path: string, data: object) {
    return { type: "page" as const, path, data: { title: path, ...data } };
  }

  it("marks only the pages whose NEW badge has not expired", () => {
    const source = loader({
      baseUrl: "/docs",
      source: {
        files: [
          page("fresh.mdx", { status: "new", _exports: { introducedIn: { version: "0.11.0" } } }),
          page("stale.mdx", { status: "new", _exports: { introducedIn: { version: "0.9.0" } } }),
          page("plain.mdx", {}),
        ],
      },
      plugins: [expiringStatusPlugin(released)],
    });
    const statuses = source
      .getPageTree()
      .children.map((node) => [node.name, "status" in node ? node.status : undefined]);
    expect(statuses).toEqual([
      ["fresh.mdx", "new"],
      ["plain.mdx", undefined],
      ["stale.mdx", undefined],
    ]);
  });
});
