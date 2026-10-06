import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import {
  type McpInstallClient,
  mcpInstallClientName,
  mcpInstallLink,
} from "@/lib/mcp-install-links";

export function McpInstallLink({ client }: { client: McpInstallClient }): ReactNode {
  const t = useTranslations("docs.mcpInstall");
  return (
    <p className="not-prose my-4">
      <a
        href={mcpInstallLink(AGENT_CLIENT_CONFIGS, client)}
        className={buttonClasses("secondary", "sm", "min-h-11")}
        data-umami-event="mcp-install"
        data-umami-event-client={client}
      >
        {t("label", { client: mcpInstallClientName(AGENT_CLIENT_CONFIGS, client) })}
      </a>
    </p>
  );
}
