import { relayRequest } from "./relay";

export async function POST(request: Request): Promise<Response> {
  await relayRequest(request).catch(() => undefined);
  return new Response(null, { status: 204 });
}
