import { Badge } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { StructuredError } from "../../client/state.js";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import { rpcClient } from "../api.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { GlossarySection, glossaryIndicatorLabel } from "../GlossarySection.js";
import { Loading } from "../Loading.js";
import { PageHeader } from "../PageHeader.js";

type GlossaryState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: StructuredError }
  | { readonly status: "loaded"; readonly glossary: GlossaryGetResult };

function GlossaryMeta({ glossary }: { readonly glossary: GlossaryGetResult }): ReactNode {
  const count = glossary.terms.length;
  return (
    <>
      {count > 0 ? (
        <Badge tone="neutral">
          {count} {count === 1 ? "term" : "terms"}
        </Badge>
      ) : null}
      <span>Source: {glossaryIndicatorLabel(glossary.indicator)}</span>
    </>
  );
}

export function GlossaryPanel(): ReactNode {
  const [state, setState] = useState<GlossaryState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("glossary.get", {}).then((response) => {
      if (cancelled) {
        return;
      }
      setState(
        response.ok
          ? { status: "loaded", glossary: response.result }
          : { status: "error", error: response.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Glossary"
        description="The terms every translation of this project is kept consistent with."
        {...(state.status === "loaded" ? { meta: <GlossaryMeta glossary={state.glossary} /> } : {})}
      />
      {state.status === "loading" ? <Loading /> : null}
      {state.status === "error" ? <ErrorMessage error={state.error} /> : null}
      {state.status === "loaded" ? (
        <GlossarySection
          glossary={state.glossary}
          onChange={(glossary) => setState({ status: "loaded", glossary })}
        />
      ) : null}
    </>
  );
}
