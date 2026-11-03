import { Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { ToolRegistrationFailure } from "../webmcp/registration-report.js";

export interface AgentToolsAlertProps {
  readonly failures: readonly ToolRegistrationFailure[];
}

export function AgentToolsAlert({ failures }: AgentToolsAlertProps): ReactNode {
  const first = failures.at(0);
  if (first === undefined) {
    return null;
  }
  return (
    <p
      className="mb-4 flex items-start gap-2 rounded-md border-s-[3px] border-warning bg-warning-soft px-4 py-3 text-warning"
      role="alert"
    >
      <Icon name="alert" className="mt-0.5 flex-none" />
      <span>
        Agent tools degraded: {failures.length} of the agent tool registrations failed with{" "}
        {first.errorName}. The dashboard itself is unaffected. The browser console lists every
        failing tool.
      </span>
    </p>
  );
}
