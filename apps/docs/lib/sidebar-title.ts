import type { LoaderPlugin } from "fumadocs-core/source";

export function sidebarTitle(data: object): string | undefined {
  return "sidebarTitle" in data && typeof data.sidebarTitle === "string"
    ? data.sidebarTitle
    : undefined;
}

export function sidebarTitlePlugin(): LoaderPlugin {
  return {
    name: "verbatra:sidebar-title",
    transformPageTree: {
      file(node, filePath) {
        if (!filePath) return node;
        const file = this.storage.read(filePath);
        if (file?.format !== "page") return node;
        const name = sidebarTitle(file.data);
        return name === undefined ? node : { ...node, name };
      },
    },
  };
}
