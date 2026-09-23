import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { StructuredError } from "../../client/state.js";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import type { ProjectSnapshotResult } from "../../shared/rpc/snapshot.js";
import { rpcClient } from "../api.js";
import { Badge } from "../Badge.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { GlossarySection } from "../GlossarySection.js";
import { Loading } from "../Loading.js";
import { MetricCard } from "../MetricCard.js";
import { PageHeader } from "../PageHeader.js";
import { DetailList, MonoValue, SectionCard } from "../ui.js";

function ProjectMetrics({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Source locale" value={snapshot.sourceLocale} />
      <MetricCard
        label="Target locales"
        value={String(snapshot.targetLocales.length)}
        hint={snapshot.targetLocales.join(", ")}
      />
      <MetricCard label="Format" value={snapshot.format} />
      <MetricCard label="Provider" value={snapshot.provider.id} />
    </div>
  );
}

type SettingsState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: StructuredError }
  | {
      readonly status: "loaded";
      readonly snapshot: ProjectSnapshotResult;
      readonly glossary: GlossaryGetResult;
    };

function ProviderActions({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  if (snapshot.capabilities.spend) {
    return <Badge tone="success">Enabled</Badge>;
  }
  const hint =
    snapshot.provider.id === "none"
      ? "machine translation disabled by policy"
      : "start with --allow-spend";
  return (
    <span>
      Off <span className="text-muted-foreground">({hint})</span>
    </span>
  );
}

function ProjectDetails({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  const items: Array<readonly [string, ReactNode]> = [
    [
      "Target locales",
      <MonoValue key="target-locales">{snapshot.targetLocales.join(", ")}</MonoValue>,
    ],
    ["File pattern", <MonoValue key="file-pattern">{snapshot.files.pattern}</MonoValue>],
    ["Provider actions", <ProviderActions key="spend" snapshot={snapshot} />],
  ];
  if (snapshot.prune !== undefined) {
    items.push(["Prune", snapshot.prune ? "yes" : "no"]);
  }
  if (snapshot.generatePlurals !== undefined) {
    items.push(["Generate plurals", snapshot.generatePlurals ? "yes" : "no"]);
  }
  if (snapshot.maxBatchSize !== undefined) {
    items.push(["Max batch size", String(snapshot.maxBatchSize)]);
  }
  if (snapshot.tone !== undefined) {
    items.push(["Tone", snapshot.tone]);
  }
  return <DetailList items={items} />;
}

export function SettingsPanel(): ReactNode {
  return (
    <>
      <PageHeader
        kicker="Project configuration"
        title="Settings"
        description="The configuration this session was started with, and the project glossary as it stands now."
      />
      <SettingsPanelBody />
    </>
  );
}

function SettingsPanelBody(): ReactNode {
  const [state, setState] = useState<SettingsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      rpcClient.call("project.snapshot", {}),
      rpcClient.call("glossary.get", {}),
    ]).then(([snapshotResponse, glossaryResponse]) => {
      if (cancelled) {
        return;
      }
      if (!snapshotResponse.ok) {
        setState({ status: "error", error: snapshotResponse.error });
        return;
      }
      if (!glossaryResponse.ok) {
        setState({ status: "error", error: glossaryResponse.error });
        return;
      }
      setState({
        status: "loaded",
        snapshot: snapshotResponse.result,
        glossary: glossaryResponse.result,
      });
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
    <div>
      <ProjectMetrics snapshot={state.snapshot} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionCard
          title="Configuration"
          intro={`Loaded from ${state.snapshot.configSource}`}
          className="mb-0"
        >
          <ProjectDetails snapshot={state.snapshot} />
        </SectionCard>
        <GlossarySection
          glossary={state.glossary}
          onChange={(glossary) => setState({ ...state, glossary })}
        />
      </div>
    </div>
  );
}
