interface NetworkCause {
  readonly cause: string;
  readonly remedy: string;
}

const REFUSED: NetworkCause = {
  cause: "the connection was refused",
  remedy:
    "Check that the endpoint is running and that the configured host and port are right, then run again.",
};

const UNRESOLVED: NetworkCause = {
  cause: "the host name could not be resolved",
  remedy: "Check the spelling of the configured endpoint and your DNS or network access.",
};

const CLOSED: NetworkCause = {
  cause: "the connection was closed before a reply arrived",
  remedy: "Retry, and check any proxy or firewall between you and the endpoint.",
};

const UNREACHABLE: NetworkCause = {
  cause: "the host could not be reached",
  remedy: "Check your network access and any proxy or firewall between you and the endpoint.",
};

const UNTRUSTED_CERTIFICATE: NetworkCause = {
  cause: "the endpoint's TLS certificate could not be verified",
  remedy:
    "Check the certificate the endpoint serves, or point at a host your system already trusts.",
};

const NETWORK_CAUSE_BY_CODE: Readonly<Record<string, NetworkCause>> = {
  ECONNREFUSED: REFUSED,
  ENOTFOUND: UNRESOLVED,
  EAI_AGAIN: UNRESOLVED,
  ECONNRESET: CLOSED,
  ECONNABORTED: CLOSED,
  EPIPE: CLOSED,
  ETIMEDOUT: UNREACHABLE,
  EHOSTUNREACH: UNREACHABLE,
  ENETUNREACH: UNREACHABLE,
  CERT_HAS_EXPIRED: UNTRUSTED_CERTIFICATE,
  DEPTH_ZERO_SELF_SIGNED_CERT: UNTRUSTED_CERTIFICATE,
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: UNTRUSTED_CERTIFICATE,
  SELF_SIGNED_CERT_IN_CHAIN: UNTRUSTED_CERTIFICATE,
};

const MAX_CAUSE_DEPTH = 4;

function ownCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function nextCause(error: unknown): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("cause" in error) {
    return (error as { readonly cause?: unknown }).cause;
  }
  return "error" in error ? (error as { readonly error?: unknown }).error : undefined;
}

export function findNetworkCause(error: unknown): NetworkCause | undefined {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    const code = ownCode(current);
    if (code !== undefined && Object.hasOwn(NETWORK_CAUSE_BY_CODE, code)) {
      return NETWORK_CAUSE_BY_CODE[code];
    }
    current = nextCause(current);
  }
  return undefined;
}

export function describeNetworkCause(cause: NetworkCause): string {
  return `${cause.cause}. ${cause.remedy}`;
}
