import type { LoaderPlugin } from "fumadocs-core/source";
import type { Item } from "fumadocs-core/source/plugins/status-badges";
import { readIntroducedIn } from "./introduced-in";
import { isStillNew, type ReleasedVersions } from "./release-line";
import versionData from "./version.generated.json";

export const RELEASED_VERSIONS: ReleasedVersions = {
  cli: versionData.version,
  studio: versionData.studioVersion,
  mcp: versionData.mcpVersion,
};

export function pageStatus(data: object, released: ReleasedVersions): string | undefined {
  const status = "status" in data && typeof data.status === "string" ? data.status : undefined;
  if (status !== "new") return status;
  const introducedIn = readIntroducedIn("_exports" in data ? data._exports : undefined);
  return introducedIn && isStillNew(introducedIn, released) ? status : undefined;
}

export function expiringStatusPlugin(released: ReleasedVersions): LoaderPlugin {
  return {
    name: "verbatra:expiring-status",
    transformPageTree: {
      file(node, filePath) {
        if (!filePath) return node;
        const file = this.storage.read(filePath);
        if (file?.format !== "page") return node;
        const status = pageStatus(file.data, released);
        if (status === undefined) return node;
        const item: Item = { ...node, status };
        return item;
      },
    },
  };
}
