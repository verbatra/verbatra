import { loader } from "fumadocs-core/source";
import { docs } from "@/.source/server";
import { i18n } from "@/lib/i18n";
import { expiringStatusPlugin, RELEASED_VERSIONS } from "@/lib/new-status";
import { sidebarTitlePlugin } from "@/lib/sidebar-title";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
  plugins: [sidebarTitlePlugin(), expiringStatusPlugin(RELEASED_VERSIONS)],
});
