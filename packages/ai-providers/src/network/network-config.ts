import { z } from "zod";
import { ALLOWED_HOST_PATTERN, isValidAllowedHost } from "./allowed-host.js";

export const NETWORK_POLICY_MODES = ["any", "local-only", "allowlist"] as const;

export type NetworkPolicyMode = (typeof NETWORK_POLICY_MODES)[number];

export const ALLOWED_HOST_MESSAGE =
  "must be a host name, a *.suffix wildcard, an IP address, or a CIDR range, without a scheme or port";

export const allowedHostSchema = z
  .string()
  .regex(ALLOWED_HOST_PATTERN, { message: `An allowed host ${ALLOWED_HOST_MESSAGE}.` })
  .refine(isValidAllowedHost, { message: `An allowed host ${ALLOWED_HOST_MESSAGE}.` });

export const networkConfigSchema = z
  .strictObject({
    policy: z.enum(NETWORK_POLICY_MODES),
    allowedHosts: z.array(allowedHostSchema).optional(),
  })
  .refine((network) => network.policy !== "allowlist" || (network.allowedHosts ?? []).length > 0, {
    message: 'The "allowlist" network policy needs at least one entry in allowedHosts.',
    path: ["allowedHosts"],
  });

export type NetworkConfig = z.infer<typeof networkConfigSchema>;
