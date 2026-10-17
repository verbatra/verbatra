import type { ReactNode } from "react";
import { useState } from "react";
import {
  deriveRetranslateOutcome,
  isProtectedRefusal,
  type RetranslateOutcome,
} from "../client/retranslate-outcome.js";
import { settledActionStatusLabel } from "../client/settled-action-status.js";
import { rpcClient } from "./api.js";
import { Button } from "./Button.js";
import { actionStatusTextClassName, settledOutcomeTone } from "./lib/action-status-classes.js";

type ButtonState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "protected" }
  | { readonly kind: "settled"; readonly outcome: RetranslateOutcome };

function statusLabel(state: ButtonState): string {
  if (state.kind === "loading") {
    return "Retranslating…";
  }
  if (state.kind === "settled") {
    return settledActionStatusLabel(state.outcome, "Retranslated");
  }
  if (state.kind === "protected") {
    return "A person wrote this value.";
  }
  return "Retranslate";
}

export function RetranslateButton({
  locale,
  keyName,
}: {
  readonly locale: string;
  readonly keyName: string;
}): ReactNode {
  const [state, setState] = useState<ButtonState>({ kind: "idle" });

  async function retranslate(includeHuman: boolean): Promise<void> {
    setState({ kind: "loading" });
    const response = await rpcClient.call("translation.retranslateEntry", {
      locale,
      key: keyName,
      ...(includeHuman ? { includeHuman: true } : {}),
    });
    setState(
      isProtectedRefusal(response)
        ? { kind: "protected" }
        : { kind: "settled", outcome: deriveRetranslateOutcome(response) },
    );
  }

  return (
    <span className="ms-2 inline-flex items-center gap-2">
      <Button disabled={state.kind === "loading"} onClick={() => void retranslate(false)}>
        Retranslate
      </Button>
      {state.kind !== "idle" ? (
        <span
          className={actionStatusTextClassName(
            settledOutcomeTone(state.kind === "settled" ? state.outcome : undefined),
          )}
        >
          {statusLabel(state)}
        </span>
      ) : null}
      {state.kind === "protected" ? (
        <Button variant="ghost" onClick={() => void retranslate(true)}>
          Replace anyway
        </Button>
      ) : null}
    </span>
  );
}
