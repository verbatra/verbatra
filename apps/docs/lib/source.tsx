import { loader } from "fumadocs-core/source";
import { docs } from "@/.source/server";
import { i18n } from "@/lib/i18n";
import { expiringStatusPlugin } from "@/lib/new-status";
import { MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
  plugins: [
    expiringStatusPlugin({ cli: PACKAGE_VERSION, studio: STUDIO_VERSION, mcp: MCP_VERSION }),
  ],
});
