import { isValidAllowedHost } from "./allowed-host.js";
import {
  ALLOWED_HOST_MESSAGE,
  NETWORK_POLICY_MODES,
  type NetworkPolicyMode,
} from "./network-config.js";
import type { NetworkRule } from "./policy.js";

export const NETWORK_POLICY_ENV_VAR = "VERBATRA_NETWORK_POLICY";

export const NETWORK_ALLOWED_HOSTS_ENV_VAR = "VERBATRA_NETWORK_ALLOWED_HOSTS";

/** A read-only view of environment variables, such as `process.env`. */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type EnvironmentRule =
  | { readonly kind: "unset" }
  | { readonly kind: "rule"; readonly rule: NetworkRule }
  | { readonly kind: "invalid"; readonly message: string };

function readTrimmed(env: EnvironmentSource, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function isPolicyMode(value: string): value is NetworkPolicyMode {
  return (NETWORK_POLICY_MODES as readonly string[]).includes(value);
}

function splitHosts(raw: string | undefined): readonly string[] {
  return raw === undefined
    ? []
    : raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function invalid(message: string): EnvironmentRule {
  return { kind: "invalid", message };
}

export function readEnvironmentRule(env: EnvironmentSource): EnvironmentRule {
  const policy = readTrimmed(env, NETWORK_POLICY_ENV_VAR);
  const allowedHosts = splitHosts(readTrimmed(env, NETWORK_ALLOWED_HOSTS_ENV_VAR));
  if (policy === undefined) {
    return allowedHosts.length === 0
      ? { kind: "unset" }
      : invalid(
          `${NETWORK_ALLOWED_HOSTS_ENV_VAR} is set but ${NETWORK_POLICY_ENV_VAR} is not. Set ${NETWORK_POLICY_ENV_VAR} to "local-only" or "allowlist" as well.`,
        );
  }
  if (!isPolicyMode(policy)) {
    return invalid(
      `${NETWORK_POLICY_ENV_VAR} must be one of ${NETWORK_POLICY_MODES.map((mode) => `"${mode}"`).join(", ")}.`,
    );
  }
  const malformed = allowedHosts.find((entry) => !isValidAllowedHost(entry));
  if (malformed !== undefined) {
    return invalid(
      `${NETWORK_ALLOWED_HOSTS_ENV_VAR} holds an invalid entry "${malformed}": each entry ${ALLOWED_HOST_MESSAGE}.`,
    );
  }
  if (policy === "allowlist" && allowedHosts.length === 0) {
    return invalid(
      `${NETWORK_POLICY_ENV_VAR} is "allowlist", so ${NETWORK_ALLOWED_HOSTS_ENV_VAR} must name at least one host.`,
    );
  }
  return { kind: "rule", rule: { source: "environment", policy, allowedHosts } };
}
