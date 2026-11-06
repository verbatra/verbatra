import { Badge, DetailList, MonoValue, SectionCard } from "@verbatra/ui";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef } from "react";
import { glossaryIndicatorLabel } from "../../client/glossary-editing.js";
import type { ProjectSnapshotResult, StudioRateLimit } from "../../shared/rpc/snapshot.js";
import { rpcClient } from "../api.js";
import { ErrorMessage } from "../ErrorMessage.js";
import { MetricCard } from "../MetricCard.js";
import { PageHeader } from "../PageHeader.js";
import { PanelSkeleton } from "../PanelSkeleton.js";
import { useReadModel } from "../use-read-model.js";

const RECOVERY_FOCUS =
  "scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function ProjectMetrics({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
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
    snapshot.capabilities.spendWithheld === "policy" || snapshot.provider.id === "none" ? (
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

function windowLabel(windowMs: number): string {
  const seconds = Math.round(windowMs / 1_000);
  if (seconds % 60 === 0 && seconds >= 60) {
    const minutes = seconds / 60;
    return minutes === 1 ? "minute" : `${minutes} minutes`;
  }
  return seconds === 1 ? "second" : `${seconds} seconds`;
}

function limitLabel(limit: StudioRateLimit): string {
  return `${limit.max} per ${windowLabel(limit.windowMs)}`;
}

function optionalItems(snapshot: ProjectSnapshotResult): Array<readonly [string, ReactNode]> {
  const items: Array<readonly [string, ReactNode]> = [];
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
  return items;
}

function glossaryEditNote(snapshot: ProjectSnapshotResult): string {
  if (!snapshot.capabilities.writeToDisk) {
    return "no";
  }
  return snapshot.glossary.source === "inline"
    ? "no (the glossary is written inline in the config)"
    : "no (there is no glossary file)";
}

function sessionItems(snapshot: ProjectSnapshotResult): Array<readonly [string, ReactNode]> {
  const { limits } = snapshot.capabilities;
  const items: Array<readonly [string, ReactNode]> = [
    ["Provider actions", <ProviderActions key="spend" snapshot={snapshot} />],
    ["Edit translations", snapshot.capabilities.writeToDisk ? "yes" : "no"],
    [
      "Edit glossary",
      snapshot.capabilities.writeToDisk && snapshot.glossary.source === "file"
        ? "yes"
        : glossaryEditNote(snapshot),
    ],
  ];
  if (limits !== undefined) {
    items.push(["Retranslate limit", limitLabel(limits.retranslate)]);
    items.push(["Review decision limit", limitLabel(limits.reviewDecision)]);
  }
  return items;
}

function ProjectDetails({ snapshot }: { readonly snapshot: ProjectSnapshotResult }): ReactNode {
  const items: Array<readonly [string, ReactNode]> = [
    [
      "File pattern",
      <MonoValue key="file-pattern" breakAnywhere>
        {breakAfterSlashes(snapshot.files.pattern)}
      </MonoValue>,
    ],
    [
      "Glossary",
      <span key="glossary" className="wrap-anywhere">
        {glossaryIndicatorLabel(snapshot.glossary)}
      </span>,
    ],
    ...sessionItems(snapshot),
    ...optionalItems(snapshot),
  ];
  return <DetailList items={items} />;
}

function readSnapshot() {
  return rpcClient.call("project.snapshot", {});
}

export function SettingsPanel(): ReactNode {
  const model = useReadModel(readSnapshot, 0);
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
        title="Settings"
        description="The configuration this session was started with, and what this session may do."
      />
      {state.status === "loading" ? (
        <PanelSkeleton label="Loading the settings" layout="settings" />
      ) : null}
      {state.status === "error" ? (
        <ErrorMessage error={state.error} retrying={state.retrying} onRetry={model.retry} />
      ) : null}
      {state.status === "loaded" ? (
        <div
          ref={recoveryRef}
          tabIndex={-1}
          data-recovery-target="settings"
          className={RECOVERY_FOCUS}
        >
          <ProjectMetrics snapshot={state.value} />
          <SectionCard
            title="Configuration"
            intro={<span className="wrap-anywhere">Loaded from {state.value.configSource}</span>}
            className="mb-0"
          >
            <ProjectDetails snapshot={state.value} />
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}
