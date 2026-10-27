import { loader } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { sidebarTitle, sidebarTitlePlugin } from "./sidebar-title";

describe("sidebarTitle", () => {
  it("reads a string sidebar title and ignores anything else", () => {
    expect(sidebarTitle({ sidebarTitle: "Overview" })).toBe("Overview");
    expect(sidebarTitle({ sidebarTitle: 3 })).toBeUndefined();
    expect(sidebarTitle({})).toBeUndefined();
  });
});

describe("sidebarTitlePlugin", () => {
  it("names a page in the tree by its sidebar title and keeps the page title", () => {
    const source = loader({
      baseUrl: "/docs",
      source: {
        files: [
          {
            type: "page",
            path: "cli/index.mdx",
            data: { title: "CLI reference", sidebarTitle: "Overview" },
          },
          { type: "page", path: "cli/init.mdx", data: { title: "verbatra init" } },
        ],
      },
      plugins: [sidebarTitlePlugin()],
    });
    const [folder] = source.getPageTree().children;
    if (folder?.type !== "folder") throw new Error("expected a folder");

    expect(folder.index?.name).toBe("Overview");
    expect(folder.children.map((node) => node.name)).toEqual(["verbatra init"]);
    expect(source.getPage(["cli"])?.data.title).toBe("CLI reference");
  });
});
