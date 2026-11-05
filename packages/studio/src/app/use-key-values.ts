import type { KeyProvenance } from "@verbatra/sdk";
import { useEffect, useState } from "react";
import type { StructuredError } from "../client/state.js";
import { rpcClient } from "./api.js";

export type KeyValuesState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: StructuredError }
  | {
      readonly kind: "loaded";
      readonly source: string | undefined;
      readonly description: string | undefined;
      readonly targets: ReadonlyMap<string, string | undefined>;
      readonly provenance: ReadonlyMap<string, KeyProvenance>;
      readonly failures: ReadonlyMap<string, StructuredError>;
    };

interface HeldValues {
  readonly keyName: string;
  readonly state: KeyValuesState;
}

interface LocaleAnswer {
  readonly locale: string;
  readonly response: Awaited<ReturnType<typeof rpcClient.call<"key.value">>>;
}

function settleValues(answers: readonly LocaleAnswer[]): KeyValuesState {
  const failed = answers.flatMap(({ response }) => (response.ok ? [] : [response.error]));
  const [firstFailure] = failed;
  if (firstFailure !== undefined && failed.length === answers.length) {
    return { kind: "error", error: firstFailure };
  }
  let source: string | undefined;
  let description: string | undefined;
  const targets = new Map<string, string | undefined>();
  const provenance = new Map<string, KeyProvenance>();
  const failures = new Map<string, StructuredError>();
  for (const { locale, response } of answers) {
    if (!response.ok) {
      failures.set(locale, response.error);
      continue;
    }
    source ??= response.result.source;
    description ??= response.result.description;
    targets.set(locale, response.result.target);
    if (response.result.provenance !== undefined) {
      provenance.set(locale, response.result.provenance);
    }
  }
  return { kind: "loaded", source, description, targets, provenance, failures };
}

const LOADING: KeyValuesState = { kind: "loading" };

export function useKeyValues(
  keyName: string,
  locales: readonly string[],
  refreshToken: number,
): { readonly values: KeyValuesState; readonly retrying: boolean; retry(): void } {
  const [held, setHeld] = useState<HeldValues>({ keyName, state: LOADING });
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const localesKey = locales.join(" ");

  useEffect(() => {
    let cancelled = false;
    const localeList = localesKey === "" ? [] : localesKey.split(" ");
    void Promise.all(
      localeList.map(async (locale) => ({
        locale,
        response: await rpcClient.call("key.value", { locale, key: keyName }),
      })),
    ).then((answers) => {
      if (cancelled) {
        return;
      }
      setHeld({ keyName, state: settleValues(answers) });
      setRetrying(false);
    });
    return () => {
      cancelled = true;
    };
  }, [keyName, localesKey, refreshToken, attempt]);

  return {
    values: held.keyName === keyName ? held.state : LOADING,
    retrying,
    retry: () => {
      setRetrying(true);
      setAttempt((count) => count + 1);
    },
  };
}
