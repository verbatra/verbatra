export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export interface CspOptions {
  readonly enforce: boolean;
  readonly isDev: boolean;
  readonly scriptHashes?: readonly string[];
  readonly upgradeInsecureRequests?: boolean;
}

export declare const CSP_ENFORCED: boolean;

export declare function upgradesInsecureRequests(host: string | null | undefined): boolean;

export declare function contentSecurityPolicy(options: CspOptions): SecurityHeader;

export declare function securityHeaders(): SecurityHeader[];
