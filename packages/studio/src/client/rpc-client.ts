import type { RpcMethodName, RpcParamsFor, RpcResultFor } from "../shared/rpc/contract.js";
import { NETWORK_ERROR_COPY } from "./error-copy.js";
import type { SessionStore } from "./state.js";

export interface FetchResponseLike {
  readonly status: number;
  json(): Promise<unknown>;
}

export interface RequestInitLike {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type FetchLike = (url: string, init: RequestInitLike) => Promise<FetchResponseLike>;

export type RpcCallResult<M extends RpcMethodName> =
  | { readonly ok: true; readonly result: RpcResultFor<M> }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryAfterSeconds?: number;
      };
    };

export interface RpcClientOptions {
  readonly fetchImpl: FetchLike;
  readonly session: SessionStore;
  readonly endpoint?: string;
}

export interface RpcClient {
  call<M extends RpcMethodName>(method: M, params: RpcParamsFor<M>): Promise<RpcCallResult<M>>;
}

const SESSION_EXPIRED_ERROR = {
  code: "SESSION_EXPIRED",
  message: "The session has expired. Reload the page to start a new one.",
} as const;

export const NETWORK_FAILURE_ERROR = {
  code: "NETWORK_ERROR",
  message: NETWORK_ERROR_COPY,
} as const;

export async function orNetworkFailure<M extends RpcMethodName>(
  pending: Promise<RpcCallResult<M>>,
): Promise<RpcCallResult<M>> {
  try {
    return await pending;
  } catch {
    return { ok: false, error: NETWORK_FAILURE_ERROR };
  }
}

function isEnvelopeShaped(value: unknown): value is { readonly ok: boolean } {
  return typeof value === "object" && value !== null && "ok" in value;
}

export function createRpcClient(options: RpcClientOptions): RpcClient {
  const endpoint = options.endpoint ?? "/rpc";

  async function call<M extends RpcMethodName>(
    method: M,
    params: RpcParamsFor<M>,
  ): Promise<RpcCallResult<M>> {
    if (options.session.getState().kind === "session-expired") {
      return { ok: false, error: SESSION_EXPIRED_ERROR };
    }

    let payload: unknown;
    try {
      const response = await options.fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, params }),
      });
      if (response.status === 401) {
        options.session.markSessionExpired();
        return { ok: false, error: SESSION_EXPIRED_ERROR };
      }
      payload = await response.json();
    } catch {
      return { ok: false, error: NETWORK_FAILURE_ERROR };
    }
    if (!isEnvelopeShaped(payload)) {
      return {
        ok: false,
        error: { code: "REQUEST_INVALID", message: "The server returned an unexpected response." },
      };
    }
    return payload as RpcCallResult<M>;
  }

  return { call };
}
