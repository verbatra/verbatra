import { Button, TextField } from "@verbatra/ui";
import type { FormEvent, KeyboardEvent, ReactNode, Ref } from "react";
import { useEffect, useId, useRef } from "react";
import { errorDetail } from "../client/error-copy.js";
import { type LimitControlView, limitCountText } from "../client/length-limit.js";
import type { StructuredError } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";
import { type FocusKeeperAdapter, useFocusKeeper } from "./use-focus-keeper.js";
import type { LimitDraft } from "./use-limit-draft.js";

const ADVISORY =
  "Advisory only: the length line shows the count now, and a translate run flags a value over the limit for review. Nothing is blocked or shortened. The limit applies to this key in every locale.";

const TOUCH = "max-md:min-h-11";

const ITEM = "data-limit-item";

const ITEMS = ["open", "remove", "input", "save", "cancel"];

function findItem(root: HTMLElement, item: string): HTMLElement | undefined {
  return root.querySelector<HTMLElement>(`[${ITEM}="${item}"]`) ?? undefined;
}

const KEEPER: FocusKeeperAdapter = {
  items: (root) => ITEMS.filter((item) => findItem(root, item) !== undefined),
  itemOf: (active) => active.dataset.limitItem,
  find: findItem,
  fallback: (root) => (root.firstElementChild as HTMLElement).focus({ preventScroll: true }),
};

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
      <p className="m-0 text-xs text-muted-foreground" data-limit-status="" tabIndex={-1}>
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
        data-limit-item="open"
        data-focus-id="limit-open"
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
          data-limit-item="remove"
          data-focus-id="limit-remove"
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
  limit,
  inputRef,
  onSubmit,
  onCancel,
}: {
  readonly limit: LimitDraft;
  readonly inputRef: Ref<HTMLInputElement>;
  readonly onSubmit: (event: FormEvent) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const inputId = useId();
  const problemId = useId();
  const { saving, problem } = limit;
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
          className={cn("w-44", TOUCH)}
          data-limit-item="input"
          data-focus-id="limit-input"
          value={limit.text}
          readOnly={saving}
          aria-busy={saving ? true : undefined}
          aria-invalid={problem === "" ? undefined : true}
          aria-describedby={problemId}
          onChange={(event) => limit.setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className={TOUCH}
          data-limit-save=""
          data-limit-item="save"
          aria-busy={saving ? true : undefined}
          aria-disabled={saving ? true : undefined}
        >
          {saving ? "Saving…" : "Save limit"}
        </Button>
        <Button
          size="sm"
          className={TOUCH}
          aria-label="Cancel the limit change"
          data-limit-cancel=""
          data-limit-item="cancel"
          aria-disabled={saving ? true : undefined}
          onClick={saving ? undefined : onCancel}
        >
          Cancel
        </Button>
      </span>
      <p
        id={problemId}
        aria-live="polite"
        className="m-0 mt-1 min-h-8 text-xs text-danger md:min-h-4"
        data-limit-problem=""
      >
        {problem}
      </p>
    </form>
  );
}

export function LimitControl({
  limit,
  readFailure,
}: {
  readonly limit: LimitDraft;
  readonly readFailure: StructuredError | null;
}): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusAfter = useRef<"input" | "trigger" | null>(null);
  useFocusKeeper(rootRef, KEEPER);
  const { view, open } = limit;
  const editable = view.mode === "file" || view.mode === "none";

  useEffect(() => {
    if (focusAfter.current === "input" && open) {
      focusAfter.current = null;
      inputRef.current?.focus();
    } else if (focusAfter.current === "trigger" && !open) {
      focusAfter.current = null;
      triggerRef.current?.focus();
    }
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    focusAfter.current = "trigger";
    void limit.save().then((saved) => {
      if (!saved) {
        focusAfter.current = "input";
        inputRef.current?.focus();
      }
    });
  }

  return (
    <div ref={rootRef} className="mt-2" data-limit-control="" data-limit-mode={view.mode}>
      <LimitStatus view={view} />
      {editable && !open ? (
        <LimitActions
          view={view}
          saving={limit.saving}
          triggerRef={triggerRef}
          onOpen={() => {
            focusAfter.current = "input";
            limit.begin();
          }}
          onRemove={() => {
            focusAfter.current = "trigger";
            void limit.remove();
          }}
        />
      ) : null}
      {editable && open ? (
        <LimitForm
          limit={limit}
          inputRef={inputRef}
          onSubmit={submit}
          onCancel={() => {
            focusAfter.current = "trigger";
            limit.cancel();
          }}
        />
      ) : null}
      {limit.failure !== null ? (
        <div className="mt-2" data-limit-failure="">
          <ErrorMessage error={limit.failure} detail={errorDetail(limit.failure)} />
        </div>
      ) : null}
      {limit.awaitingRead && readFailure !== null ? (
        <div className="mt-2" data-limit-read-failure="">
          <ErrorMessage
            error={readFailure}
            prefix="The limit was saved, but Studio could not read it back."
          />
        </div>
      ) : null}
    </div>
  );
}
