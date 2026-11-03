import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";
import { buttonClasses } from "@verbatra/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
        className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}
      >
        {t("label", { client: mcpInstallClientName(AGENT_CLIENT_CONFIGS, client) })}
      </a>
    </p>
  );
}
