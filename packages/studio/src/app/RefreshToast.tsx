import { Button, Icon, Toast } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { canTranslatePending, type RefreshToastView } from "../client/refresh-toast.js";
import {
  deriveTranslatePendingOutcome,
  type TranslatePendingOutcome,
} from "../client/translate-pending-outcome.js";
import { rpcClient } from "./api.js";
import { actionStatusTextClassName } from "./lib/action-status-classes.js";
import { useCapabilities } from "./use-capabilities.js";

type ActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "settled"; readonly outcome: TranslatePendingOutcome };

function actionStatusLabel(state: ActionState): string {
  if (state.kind === "loading") {
    return "Translating…";
  }
  if (state.kind === "settled") {
    if (state.outcome.kind === "success") {
      return "Translated";
    }
    if (state.outcome.kind === "partial-failure") {
      return `Failed for ${state.outcome.failedLocales.join(", ")}`;
    }
    if (state.outcome.kind === "withheld") {
      const keys = state.outcome.withheldCount === 1 ? "key" : "keys";
      return `Withheld ${state.outcome.withheldCount} ${keys} for ${state.outcome.partialLocales.join(", ")}`;
    }
    return `Failed: ${state.outcome.message}`;
  }
  return "";
}

function actionStatusClassName(state: ActionState): string {
  if (state.kind !== "settled") {
    return actionStatusTextClassName(undefined);
  }
  return actionStatusTextClassName(state.outcome.kind === "success" ? "success" : "failure");
}

export interface RefreshToastProps {
  readonly view: RefreshToastView;
  readonly onDismiss: () => void;
}

export function RefreshToast({ view, onDismiss }: RefreshToastProps): ReactNode {
  const [state, setState] = useState<ActionState>({ kind: "idle" });
  const capabilitiesState = useCapabilities();
  const capabilities =
    capabilitiesState.kind === "loaded" ? capabilitiesState.capabilities : undefined;
  const showAction = canTranslatePending(view.actionEligible, capabilities);

  async function handleClick(): Promise<void> {
    setState({ kind: "loading" });
    const response = await rpcClient.call("translation.translatePending", {});
    setState({ kind: "settled", outcome: deriveTranslatePendingOutcome(response) });
  }

  return (
    <Toast>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{view.label}</span>
          <span className="text-sm text-muted-foreground">{view.summary}</span>
        </div>
        <Button
          variant="ghost"
          className="flex-none p-1.5"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <Icon name="close" size={14} />
        </Button>
      </div>
      {showAction || state.kind !== "idle" ? (
        <div className="flex flex-wrap items-center gap-2">
          {showAction ? (
            <Button
              variant="primary"
              className="max-w-full whitespace-normal text-start"
              disabled={state.kind === "loading"}
              onClick={() => void handleClick()}
            >
              Translate pending changes across all locales
            </Button>
          ) : null}
          {state.kind !== "idle" ? (
            <span className={actionStatusClassName(state)}>{actionStatusLabel(state)}</span>
          ) : null}
        </div>
      ) : null}
    </Toast>
  );
}
