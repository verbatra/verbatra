import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { IntegrityPillView } from "../client/integrity-pill.js";
import { hasGlossaryHits } from "../client/key-value-context.js";
import { limitReasonFor } from "../client/length-limit.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { GlossaryHitList, SaveRow, TranslationField } from "./entry-editor-parts.js";
import { LimitControl } from "./LimitControl.js";
import { useDraftCheck } from "./use-draft-check.js";
import type { LocaleEdit } from "./use-locale-edit.js";

export interface LocaleEditFormProps {
  readonly locale: string;
  readonly keyName: string;
  readonly edit: LocaleEdit;
  readonly pill: IntegrityPillView | null;
  readonly attachField: (node: HTMLTextAreaElement | null) => undefined | (() => void);
  readonly promptOpen: boolean;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

export function LocaleEditForm({
  locale,
  keyName,
  edit,
  pill,
  attachField,
  promptOpen,
  onSave,
  onCancel,
}: LocaleEditFormProps): ReactNode {
  const { context, draft, submit } = edit;
  const loaded = context.kind === "loaded";
  const glossaryHits = loaded && hasGlossaryHits(context.glossary);
  const check = useDraftCheck(locale, keyName, draft, glossaryHits);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const attach = useCallback(
    (node: HTMLTextAreaElement | null) => {
      fieldRef.current = node;
      return attachField(node);
    },
    [attachField],
  );

  useEffect(() => {
    if (loaded) {
      fieldRef.current?.focus();
    }
  }, [loaded]);

  if (context.kind === "loading") {
    return <p className="m-0 mt-2 text-sm text-muted-foreground">Loading current value…</p>;
  }
  if (context.kind === "error") {
    return (
      <div className="mt-2">
        <ErrorMessage
          error={context.error}
          detail={limitReasonFor(context.error)}
          retrying={edit.retrying}
          onRetry={edit.retry}
          onCancel={onCancel}
        />
      </div>
    );
  }
  return (
    <div className="mt-2" data-locale-edit={locale}>
      {context.target === undefined ? (
        <p className="m-0 mb-2 text-sm text-muted-foreground">
          No translation exists yet for this locale.
        </p>
      ) : null}
      {glossaryHits ? (
        <div className="mb-3">
          <GlossaryHitList glossary={context.glossary} locale={locale} check={check} />
        </div>
      ) : null}
      <TranslationField
        keyName={keyName}
        locale={locale}
        value={draft}
        source={context.source}
        maxLength={context.maxLength}
        limitControl={
          <LimitControl key={keyName} keyName={keyName} context={context} onChanged={edit.reload} />
        }
        invalid={pill?.tone === "danger" && draft === context.target}
        busy={submit.kind === "submitting"}
        textAreaRef={attach}
        rows={5}
        onChange={edit.setDraft}
        onSave={onSave}
      />
      <div className="mt-3">
        <SaveRow submit={submit} onSave={onSave} onCancel={onCancel} primary={!promptOpen} />
      </div>
    </div>
  );
}
