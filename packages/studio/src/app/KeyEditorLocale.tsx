import { Badge, Button, DetailList, MonoValue } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { KeyLocaleStatusRow } from "../client/diff-view.js";
import {
  deriveIntegrityPillView,
  type IntegrityPillView,
  type KeyIntegrityLocaleEntry,
} from "../client/integrity-pill.js";
import { provenanceDetailItems } from "../client/provenance-view.js";
import { canRetranslate } from "../client/retranslate-eligibility.js";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { KeyLocaleStatusBadge } from "./DiffBadge.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { RetranslateButton } from "./RetranslateButton.js";
import { TranslationValue } from "./TranslationValue.js";
import type { KeyValuesState } from "./use-key-values.js";

function LocaleValue({
  values,
  locale,
  retrying,
  onRetry,
}: {
  readonly values: KeyValuesState;
  readonly locale: string;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}): ReactNode {
  if (values.kind !== "loaded") {
    return null;
  }
  const failure = values.failures.get(locale);
  if (failure !== undefined) {
    return <ErrorMessage error={failure} retrying={retrying} onRetry={onRetry} />;
  }
  const value = values.targets.get(locale);
  if (value === undefined) {
    return <p className="m-0 mt-2 text-sm text-muted-foreground">No translation yet.</p>;
  }
  return (
    <TranslationValue
      as="p"
      value={value}
      locale={locale}
      className="m-0 mt-2 break-words text-sm text-foreground"
    />
  );
}

function LocaleProvenance({
  values,
  locale,
}: {
  readonly values: KeyValuesState;
  readonly locale: string;
}): ReactNode {
  const provenance = values.kind === "loaded" ? values.provenance.get(locale) : undefined;
  if (provenance === undefined) {
    return null;
  }
  const items: ReadonlyArray<readonly [string, ReactNode]> = [
    ["Origin", <ProvenanceBadge key="origin" provenance={provenance} />],
    ...provenanceDetailItems(provenance).map(
      ({ label, value, identifier }) =>
        [label, identifier ? <MonoValue key={label}>{value}</MonoValue> : value] as const,
    ),
  ];
  return (
    <div className="mt-2">
      <DetailList items={items} />
    </div>
  );
}

function IntegrityCell({
  pill,
  locale,
  keyName,
  capabilities,
}: {
  readonly pill: IntegrityPillView | null;
  readonly locale: string;
  readonly keyName: string;
  readonly capabilities: StudioCapabilities | undefined;
}): ReactNode {
  if (pill === null) {
    return null;
  }
  return (
    <>
      <Badge tone={pill.tone}>{pill.label}</Badge>
      {canRetranslate(capabilities, pill) ? (
        <RetranslateButton locale={locale} keyName={keyName} />
      ) : null}
    </>
  );
}

function IntegrityDetail({ pill }: { readonly pill: IntegrityPillView | null }): ReactNode {
  if (pill === null || pill.detail === null) {
    return null;
  }
  return (
    <p className="m-0 mt-1 break-words text-xs text-muted-foreground" data-integrity-detail="">
      {pill.detail}
    </p>
  );
}

export interface LocaleBlockProps {
  readonly row: KeyLocaleStatusRow;
  readonly keyName: string;
  readonly integrity: readonly KeyIntegrityLocaleEntry[];
  readonly capabilities: StudioCapabilities | undefined;
  readonly values: KeyValuesState;
  readonly valuesRetrying: boolean;
  readonly onRetryValues: () => void;
  readonly editing: boolean;
  readonly savedNote: boolean;
  readonly onEdit: () => void;
  readonly form: ReactNode;
}

export function LocaleBlock({
  row,
  keyName,
  integrity,
  capabilities,
  values,
  valuesRetrying,
  onRetryValues,
  editing,
  savedNote,
  onEdit,
  form,
}: LocaleBlockProps): ReactNode {
  const canEdit = capabilities?.writeToDisk === true && !editing;
  const pill = deriveIntegrityPillView(integrity, row.locale);
  return (
    <li
      tabIndex={-1}
      className="border-b border-border py-3 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      data-locale={row.locale}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-foreground">{row.locale}</span>
        <KeyLocaleStatusBadge status={row.status} />
        <IntegrityCell
          pill={pill}
          locale={row.locale}
          keyName={keyName}
          capabilities={capabilities}
        />
        {canEdit ? (
          <Button className="ms-auto" data-edit-locale={row.locale} onClick={onEdit}>
            Edit
          </Button>
        ) : null}
      </div>
      <IntegrityDetail pill={pill} />
      {editing ? (
        form
      ) : (
        <>
          <LocaleValue
            values={values}
            locale={row.locale}
            retrying={valuesRetrying}
            onRetry={onRetryValues}
          />
          <LocaleProvenance values={values} locale={row.locale} />
        </>
      )}
      {savedNote ? (
        <p role="status" className="m-0 mt-2 text-xs text-success" data-saved="">
          Saved
        </p>
      ) : null}
    </li>
  );
}
