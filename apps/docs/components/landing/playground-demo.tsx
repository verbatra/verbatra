"use client";

import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Button from "@/components/ui/button";
import { CopyControl, type CopyControlStatusLabels } from "@/components/ui/copy-control";
import type { PlaygroundItem, PlaygroundTranslations } from "@/lib/landing-playground";
import {
  type PlaygroundSnippetConfig,
  playgroundSnippet,
  snippetLocaleVar,
} from "@/lib/playground-snippet";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { useHydrated } from "@/lib/use-hydrated";
import { within } from "@/lib/within";
import { CodeFrameShell } from "./code-frame-shell";
import type { ScrambleController, ScrambleRow } from "./playground-scramble";

export type PlaygroundLanguage = { readonly code: string; readonly name: string };

export type PlaygroundLabels = {
  readonly items: string;
  readonly languages: string;
  readonly translate: string;
  readonly results: string;
  readonly source: string;
  readonly noLanguages: string;
  readonly notSelected: string;
  readonly stale: string;
  readonly copy: string;
  readonly copyStatus: CopyControlStatusLabels;
};

export type PlaygroundDemoProps = {
  readonly items: ReadonlyArray<PlaygroundItem>;
  readonly languages: ReadonlyArray<PlaygroundLanguage>;
  readonly translations: PlaygroundTranslations;
  readonly sourceLocale: string;
  readonly defaultItem: string;
  readonly labels: PlaygroundLabels;
  readonly snippet: ReactNode;
  readonly snippetFile: string;
  readonly snippetConfig: PlaygroundSnippetConfig;
  readonly head: ReactNode;
  readonly details: ReactNode;
};

type ResultRow = ScrambleRow & { readonly name: string };

type Shown = { readonly item: string; readonly langs: ReadonlyArray<string> };

type Announcement =
  | { readonly run: number; readonly rows: ReadonlyArray<ResultRow> }
  | { readonly run: number; readonly message: string };

type ScramblerComponent = ComponentType<{
  scope: RefObject<HTMLElement | null>;
  controller: Ref<ScrambleController>;
}>;

type Control = "item" | "language" | "translate";

type FocusedControl = { readonly control: Control; readonly value: string };

type FormState = {
  readonly item: string;
  readonly checked: ReadonlyArray<string>;
  readonly focused: FocusedControl | null;
};

type Candidate = { readonly lang: string; readonly text: string };

export const SCRAMBLER_WAIT_MS = 800;

const SENTENCE_END = /[.!?。！？]$/u;

export function createScramblerLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    cached ??= load().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
}

export const loadScrambler = createScramblerLoader<ScramblerComponent>(() =>
  import("./playground-scramble").then((module) => module.Scrambler),
);

function controlsIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-control]")];
}

function controlValue(element: HTMLElement): string {
  return element instanceof HTMLInputElement ? element.value : "";
}

function focusedControl(root: HTMLElement): FocusedControl | null {
  const active = root.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const control = active.dataset.control as Control | undefined;
  return control === undefined ? null : { control, value: controlValue(active) };
}

function serverForm(
  defaults: FormState,
  items: ReadonlyArray<PlaygroundItem>,
  languages: ReadonlyArray<string>,
): FormState {
  if (typeof document === "undefined") return defaults;
  const root = document.querySelector<HTMLElement>("[data-playground-demo]");
  if (root === null) return defaults;
  const inputs = controlsIn(root).filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement,
  );
  const boxes = inputs.filter((input) => input.dataset.control === "language");
  if (boxes.length === 0) return defaults;
  const picked = inputs.find((input) => input.dataset.control === "item" && input.checked)?.value;
  return {
    item: items.some((entry) => entry.id === picked) ? (picked ?? defaults.item) : defaults.item,
    checked: languages.filter((code) => boxes.some((box) => box.value === code && box.checked)),
    focused: focusedControl(root),
  };
}

function restoreFocus(root: HTMLElement | null, focused: FocusedControl | null): void {
  if (root === null || focused === null) return;
  const target = controlsIn(root).find(
    (element) =>
      element.dataset.control === focused.control && controlValue(element) === focused.value,
  );
  if (target !== undefined && target !== root.ownerDocument.activeElement) {
    target.focus({ preventScroll: true });
  }
}

function resultRows(
  shown: Shown,
  items: ReadonlyArray<PlaygroundItem>,
  languages: ReadonlyArray<PlaygroundLanguage>,
  translations: PlaygroundTranslations,
): ReadonlyArray<ResultRow> {
  const from = items.find((item) => item.id === shown.item)?.text ?? "";
  return languages
    .filter((language) => shown.langs.includes(language.code))
    .map((language) => ({
      lang: language.code,
      name: language.name,
      from,
      to: translations[language.code]?.[shown.item] ?? "",
    }));
}

