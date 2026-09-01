import { loader } from "fumadocs-core/source";
import { statusBadgesPlugin } from "fumadocs-core/source/plugins/status-badges";
import { docs } from "@/.source/server";
import { NewBadge } from "@/components/new-badge";
import { i18n } from "@/lib/i18n";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
  plugins: [
    statusBadgesPlugin({
      renderBadge: (status) => <NewBadge>{status}</NewBadge>,
    }),
  ],
});
