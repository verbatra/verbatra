import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import {
  MCP_INSTALL_LINKS,
  type McpInstallClient,
  mcpInstallClientName,
} from "@/lib/mcp-install-links";

export function McpInstallLink({ client }: { client: McpInstallClient }): ReactNode {
  const t = useTranslations("docs.mcpInstall");
  return (
    <p className="not-prose my-4">
      <a
        href={MCP_INSTALL_LINKS[client]}
        className={buttonClasses("secondary", "sm", "min-h-11")}
        data-umami-event="mcp-install"
        data-umami-event-client={client}
      >
        {t("label", { client: mcpInstallClientName(client) })}
      </a>
    </p>
  );
}
