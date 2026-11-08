import { Button, TextField } from "@verbatra/ui";
import type { FormEvent, KeyboardEvent, ReactNode, Ref, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { errorDetail } from "../client/error-copy.js";
import type { KeyValueContext } from "../client/key-value-context.js";
import {
  type LimitControlView,
  limitControlView,
  limitCountText,
  parseLimitInput,
} from "../client/length-limit.js";
import type { StructuredError } from "../client/state.js";
import { rpcClient } from "./api.js";
import { ErrorMessage } from "./ErrorMessage.js";

type LoadedContext = Extract<KeyValueContext, { kind: "loaded" }>;

interface Awaiting {
  readonly context: LoadedContext;
  readonly value: number | null;
}

type FocusTarget = "input" | "trigger" | null;

const ADVISORY =
  "Advisory only: a value over the limit is flagged for review, never blocked or shortened. The limit applies to this key in every locale.";

const TOUCH = "max-md:min-h-11";

function awaitedView(
  base: LimitControlView,
  awaiting: Awaiting | null,
  context: LoadedContext,
): LimitControlView {
  if (awaiting === null || awaiting.context !== context) {
    return base;
  }
  return awaiting.value === null
    ? { mode: "none", value: undefined, notice: undefined }
    : { mode: "file", value: awaiting.value, notice: undefined };
}

function statusText(view: LimitControlView): string {
  switch (view.mode) {
    case "config":
      return `Limit: ${limitCountText(view.value)}, set by the config. Change it in the config. Studio read the config when it started, so a change made since needs a restart of Studio.`;
    case "file":
      return `Limit: ${limitCountText(view.value)}, from verbatra.limits.json.`;
    case "none":
      return "No limit is set for this key.";
    case "blocked":
      return "Limits cannot be changed here until verbatra.limits.json is fixed.";
  }
}

function LimitStatus({ view }: { readonly view: LimitControlView }): ReactNode {
  return (
    <>
      <p className="m-0 text-xs text-muted-foreground" data-limit-status="">
        {statusText(view)}
      </p>
      {view.notice !== undefined ? (
        <p className="m-0 mt-1 text-xs text-warning" data-limit-notice="">
          {view.notice}
        </p>
      ) : null}
      {view.mode !== "blocked" ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground" data-limit-advisory="">
          {ADVISORY}
        </p>
      ) : null}
    </>
  );
}

function LimitActions({
  view,
  saving,
  triggerRef,
  onOpen,
  onRemove,
}: {
  readonly view: LimitControlView;
  readonly saving: boolean;
  readonly triggerRef: Ref<HTMLButtonElement>;
  readonly onOpen: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        ref={triggerRef}
        size="xs"
        className={TOUCH}
        data-limit-open=""
        aria-disabled={saving ? true : undefined}
        onClick={saving ? undefined : onOpen}
      >
        {view.mode === "file" ? "Change limit" : "Set limit"}
      </Button>
      {view.mode === "file" ? (
        <Button
          size="xs"
          className={TOUCH}
          data-limit-remove=""
          aria-busy={saving ? true : undefined}
          aria-disabled={saving ? true : undefined}
          onClick={saving ? undefined : onRemove}
        >
          {saving ? "Removing…" : "Remove limit"}
        </Button>
      ) : null}
    </span>
  );
}

function LimitForm({
  text,
  problem,
  saving,
  inputRef,
  onText,
  onSubmit,
  onCancel,
}: {
  readonly text: string;
  readonly problem: string;
  readonly saving: boolean;
  readonly inputRef: Ref<HTMLInputElement>;
  readonly onText: (next: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const inputId = useId();
  const problemId = useId();
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      event.preventDefault();
      onCancel();
    }
  }
  return (
    <form className="mt-2" onSubmit={onSubmit} noValidate data-limit-form="">
      <label htmlFor={inputId} className="block text-xs font-semibold text-foreground">
        Limit in characters
      </label>
      <span className="mt-1 flex flex-wrap items-center gap-2">
        <TextField
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          size="sm"
          className={`w-36 ${TOUCH}`}
          value={text}
          readOnly={saving}
          aria-busy={saving ? true : undefined}
          aria-invalid={problem === "" ? undefined : true}
          aria-describedby={problemId}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className={TOUCH}
          aria-busy={saving ? true : undefined}
          aria-disabled={saving ? true : undefined}
          data-limit-save=""
        >
          {saving ? "Saving…" : "Save limit"}
        </Button>
        <Button
          size="sm"
          className={TOUCH}
          data-limit-cancel=""
          aria-disabled={saving ? true : undefined}
          onClick={saving ? undefined : onCancel}
        >
          Cancel
        </Button>
      </span>
      <p
        id={problemId}
        aria-live="polite"
        className="m-0 mt-1 min-h-4 text-xs text-danger"
        data-limit-problem=""
      >
        {problem}
      </p>
    </form>
  );
}

function useFocusAfter(editing: boolean): {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly target: RefObject<FocusTarget>;
} {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const target = useRef<FocusTarget>(null);
  useEffect(() => {
    if (target.current === "input" && editing) {
      target.current = null;
      inputRef.current?.focus();
    } else if (target.current === "trigger" && !editing) {
      target.current = null;
      triggerRef.current?.focus();
    }
  });
  return { inputRef, triggerRef, target };
}

function problemText(text: string, attempted: boolean): string {
  const parsed = parseLimitInput(text);
  return parsed.kind === "error" && (attempted || text.trim() !== "") ? parsed.message : "";
}

export function LimitControl({
  keyName,
  context,
  onChanged,
}: {
  readonly keyName: string;
  readonly context: LoadedContext;
  readonly onChanged: () => void;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<StructuredError | null>(null);
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);
  const savingRef = useRef(false);
  const { inputRef, triggerRef, target } = useFocusAfter(editing);
  const view = awaitedView(limitControlView(context), awaiting, context);
  const editable = view.mode === "file" || view.mode === "none";

  function open(): void {
    setText(view.value === undefined ? "" : String(view.value));
    setAttempted(false);
    setFailure(null);
    setEditing(true);
    target.current = "input";
  }

  function close(): void {
    setEditing(false);
    setAttempted(false);
    target.current = "trigger";
  }

  async function write(maxLength: number | null): Promise<void> {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailure(null);
    const response = await rpcClient.call("key.setMaxLength", { key: keyName, maxLength });
    savingRef.current = false;
    setSaving(false);
    if (!response.ok) {
      setFailure(response.error);
      target.current = editing ? "input" : "trigger";
      return;
    }
    setAwaiting({ context, value: response.result.maxLength });
    setEditing(false);
    setAttempted(false);
    target.current = "trigger";
    onChanged();
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    setAttempted(true);
    const parsed = parseLimitInput(text);
    if (parsed.kind === "ok") {
      void write(parsed.value);
    } else {
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mt-2" data-limit-control="" data-limit-mode={view.mode}>
      <LimitStatus view={view} />
      {editable && !editing ? (
        <LimitActions
          view={view}
          saving={saving}
          triggerRef={triggerRef}
          onOpen={open}
          onRemove={() => void write(null)}
        />
      ) : null}
      {editable && editing ? (
        <LimitForm
          text={text}
          problem={problemText(text, attempted)}
          saving={saving}
          inputRef={inputRef}
          onText={setText}
          onSubmit={submit}
          onCancel={close}
        />
      ) : null}
      {failure !== null ? (
        <div className="mt-2" data-limit-failure="">
          <ErrorMessage error={failure} detail={errorDetail(failure)} />
        </div>
      ) : null}
    </div>
  );
}
