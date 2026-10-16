"use client";

import {
  type ComponentType,
  type ReactNode,
  type Ref,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Button from "@/components/ui/button";
import type { PlaygroundItem, PlaygroundTranslations } from "@/lib/landing-playground";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import type { ScrambleController, ScrambleRow } from "./playground-scramble";

export type PlaygroundLanguage = { readonly code: string; readonly name: string };

export type PlaygroundLabels = {
  readonly items: string;
  readonly languages: string;
  readonly translate: string;
  readonly results: string;
  readonly source: string;
  readonly noLanguages: string;
};

export type PlaygroundDemoProps = {
  readonly items: ReadonlyArray<PlaygroundItem>;
  readonly languages: ReadonlyArray<PlaygroundLanguage>;
  readonly translations: PlaygroundTranslations;
  readonly sourceLocale: string;
  readonly defaultItem: string;
  readonly labels: PlaygroundLabels;
  readonly snippet: ReactNode;
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

export const SCRAMBLER_WAIT_MS = 800;

const SENTENCE_END = /[.!?。！？]$/u;

let scramblerLoad: Promise<ScramblerComponent> | undefined;

export function loadScrambler(): Promise<ScramblerComponent> {
  scramblerLoad ??= import("./playground-scramble").then(
    (module) => module.Scrambler,
    (error: unknown) => {
      scramblerLoad = undefined;
      throw error;
    },
  );
  return scramblerLoad;
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
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

export function PlaygroundDemo({
  items,
  languages,
  translations,
  sourceLocale,
  defaultItem,
  labels,
  snippet,
  details,
}: PlaygroundDemoProps): ReactNode {
  const id = useId();
  const allLanguages = languages.map((language) => language.code);
  const [item, setItem] = useState(defaultItem);
  const [checked, setChecked] = useState<ReadonlyArray<string>>(allLanguages);
  const [shown, setShown] = useState<Shown>({ item: defaultItem, langs: allLanguages });
  const [pending, setPending] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [Scrambler, setScrambler] = useState<ScramblerComponent | null>(null);
  const runs = useRef(0);
  const list = useRef<HTMLOListElement>(null);
  const controller = useRef<ScrambleController>(null);
  const played = useRef<number | null>(null);
  const rows = resultRows(shown, items, languages, translations);

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

  const translate = async () => {
    runs.current += 1;
    const run = runs.current;
    setAnnouncement(null);
    if (checked.length === 0) {
      setPending(null);
      setAnnouncement({ run, message: labels.noLanguages });
      return;
    }
    const next: Shown = { item, langs: checked };
    const animate = prefersReducedMotion()
      ? null
      : await within(loadScrambler(), SCRAMBLER_WAIT_MS);
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: warming the animation module on pointer or focus inside the demo is not an interaction of its own
    <div className="vk-playground" onPointerEnter={warm} onFocus={warm} onTouchStart={warm}>
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
        <Button type="button" size="md" className="vk-playground-translate" onClick={translate}>
          {labels.translate}
        </Button>
      </div>
      <div className="vk-playground-output">
        {snippet}
        <div className="vk-playground-result-block">
          <h3 id={`${id}-results`} className="vk-playground-results-title">
            {labels.results}
          </h3>
          <p className="vk-playground-source">
            <span className="vk-playground-result-lang">{labels.source}</span>
            <span lang={sourceLocale}>{source}</span>
          </p>
          <ol
            ref={list}
            aria-labelledby={`${id}-results`}
            className="vk-playground-results"
            data-scrambling={pending === null ? undefined : ""}
          >
            {rows.map((row) => (
              <li key={row.lang} className="vk-playground-result" data-lang={row.lang}>
                <span className="vk-playground-result-lang">{row.name}</span>
                <span className="vk-playground-result-value">
                  <span aria-hidden="true" className="vk-playground-sizer">
                    {row.from}
                  </span>
                  <span lang={row.lang} className="vk-playground-result-text">
                    {row.to}
                  </span>
                  <span
                    aria-hidden="true"
                    className="vk-playground-scramble"
                    data-scramble={row.lang}
                  />
                </span>
              </li>
            ))}
          </ol>
          <div aria-live="polite" aria-atomic="true" className="sr-only" data-playground-live="">
            <Spoken announcement={announcement} />
          </div>
        </div>
        {details}
      </div>
      {Scrambler === null ? null : <Scrambler scope={list} controller={controller} />}
    </div>
  );
}
