import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { TranslationValue } from "./TranslationValue.js";
import { DrawerShell, Section } from "./ui.js";
import { useDialogA11y } from "./use-dialog-a11y.js";

export interface BulkRejectEntry {
  readonly locale: string;
  readonly key: string;
  readonly value: string;
}

function entryCount(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

export function BulkRejectDialog({
  entries,
  onConfirm,
  onClose,
}: {
  readonly entries: readonly BulkRejectEntry[];
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose });
  return (
    <DrawerShell
      kicker="Reject translations"
      title={`Reject ${entryCount(entries.length)}`}
      ariaLabel={`Reject ${entryCount(entries.length)}`}
      closeLabel="Keep the selected translations and close"
      onClose={onClose}
      containerRef={containerRef}
    >
      <Section title="Translations to reject">
        <ul className="m-0 max-h-80 list-none space-y-3 overflow-y-auto p-0">
          {entries.map((entry) => (
            <li key={`${entry.locale}\u0000${entry.key}`} data-bulk-reject-entry="">
              <p className="m-0 font-mono text-sm text-foreground">
                {entry.key} <span className="text-muted-foreground">({entry.locale})</span>
              </p>
              <TranslationValue
                as="p"
                value={entry.value}
                locale={entry.locale}
                className="m-0 mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground"
              />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="What happens">
        <ul className="m-0 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          <li>Each translation is removed from its locale file.</li>
          <li>
            The keys count as missing until the next <code>verbatra translate</code> run fills them
            again, or someone writes new values.
          </li>
          <li>
            The rejections are saved to <code>verbatra.provenance.json</code>. An entry whose value
            changed since you loaded the queue is left alone and reported.
          </li>
        </ul>
      </Section>
      <span className="flex flex-wrap items-center gap-3">
        <Button variant="danger" size="md" onClick={onConfirm}>
          Reject and remove {entryCount(entries.length)}
        </Button>
        <Button size="md" onClick={onClose}>
          Cancel
        </Button>
      </span>
    </DrawerShell>
  );
}
