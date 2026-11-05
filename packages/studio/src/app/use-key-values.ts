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
    };

interface HeldValues {
  readonly keyName: string;
  readonly state: KeyValuesState;
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
      localeList.map((locale) => rpcClient.call("key.value", { locale, key: keyName })),
    ).then((responses) => {
      if (cancelled) {
        return;
      }
      const failure = responses.find((response) => !response.ok);
      if (failure !== undefined && !failure.ok && responses.every((response) => !response.ok)) {
        setHeld({ keyName, state: { kind: "error", error: failure.error } });
        setRetrying(false);
        return;
      }
      let source: string | undefined;
      let description: string | undefined;
      const targets = new Map<string, string | undefined>();
      const provenance = new Map<string, KeyProvenance>();
      responses.forEach((response, index) => {
        const locale = localeList[index];
        if (locale === undefined || !response.ok) {
          return;
        }
        source ??= response.result.source;
        description ??= response.result.description;
        targets.set(locale, response.result.target);
        if (response.result.provenance !== undefined) {
          provenance.set(locale, response.result.provenance);
        }
      });
      setHeld({ keyName, state: { kind: "loaded", source, description, targets, provenance } });
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
