import { useCallback, useEffect, useRef, useState } from "react";
import {
  ICU_PREVIEW_DELAY_MS,
  type PreparedSamples,
  type SupportedIcuPreview,
  samplesKey,
  type ValidIcuPreview,
} from "../client/icu-preview.js";
import { orNetworkFailure, type RpcCallResult } from "../client/rpc-client.js";
import type { StructuredError } from "../client/state.js";
import { ICU_PREVIEW_VALUE_MAX_LENGTH } from "../shared/rpc/key-preview-icu.js";
import { rpcClient } from "./api.js";

export type IcuPreviewView =
  | { readonly kind: "loading" }
  | { readonly kind: "answer"; readonly answer: SupportedIcuPreview }
  | { readonly kind: "not-icu" }
  | { readonly kind: "error"; readonly error: StructuredError };

export interface IcuPreviewRead {
  readonly view: IcuPreviewView;
  readonly lastValid: ValidIcuPreview | undefined;
  readonly pending: boolean;
  readonly retrying: boolean;
  readonly retry: () => void;
}

function viewFor(response: RpcCallResult<"key.previewIcu">): IcuPreviewView {
  if (!response.ok) {
    return { kind: "error", error: response.error };
  }
  return response.result.supported
    ? { kind: "answer", answer: response.result }
    : { kind: "not-icu" };
}

const TOO_LONG: IcuPreviewView = {
  kind: "answer",
  answer: { supported: true, valid: false, reason: "too-long" },
};

export function useIcuPreview(input: {
  readonly locale: string;
  readonly value: string;
  readonly samples: PreparedSamples;
}): IcuPreviewRead {
  const { locale, value, samples } = input;
  const [view, setView] = useState<IcuPreviewView>({ kind: "loading" });
  const [lastValid, setLastValid] = useState<ValidIcuPreview | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const latest = useRef(0);
  const immediate = useRef(false);
  const samplesRef = useRef(samples);
  samplesRef.current = samples;
  const argsKey = samplesKey(samples);

  useEffect(() => {
    if (value.length > ICU_PREVIEW_VALUE_MAX_LENGTH) {
      setView(TOO_LONG);
      setPending(false);
      setRetrying(false);
      return;
    }
    latest.current += 1;
    const mine = latest.current;
    const delay = immediate.current ? 0 : ICU_PREVIEW_DELAY_MS;
    immediate.current = false;
    setPending(true);
    const timer = window.setTimeout(() => {
      const args = samplesRef.current.args;
      void orNetworkFailure(
        rpcClient.call("key.previewIcu", {
          locale,
          value,
          ...(args !== undefined ? { args } : {}),
        }),
      ).then((response) => {
        if (latest.current !== mine) {
          return;
        }
        setPending(false);
        setRetrying(false);
        const next = viewFor(response);
        setView(next);
        if (next.kind === "answer" && next.answer.valid) {
          setLastValid(next.answer);
        }
      });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      latest.current += 1;
    };
  }, [locale, value, argsKey, retryToken]);

  const retry = useCallback(() => {
    immediate.current = true;
    setRetrying(true);
    setRetryToken((token) => token + 1);
  }, []);

  return { view, lastValid, pending, retrying, retry };
}
