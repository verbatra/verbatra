import arcjet, { type ArcjetDecision, detectBot, fixedWindow, shield } from "@arcjet/next";
import { forbiddenResponse, rateLimitedResponse, serverErrorResponse } from "./respond";

const RATE_LIMIT_WINDOW = "10m";
const RATE_LIMIT_MAX = 5;

export type ArcjetProtectClient = {
  protect: (request: Request) => Promise<ArcjetDecision>;
};

export type CheckArcjetDeps = {
  client?: ArcjetProtectClient;
};

let cachedClient: ArcjetProtectClient | undefined;

export function resetCachedClient(): void {
  cachedClient = undefined;
}

export function buildClient(key: string): ArcjetProtectClient {
  return arcjet({
    key,
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({ mode: "LIVE", allow: [] }),
      fixedWindow({ mode: "LIVE", window: RATE_LIMIT_WINDOW, max: RATE_LIMIT_MAX }),
    ],
  });
}

export function resolveClient(deps: CheckArcjetDeps): ArcjetProtectClient | undefined {
  if (deps.client) return deps.client;
  const key = process.env.ARCJET_KEY;
  if (key === undefined || key.length === 0) return undefined;
  cachedClient ??= buildClient(key);
  return cachedClient;
}

function responseForDecision(decision: ArcjetDecision): Response | undefined {
  if (decision.isErrored()) {
    console.error("checkArcjet: Arcjet returned an errored decision.");
    return serverErrorResponse();
  }
  if (decision.isDenied()) {
    return decision.reason.isRateLimit() ? rateLimitedResponse() : forbiddenResponse();
  }
  return undefined;
}

export async function checkArcjet(
  request: Request,
  deps: CheckArcjetDeps = {},
): Promise<Response | undefined> {
  const client = resolveClient(deps);
  if (!client) {
    console.error("checkArcjet: the ARCJET_KEY environment variable is not set.");
    return serverErrorResponse();
  }

  try {
    const decision = await client.protect(request);
    return responseForDecision(decision);
  } catch (error) {
    console.error("checkArcjet: protect() threw.", error);
    return serverErrorResponse();
  }
}
