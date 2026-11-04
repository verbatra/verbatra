import type { ReactNode, RefObject } from "react";
import { useEffect } from "react";
import type { IntegrityPillView } from "../client/integrity-pill.js";
import { hasGlossaryHits } from "../client/key-value-context.js";
import { GlossaryHitList, SaveRow, TranslationField } from "./entry-editor-parts.js";
import { useDraftCheck } from "./use-draft-check.js";
import type { LocaleEdit } from "./use-locale-edit.js";

export interface LocaleEditFormProps {
  readonly locale: string;
  readonly keyName: string;
  readonly edit: LocaleEdit;
  readonly pill: IntegrityPillView | null;
  readonly textAreaRef: RefObject<HTMLTextAreaElement | null>;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

export function LocaleEditForm({
  locale,
  keyName,
  edit,
  pill,
  textAreaRef,
  onSave,
  onCancel,
}: LocaleEditFormProps): ReactNode {
  const { context, draft, submit } = edit;
  const loaded = context.kind === "loaded";
  const glossaryHits = loaded && hasGlossaryHits(context.glossary);
  const check = useDraftCheck(locale, keyName, draft, glossaryHits);

  useEffect(() => {
    if (loaded) {
      textAreaRef.current?.focus();
    }
  }, [loaded, textAreaRef]);

  if (context.kind === "loading") {
    return <p className="m-0 mt-2 text-sm text-muted-foreground">Loading current value…</p>;
  }
  if (context.kind === "error") {
    return <p className="m-0 mt-2 text-sm text-muted-foreground">{context.message}</p>;
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
        locale={locale}
        value={draft}
        source={context.source}
        maxLength={context.maxLength}
        invalid={pill?.tone === "danger" && draft === context.target}
        disabled={submit.kind === "submitting"}
        textAreaRef={textAreaRef}
        rows={5}
        onChange={edit.setDraft}
        onSave={onSave}
      />
      <div className="mt-3">
        <SaveRow submit={submit} onSave={onSave} onCancel={onCancel} />
      </div>
    </div>
  );
}
