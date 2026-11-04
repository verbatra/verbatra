import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { StructuredError } from "../../client/state.js";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import { rpcClient } from "../api.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { GlossarySection } from "../GlossarySection.js";
import { Loading } from "../Loading.js";
import { PageHeader } from "../PageHeader.js";

type GlossaryState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: StructuredError }
  | { readonly status: "loaded"; readonly glossary: GlossaryGetResult };

export function GlossaryPanel(): ReactNode {
  return (
    <>
      <PageHeader
        title="Glossary"
        description="The terms every translation of this project is kept consistent with."
      />
      <GlossaryPanelBody />
    </>
  );
}

function GlossaryPanelBody(): ReactNode {
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

  if (state.status === "loading") {
    return <Loading />;
  }
  if (state.status === "error") {
    return <ErrorMessage error={state.error} />;
  }
  return (
    <GlossarySection
      glossary={state.glossary}
      onChange={(glossary) => setState({ status: "loaded", glossary })}
    />
  );
}
