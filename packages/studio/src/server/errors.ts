/**
 * Stable, machine-readable reasons the local server could not start.
 *
 * `PORT_IN_USE` means another process already holds the requested port; pick another one. Only a
 * direct `startStudioServer` call accepts `port: 0`, which lets the operating system assign a free
 * port; the CLI's `verbatra studio --port` takes 1 to 65535. `BIND_FAILED` means the socket came up
 * on something other than `127.0.0.1`, which Studio refuses to serve on because it would expose the
 * dashboard beyond this machine.
 */
export type StudioServerErrorCode = "PORT_IN_USE" | "BIND_FAILED";

/**
 * A structured startup failure, so a caller can branch on {@link StudioServerStartError.code}
 * instead of matching on message text. The message is always a fixed, safe string and never embeds
 * a filesystem path or other environment detail.
 */
export class StudioServerStartError extends Error {
  /** Which startup failure this is, and the only field worth branching on. */
  readonly code: StudioServerErrorCode;
  /** The port the server tried to bind, carried so an error handler can report or retry it. */
  readonly port: number;

  /**
   * @param code - Which startup failure this is.
   * @param port - The port the server tried to bind.
   * @param message - The fixed, secret-free sentence to report.
   */
  constructor(code: StudioServerErrorCode, port: number, message: string) {
    super(message);
    this.name = "StudioServerStartError";
    this.code = code;
    this.port = port;
  }
}
