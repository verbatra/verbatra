import { z } from "zod";
import { ALLOWED_HOST_PATTERN, isValidAllowedHost } from "./allowed-host.js";

/** Every value `network.policy` and `VERBATRA_NETWORK_POLICY` accept. */
export const NETWORK_POLICY_MODES = ["any", "local-only", "allowlist"] as const;

/**
 * Where a translation provider may connect. `any` permits every host. `local-only` permits
 * loopback (`127.0.0.0/8`, `::1`, `localhost`), private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`,
 * `192.168.0.0/16`) and unique-local IPv6 (`fc00::/7`) addresses, plus the listed allowed hosts.
 * `allowlist` permits the listed allowed hosts only.
 */
export type NetworkPolicyMode = (typeof NETWORK_POLICY_MODES)[number];

export const ALLOWED_HOST_MESSAGE =
  "must be a host name, a *.suffix wildcard, an IP address, or a CIDR range, without a scheme or port";

export const allowedHostSchema = z
  .string()
  .regex(ALLOWED_HOST_PATTERN, { message: `An allowed host ${ALLOWED_HOST_MESSAGE}.` })
  .refine(isValidAllowedHost, { message: `An allowed host ${ALLOWED_HOST_MESSAGE}.` });

const allowedHostsSchema = z.array(allowedHostSchema);

export const networkConfigSchema = z.discriminatedUnion("policy", [
  z.strictObject({ policy: z.literal("any"), allowedHosts: allowedHostsSchema.optional() }),
  z.strictObject({ policy: z.literal("local-only"), allowedHosts: allowedHostsSchema.optional() }),
  z.strictObject({
    policy: z.literal("allowlist"),
    allowedHosts: allowedHostsSchema.min(1, {
      message: 'The "allowlist" network policy needs at least one entry in allowedHosts.',
    }),
  }),
]);

export type NetworkConfig = z.infer<typeof networkConfigSchema>;
