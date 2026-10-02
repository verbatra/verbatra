import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "./Button.js";
import { DrawerShell, Section } from "./ui.js";
import { useDialogA11y } from "./use-dialog-a11y.js";

function entryCount(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

export function ApproveLocaleDialog({
  locale,
  count,
  originLabel,
  onConfirm,
  onClose,
}: {
  readonly locale: string;
  readonly count: number;
  readonly originLabel: string | null;
  readonly onConfirm: (settled: () => void) => void;
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
  const scope = originLabel === null ? "" : ` written by ${originLabel.toLowerCase()}`;
  const title = `Approve every entry in ${locale}`;
  return (
    <DrawerShell
      title={title}
      ariaLabel={title}
      closeLabel={`Keep the ${locale} queue and close`}
      onClose={closeUnlessSubmitting}
      containerRef={containerRef}
    >
      <Section title="What happens">
        <ul className="m-0 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          <li>
            Every entry of {locale}
            {scope} that needs review is approved, {entryCount(count)} as the queue was last loaded,
            including entries a search hides.
          </li>
          <li>
            An entry whose source changed since it was written stays in the queue; edit or
            retranslate it first.
          </li>
          <li>
            The approvals are saved to <code>verbatra.provenance.json</code>. Commit it to share
            them. Any later change to a value puts it back in the queue.
          </li>
        </ul>
      </Section>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={submitting}
          onClick={() => {
            setSubmitting(true);
            onConfirm(onClose);
          }}
        >
          {submitting ? "Approving…" : `Approve ${entryCount(count)}`}
        </Button>
        <Button size="md" disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </span>
    </DrawerShell>
  );
}
