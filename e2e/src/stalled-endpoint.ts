import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface StalledEndpoint {
  readonly baseUrl: string;
  requestsReceived(): number;
  close(): Promise<void>;
}

export async function startStalledEndpoint(): Promise<StalledEndpoint> {
  const sockets = new Set<Socket>();
  let received = 0;
  const server: Server = createServer(() => {
    received += 1;
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requestsReceived: () => received,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
