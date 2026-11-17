import "server-only";
import { UMAMI_ORIGIN } from "@/lib/umami-config.mjs";

export const UMAMI_SEND_TIMEOUT_MS = 1500;

export type UmamiEventData = Readonly<Record<string, string | number>>;

export interface UmamiPayload {
  readonly website: string;
  readonly hostname: string;
  readonly url: string;
  readonly userAgent: string;
  readonly name?: string;
  readonly data?: UmamiEventData;
  readonly referrer?: string;
  readonly language?: string;
  readonly ip?: string;
}

export interface UmamiMessage {
  readonly type: "event";
  readonly payload: UmamiPayload;
}

export async function sendToUmami(
  message: UmamiMessage,
  send: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await send(`${UMAMI_ORIGIN}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": message.payload.userAgent },
      body: JSON.stringify(message),
      cache: "no-store",
      signal: AbortSignal.timeout(UMAMI_SEND_TIMEOUT_MS),
    });
    await response.body?.cancel();
  } catch {
    return;
  }
}
