import { loader } from "fumadocs-core/source";
import { statusBadgesPlugin } from "fumadocs-core/source/plugins/status-badges";
import { docs } from "@/.source/server";
import { i18n } from "@/lib/i18n";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
  plugins: [
    statusBadgesPlugin({
      renderBadge: (status) => (
        <span
          className="ms-1.5 rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wide"
          style={{ background: "var(--v-purple)", color: "hsl(290 60% 96%)" }}
        >
          {status}
        </span>
      ),
    }),
  ],
});
