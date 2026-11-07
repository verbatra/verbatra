import { Button } from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useId, useState } from "react";
import { KeyHistoryPanel } from "./KeyHistoryPanel.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";
import { useCapabilities } from "./use-capabilities.js";
import { useKeyHistory } from "./use-key-history.js";
import type { LocaleEdit } from "./use-locale-edit.js";

interface EditEntryHistoryProps {
  readonly locale: string;
  readonly keyName: string;
  readonly edit: LocaleEdit;
  readonly current: string | undefined;
  readonly textAreaRef: RefObject<HTMLTextAreaElement | null>;
}

function OpenHistory({
  locale,
  keyName,
  edit,
  current,
  textAreaRef,
  id,
}: EditEntryHistoryProps & { readonly id: string }): ReactNode {
  const [replacing, setReplacing] = useState<string | null>(null);
  const capabilities = useCapabilities();
  const read = useKeyHistory({ enabled: true, locale, keyName, refreshToken: 0 });

  function load(value: string): void {
    setReplacing(null);
    edit.setDraft(value);
    textAreaRef.current?.focus();
  }

  return (
    <div id={id} className="mt-3">
      {replacing !== null ? (
        <UnsavedPrompt
          subject={
            <>
              The <span className="font-mono">{locale}</span> translation has changes that are not
              saved. Restoring replaces them.
            </>
          }
          saving={false}
          error={null}
          placement="drawer"
          onDiscard={() => load(replacing)}
          onKeepEditing={() => {
            setReplacing(null);
            textAreaRef.current?.focus();
          }}
        />
      ) : null}
      <KeyHistoryPanel
        keyName={keyName}
        locale={locale}
        read={read}
        current={current}
        canWrite={capabilities.kind === "loaded" && capabilities.capabilities.writeToDisk}
        onRestore={(value) => (edit.dirty ? setReplacing(value) : load(value))}
      />
    </div>
  );
}

export function EditEntryHistory(props: EditEntryHistoryProps): ReactNode {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="mt-6" data-edit-history="">
      <Button
        size="sm"
        className="max-md:min-h-11"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-edit-history-toggle=""
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide history" : "Show history"}
      </Button>
      {open ? <OpenHistory {...props} id={panelId} /> : null}
    </div>
  );
}
