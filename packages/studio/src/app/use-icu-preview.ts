import { useCallback, useEffect, useRef, useState } from "react";
import {
  ICU_PREVIEW_DELAY_MS,
  type PreparedSamples,
  type SupportedIcuPreview,
  samplesKey,
} from "../client/icu-preview.js";
import { orNetworkFailure } from "../client/rpc-client.js";
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
  readonly pending: boolean;
  readonly retrying: boolean;
  readonly retry: () => void;
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
        if (!response.ok) {
          setView({
            kind: "error",
            error: { code: response.error.code, message: response.error.message },
          });
        } else if (!response.result.supported) {
          setView({ kind: "not-icu" });
        } else {
          setView({ kind: "answer", answer: response.result });
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

  return { view, pending, retrying, retry };
}
