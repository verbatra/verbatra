import { Badge } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { glossaryIndicatorLabel } from "../../client/glossary-editing.js";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import { rpcClient } from "../api.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { GlossarySection } from "../GlossarySection.js";
import { PageHeader } from "../PageHeader.js";
import { PanelSkeleton } from "../PanelSkeleton.js";
import type { PanelProps } from "../panel-props.js";
import { useReadModel } from "../use-read-model.js";

function GlossaryMeta({ glossary }: { readonly glossary: GlossaryGetResult }): ReactNode {
  const count = glossary.terms.length;
  return (
    <>
      {count > 0 ? (
        <Badge tone="neutral">
          {count} {count === 1 ? "term" : "terms"}
        </Badge>
      ) : null}
      <span className="min-w-0 wrap-anywhere">
        Source: {glossaryIndicatorLabel(glossary.indicator)}
      </span>
    </>
  );
}

const RECOVERY_FOCUS =
  "scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function readGlossary() {
  return rpcClient.call("glossary.get", {});
}

export function GlossaryPanel({ refreshToken }: PanelProps): ReactNode {
  const model = useReadModel(readGlossary, refreshToken);
  const { state } = model;
  const recoveryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (model.recovered > 0 && (active === null || active === document.body)) {
      recoveryRef.current?.focus();
    }
  }, [model.recovered]);

  return (
    <>
      <PageHeader
        title="Glossary"
        description="The terms every translation of this project is kept consistent with."
        {...(state.status === "loaded" ? { meta: <GlossaryMeta glossary={state.value} /> } : {})}
      />
      {state.status === "loading" ? (
        <PanelSkeleton label="Loading the glossary" layout="list" />
      ) : null}
      {state.status === "error" ? (
        <ErrorMessage error={state.error} retrying={state.retrying} onRetry={model.retry} />
      ) : null}
      {state.status === "loaded" ? (
        <div
          ref={recoveryRef}
          tabIndex={-1}
          data-recovery-target="glossary"
          className={RECOVERY_FOCUS}
        >
          {state.stale !== undefined ? (
            <ErrorMessage
              error={state.stale}
              prefix="Could not refresh the glossary, so this is the last version Studio read."
              retrying={state.retrying}
              onRetry={model.retry}
            />
          ) : null}
          {model.deferred ? (
            <p role="status" className="m-0 mb-3 text-sm text-muted-foreground">
              A refresh is waiting. Studio re-reads the glossary when you finish editing.
            </p>
          ) : null}
          <GlossarySection
            glossary={state.value}
            onChange={model.replace}
            onHoldChange={model.setHolding}
          />
        </div>
      ) : null}
    </>
  );
}