function languageCandidates(
  lang: string,
  translations: PlaygroundTranslations,
): ReadonlyArray<Candidate> {
  return [...new Set(Object.values(translations[lang] ?? {}))].map((text) => ({ lang, text }));
}

function sameLanguages(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((code) => b.includes(code));
}

function snippetStyle(
  languages: ReadonlyArray<PlaygroundLanguage>,
  shown: ReadonlyArray<string>,
): CSSProperties {
  return Object.fromEntries(
    languages
      .filter((language) => !shown.includes(language.code))
      .map((language) => [snippetLocaleVar(language.code), "none"]),
  );
}

function Sizer({ candidates }: { candidates: ReadonlyArray<Candidate> }): ReactNode {
  return candidates.map((candidate) => (
    <span
      key={`${candidate.lang}\n${candidate.text}`}
      aria-hidden="true"
      lang={candidate.lang}
      className="vk-playground-sizer"
    >
      {candidate.text}
    </span>
  ));
}

function Spoken({ announcement }: { announcement: Announcement | null }): ReactNode {
  if (announcement === null) return null;
  if ("message" in announcement) return <span key={announcement.run}>{announcement.message}</span>;
  return (
    <span key={announcement.run}>
      {announcement.rows.map((row) => (
        <span key={row.lang}>
          {row.name}: <span lang={row.lang}>{row.to}</span>
          {SENTENCE_END.test(row.to) ? " " : ". "}
        </span>
      ))}
    </span>
  );
}

function ResultSlot({
  language,
  row,
  candidates,
  notSelected,
}: {
  language: PlaygroundLanguage;
  row: ResultRow | undefined;
  candidates: ReadonlyArray<Candidate>;
  notSelected: string;
}): ReactNode {
  return (
    <li
      className="vk-playground-result"
      data-lang={language.code}
      data-empty={row === undefined ? "" : undefined}
      aria-hidden={row === undefined ? "true" : undefined}
    >
      <span className="vk-playground-result-lang">{language.name}</span>
      <span className="vk-playground-result-value">
        <Sizer candidates={candidates} />
        {row === undefined ? (
          <span className="vk-playground-result-empty">{notSelected}</span>
        ) : (
          <span lang={row.lang} className="vk-playground-result-text">
            {row.to}
          </span>
        )}
        <span aria-hidden="true" className="vk-playground-scramble" data-scramble={language.code} />
      </span>
    </li>
  );
}

