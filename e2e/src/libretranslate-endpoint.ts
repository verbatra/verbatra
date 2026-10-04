import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface LibreTranslateEndpoint {
  readonly baseUrl: string;
  close(): Promise<void>;
}

const LANGUAGES = [
  { code: "en", name: "English", targets: ["de"] },
  { code: "de", name: "German", targets: ["en"] },
];

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function answer(path: string | undefined, body: string): unknown {
  if (path?.endsWith("/languages")) {
    return LANGUAGES;
  }
  const { q } = JSON.parse(body) as { q: string[] };
  return { translatedText: q.map((text) => `de:${text}`) };
}

export async function startLibreTranslateEndpoint(): Promise<LibreTranslateEndpoint> {
  const server: Server = createServer((request, response) => {
    readBody(request)
      .then((body) => {
        const payload = JSON.stringify(answer(request.url, body));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(payload);
      })
      .catch(() => {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "bad request" }));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
