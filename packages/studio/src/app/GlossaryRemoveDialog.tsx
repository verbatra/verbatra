import { Badge, Button, DrawerShell, Section, useDialogA11y } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { type TermLoss, termLoss } from "../client/glossary-editing.js";
import type {
  GlossaryDoNotTranslateView,
  GlossaryTermView,
  GlossaryWriteParams,
} from "../shared/rpc/glossary.js";
import { TranslationValue } from "./TranslationValue.js";

export type RemovalRequest =
  | {
      readonly kind: "term";
      readonly term: GlossaryTermView;
      readonly cause: "remove" | "clear";
      readonly edit: GlossaryWriteParams;
    }
  | {
      readonly kind: "kept";
      readonly entry: GlossaryDoNotTranslateView;
      readonly edit: GlossaryWriteParams;
    };

function rules(count: number): string {
  return `${count} never-use ${count === 1 ? "rule" : "rules"}`;
}

function TermLossList({ loss }: { readonly loss: TermLoss }): ReactNode {
  return (
    <ul className="m-0 list-disc space-y-1 ps-5 text-sm text-foreground">
      {loss.translations.map((translation) => (
        <li key={translation.locale ?? ""} className="wrap-anywhere">
          {translation.locale === undefined ? "Translation for all locales: " : null}
          {translation.locale !== undefined ? (
            <Badge tone="neutral" verbatim>
              {translation.locale}
            </Badge>
          ) : null}{" "}
          <TranslationValue value={translation.value} locale={translation.locale} />
        </li>
      ))}
      {loss.forbiddenRules > 0 ? <li>{rules(loss.forbiddenRules)}</li> : null}
      {loss.note !== undefined ? (
        <li className="wrap-anywhere">
          Note: <span dir="auto">{loss.note}</span>
        </li>
      ) : null}
      {loss.partOfSpeech !== undefined ? (
        <li className="wrap-anywhere">
          Part of speech: <span dir="auto">{loss.partOfSpeech}</span>
        </li>
      ) : null}
      {loss.caseSensitive ? <li>Match case</li> : null}
    </ul>
  );
}

function titleOf(request: RemovalRequest): string {
  if (request.kind === "kept") {
    return "Stop keeping this term untranslated";
  }
  return request.cause === "clear"
    ? "Clearing this translation removes the term"
    : "Remove this term";
}

export function GlossaryRemoveDialog({
  request,
  onConfirm,
  onClose,
}: {
  readonly request: RemovalRequest;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const closeUnlessSubmitting = (): void => {
    if (!submitting) {
      onClose();
    }
  };
  const containerRef = useDialogA11y<HTMLDivElement>({
    isOpen: true,
    onClose: closeUnlessSubmitting,
  });
  const title = titleOf(request);
  const source = request.kind === "term" ? request.term.source : request.entry.term;
  return (
    <DrawerShell
      title={title}
      ariaLabel={title}
      closeLabel="Keep the term and close"
      onClose={closeUnlessSubmitting}
      containerRef={containerRef}
    >
      <p
        className="m-0 mb-4 wrap-anywhere font-mono text-sm font-semibold text-accent-foreground"
        dir="auto"
      >
        {source}
      </p>
      <Section title="What is lost">
        {request.kind === "term" ? (
          <TermLossList loss={termLoss(request.term)} />
        ) : (
          <p className="m-0 text-sm text-foreground">
            Every locale translates this term again
            {request.entry.caseSensitive ? ", and its Match case setting is dropped" : ""}.
          </p>
        )}
      </Section>
      <Section title="What happens">
        <ul className="m-0 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          <li>
            The change is written to the glossary file straight away. Studio has no undo; restore it
            from version control if you need it back.
          </li>
          {request.kind === "term" ? (
            <li>Translations already in your locale files are not touched.</li>
          ) : null}
        </ul>
      </Section>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          variant="danger"
          size="md"
          aria-disabled={submitting || undefined}
          onClick={() => {
            if (!submitting) {
              setSubmitting(true);
              onConfirm();
            }
          }}
        >
          {submitting ? "Removing…" : request.kind === "kept" ? "Stop keeping it" : "Remove term"}
        </Button>
        <Button size="md" aria-disabled={submitting || undefined} onClick={closeUnlessSubmitting}>
          Cancel
        </Button>
      </span>
    </DrawerShell>
  );
}