export function PlaygroundDemo({
  items,
  languages,
  translations,
  sourceLocale,
  defaultItem,
  labels,
  snippet,
  snippetFile,
  snippetConfig,
  head,
  details,
}: PlaygroundDemoProps): ReactNode {
  const id = useId();
  const allLanguages = languages.map((language) => language.code);
  const [initial] = useState(() =>
    serverForm({ item: defaultItem, checked: allLanguages, focused: null }, items, allLanguages),
  );
  const [item, setItem] = useState(initial.item);
  const [checked, setChecked] = useState<ReadonlyArray<string>>(initial.checked);
  const [shown, setShown] = useState<Shown>({ item: defaultItem, langs: allLanguages });
  const [pending, setPending] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [Scrambler, setScrambler] = useState<ScramblerComponent | null>(null);
  const runs = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const controller = useRef<ScrambleController>(null);
  const played = useRef<number | null>(null);
  const rows = resultRows(shown, items, languages, translations);
  const [candidates] = useState(
    () =>
      new Map(
        languages.map((language) => [
          language.code,
          languageCandidates(language.code, translations),
        ]),
      ),
  );
  const hydrated = useHydrated();
  const [sources] = useState(() =>
    items.map((entry) => ({ lang: sourceLocale, text: entry.text })),
  );

  useLayoutEffect(() => restoreFocus(root.current, initial.focused), [initial]);

  const warm = () => {
    if (Scrambler !== null || prefersReducedMotion()) return;
    loadScrambler().then(
      (component) => setScrambler(() => component),
      () => undefined,
    );
  };

  const settle = (run: number, settled: ReadonlyArray<ResultRow>) => {
    if (run !== runs.current) return;
    setPending(null);
    setAnnouncement({ run, rows: settled });
  };

  useLayoutEffect(() => {
    if (pending === null || played.current === pending) return;
    played.current = pending;
    const play = controller.current;
    const run = pending;
    const playing = rows;
    if (play === null) {
      settle(run, playing);
      return;
    }
    play.play(playing, () => settle(run, playing));
  });

  const scrambler = async (): Promise<ScramblerComponent | null> => {
    if (prefersReducedMotion()) return null;
    if (Scrambler === null) setWaiting(true);
    const loaded = await within(loadScrambler(), SCRAMBLER_WAIT_MS, null);
    setWaiting(false);
    return loaded;
  };

  const translate = async () => {
    if (waiting) return;
    runs.current += 1;
    const run = runs.current;
    setAnnouncement(null);
    if (checked.length === 0) {
      controller.current?.stop();
      setPending(null);
      setAnnouncement({ run, message: labels.noLanguages });
      return;
    }
    const next: Shown = { item, langs: checked };
    const animate = await scrambler();
    if (run !== runs.current) return;
    setShown(next);
    if (animate === null) {
      setPending(null);
      setAnnouncement({ run, rows: resultRows(next, items, languages, translations) });
      return;
    }
    setScrambler(() => animate);
    setPending(run);
  };

  const toggle = (code: string) =>
    setChecked((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code],
    );

  const source = items.find((entry) => entry.id === shown.item)?.text ?? "";
  const busy = waiting || pending !== null;
  const stale = hydrated && (item !== shown.item || !sameLanguages(checked, shown.langs));
  const snippetLanguages = hydrated && checked.length > 0 ? checked : allLanguages;
  const orderedSnippetLanguages = allLanguages.filter((code) => snippetLanguages.includes(code));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: warming the animation module on pointer or focus inside the demo is not an interaction of its own
    <div
      ref={root}
      className="vk-playground"
      onPointerEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      data-playground-demo=""
    >
      <div className="vk-playground-main">
        {head}
        <div className="vk-playground-controls">
          <fieldset className="vk-playground-fieldset">
            <legend className="vk-playground-legend">{labels.items}</legend>
            <div className="vk-playground-options" data-kind="items">
              {items.map((entry) => (
                <label key={entry.id} className="vk-playground-option">
                  <input
                    type="radio"
                    name={`${id}-item`}
                    value={entry.id}
                    checked={item === entry.id}
                    onChange={() => setItem(entry.id)}
                    data-control="item"
                    className="vk-playground-input vk-playground-radio"
                  />
                  <span lang={sourceLocale}>{entry.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="vk-playground-fieldset">
            <legend className="vk-playground-legend">{labels.languages}</legend>
            <div className="vk-playground-options" data-kind="languages">
              {languages.map((language) => (
                <label key={language.code} className="vk-playground-option">
                  <span className="vk-playground-box">
                    <input
                      type="checkbox"
                      name={`${id}-language`}
                      value={language.code}
                      checked={checked.includes(language.code)}
                      onChange={() => toggle(language.code)}
                      data-control="language"
                      className="vk-playground-input vk-playground-checkbox"
                    />
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      className="vk-playground-check"
                    >
                      <path d="M3 8.5l3.2 3.2L13 4.8" />
                    </svg>
                  </span>
                  <span>{language.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            type="button"
            size="md"
            className="vk-playground-translate"
            onClick={translate}
            data-control="translate"
            aria-disabled={waiting ? "true" : undefined}
          >
            {labels.translate}
          </Button>
        </div>
        <div
          className="vk-playground-result-block"
          aria-busy={busy ? "true" : undefined}
          data-stale={stale ? "" : undefined}
        >
          <div className="vk-playground-results-head">
            <h3 id={`${id}-results`} className="vk-playground-results-title">
              {labels.results}
            </h3>
            <p className="vk-playground-stale">{labels.stale}</p>
          </div>
          <p className="vk-playground-source">
            <span className="vk-playground-result-lang">{labels.source}</span>
            <span className="vk-playground-source-value">
              <Sizer candidates={sources} />
              <span lang={sourceLocale} className="vk-playground-source-text">
                {source}
              </span>
            </span>
          </p>
          <ol
            ref={list}
            aria-labelledby={`${id}-results`}
            className="vk-playground-results"
            data-scrambling={pending === null ? undefined : ""}
          >
            {languages.map((language) => (
              <ResultSlot
                key={language.code}
                language={language}
                row={rows.find((row) => row.lang === language.code)}
                candidates={candidates.get(language.code) ?? []}
                notSelected={labels.notSelected}
              />
            ))}
          </ol>
          <div aria-live="polite" aria-atomic="true" className="sr-only" data-playground-live="">
            <Spoken announcement={announcement} />
          </div>
        </div>
        {details}
      </div>
      <div className="vk-playground-code" style={snippetStyle(languages, orderedSnippetLanguages)}>
        <CodeFrameShell
          lang="ts"
          filename={snippetFile}
          action={
            <CopyControl
              text={playgroundSnippet(snippetConfig, orderedSnippetLanguages)}
              label={labels.copy}
              status={labels.copyStatus}
              size="sm"
            />
          }
        >
          {snippet}
        </CodeFrameShell>
      </div>
      {Scrambler === null ? null : <Scrambler scope={list} controller={controller} />}
    </div>
  );
}
