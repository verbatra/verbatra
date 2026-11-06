import { Badge, DetailList, MonoValue, SectionCard } from "@verbatra/ui";
import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import type { StructuredError } from "../../client/state.js";
import type { ProjectSnapshotResult } from "../../shared/rpc/snapshot.js";
import { rpcClient } from "../api.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { Loading } from "../Loading.js";
import { MetricCard } from "../MetricCard.js";
import { PageHeader } from "../PageHeader.js";

function ProjectMetrics({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        label="Source locale"
        value={
          <span dir="ltr" data-identifier="">
            <MonoValue>{snapshot.sourceLocale}</MonoValue>
          </span>
        }
      />
      <MetricCard
        label="Target locales"
        value={String(snapshot.targetLocales.length)}
        hint={snapshot.targetLocales.join(", ")}
      />
      <MetricCard
        label="Format"
        value={
          <span dir="ltr" data-identifier="">
            <MonoValue breakAnywhere>{snapshot.format}</MonoValue>
          </span>
        }
      />
      <MetricCard
        label="Provider"
        value={
          <span dir="ltr" data-identifier="">
            <MonoValue breakAnywhere>{snapshot.provider.id}</MonoValue>
          </span>
        }
      />
    </div>
  );
}

type SettingsState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: StructuredError }
  | { readonly status: "loaded"; readonly snapshot: ProjectSnapshotResult };

function breakAfterSlashes(pattern: string): ReactNode {
  return pattern.split("/").map((part, index, parts) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

function ProviderActions({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  if (snapshot.capabilities.spend) {
    return <Badge tone="success">Enabled</Badge>;
  }
  const hint: ReactNode =
    snapshot.capabilities.spendWithheld === "policy" ? (
      "machine translation disabled by policy"
    ) : (
      <>
        start with <span className="whitespace-nowrap">--allow-spend</span>
      </>
    );
  return (
    <span>
      Off <span className="text-muted-foreground">({hint})</span>
    </span>
  );
}

function ProjectDetails({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  const items: Array<readonly [string, ReactNode]> = [
    [
      "File pattern",
      <MonoValue key="file-pattern">{breakAfterSlashes(snapshot.files.pattern)}</MonoValue>,
    ],
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
        title="Settings"
        description="The configuration this session was started with, and what this session may do."
      />
      <SettingsPanelBody />
    </>
  );
}

function SettingsPanelBody(): ReactNode {
  const [state, setState] = useState<SettingsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("project.snapshot", {}).then((response) => {
      if (cancelled) {
        return;
      }
      setState(
        response.ok
          ? { status: "loaded", snapshot: response.result }
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
    <div>
      <ProjectMetrics snapshot={state.snapshot} />
      <SectionCard
        title="Configuration"
        intro={`Loaded from ${state.snapshot.configSource}`}
        className="mb-0"
      >
        <ProjectDetails snapshot={state.snapshot} />
      </SectionCard>
    </div>
  );
}
