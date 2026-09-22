import type { CheckDeps, CreateProvider, LoadedConfig, SdkFs } from "@verbatra/sdk";

/** The captured output of one {@link ExecFileImpl} call. */
export interface ExecFileResult {
  /** Everything the process wrote to standard output, decoded as text. */
  readonly stdout: string;
  /** Everything the process wrote to standard error, decoded as text. */
  readonly stderr: string;
}

/**
 * An argument-array process runner, never a shell string, mirroring the shape of
 * `util.promisify(child_process.execFile)`. Studio calls it only to read git history for the
 * history view. Inject your own to sandbox that call or to serve history from somewhere else.
 *
 * @param file - The executable to run, resolved on `PATH`.
 * @param args - The arguments, passed as a list so no value is ever interpreted by a shell.
 * @param options - Where to run the process.
 * @returns The captured stdout and stderr once the process exits successfully.
 */
export type ExecFileImpl = (
  file: string,
  args: readonly string[],
  options: {
    /** Absolute directory to run the process in, which for the history view is the project root. */
    readonly cwd: string;
  },
) => Promise<ExecFileResult>;

/**
 * A minimal change-event source backing the live-refresh stream that pushes updates to open
 * browser tabs. Studio owns this contract: production wraps chokidar, tests inject a stub so no
 * real file system event is needed.
 */
export interface StudioWatcher {
  /**
   * Registers a listener invoked once per raw change event from the underlying source. Studio
   * debounces and diffs downstream, so the listener may fire more often than the browser updates.
   *
   * @param listener - Called with no arguments each time an observed path changes.
   */
  onChange(listener: () => void): void;
  /**
   * Stops observing and releases the underlying resources.
   *
   * @returns Resolves once the source is fully torn down.
   */
  close(): Promise<void>;
}

/**
 * Builds a {@link StudioWatcher} over a set of absolute paths. Called once per watched entry during
 * {@link startStudioServer}, each call receiving a one-element array: one for the source locale
 * file, one for each configured target locale file, and one for the lock file. An implementation
 * must therefore construct a fresh watcher on every call; one that builds a watcher only the first
 * time observes the source file alone and never reports a target or lock-file change.
 *
 * @param paths - The absolute paths to observe.
 * @returns A watcher that is already observing.
 */
export type CreateStudioWatcher = (paths: readonly string[]) => StudioWatcher;

/**
 * Everything the server and its RPC handlers may need. Only {@link StudioServerDeps.loader} is
 * required; every other field is an injection seam that falls back to a production default, so a
 * normal caller passes just the loader.
 */
export interface StudioServerDeps {
  /**
   * Resolves the project configuration. Called exactly once, at startup, before the server listens.
   * Every RPC handler receives that same resolved value for the life of the process, so editing the
   * config on disk does not change a running server; restart it instead.
   */
  readonly loader: () => Promise<LoadedConfig>;
  /** Bounded file-system seam threaded into the sdk calls. Defaults to the sdk's real file system. */
  readonly fs?: SdkFs;
  /** Format-adapter registry threaded into the sdk calls. Defaults to the sdk's own registry. */
  readonly adapterRegistry?: NonNullable<CheckDeps["adapterRegistry"]>;
  /** Process runner for the git-log history view. Defaults to a real `execFile`. */
  readonly execFileImpl?: ExecFileImpl;
  /** Builds the file watcher behind the live-refresh stream. Defaults to a chokidar-backed watcher. */
  readonly createWatcher?: CreateStudioWatcher;
  /**
   * Milliseconds between live-refresh heartbeat frames, which keep an idle connection from being
   * dropped by an intermediary. Defaults to 15000. Inject a small value so a test never waits on a
   * real timer.
   */
  readonly heartbeatIntervalMs?: number;
  /**
   * The bootstrap token the server accepts, which the caller needs when it prints the entry URL
   * itself. Omit to have the server generate 32 bytes of secure randomness.
   */
  readonly token?: string;
  /**
   * Sink for the startup banner and the per-request log line. Defaults to writing to the console.
   * Pass a no-op when the caller prints its own banner, as the verbatra CLI does.
   */
  readonly output?: (line: string) => void;
  /**
   * Where the prebuilt single-page app is served from. Defaults to the built assets shipped next to
   * this module; override it only to serve a different build.
   */
  readonly assetsRoot?: URL;
  /**
   * Authorizes provider invocations: network egress, an API key read from its environment variable,
   * and a billable call. Read once at startup to decide which RPC methods exist at all, so a method
   * it does not cover answers `METHOD_UNKNOWN` rather than failing later. Off by default. This is
   * the only capability option; writing a local locale file always needs no flag.
   */
  readonly spend?: boolean;
  /**
   * A client-render hint, never a server gate. When set, the single-page app registers the RPC
   * methods as WebMCP agent tools on `document.modelContext`; when off, the default, it registers
   * none. The server projects it verbatim on the `project.snapshot` result and never branches on
   * it, so it widens nothing the server allows. Off by default.
   */
  readonly exposeAgentTools?: boolean;
  /** Builds the provider for the spend-gated handlers. Defaults to the sdk constructing the configured one. */
  readonly createProvider?: CreateProvider;
  /** Rolling window in milliseconds for `translation.retranslateEntry`'s rate limit. Defaults to 60000. */
  readonly retranslateRateLimitWindowMs?: number;
  /** How many `translation.retranslateEntry` calls the window allows before `METHOD_RATE_LIMITED`. Defaults to 20. */
  readonly retranslateRateLimitMax?: number;
  /** Rolling window in milliseconds for `translation.editEntry`'s rate limit. Defaults to 60000. */
  readonly editEntryRateLimitWindowMs?: number;
  /** How many `translation.editEntry` calls the window allows before `METHOD_RATE_LIMITED`. Defaults to 20. */
  readonly editEntryRateLimitMax?: number;
  /** Rolling window in milliseconds for `translation.translatePending`'s rate limit. Defaults to 60000. */
  readonly translatePendingRateLimitWindowMs?: number;
  /** How many `translation.translatePending` calls the window allows before `METHOD_RATE_LIMITED`. Defaults to 5. */
  readonly translatePendingRateLimitMax?: number;
  /** Rolling window in milliseconds for `glossary.write`'s rate limit. Defaults to 60000. */
  readonly glossaryWriteRateLimitWindowMs?: number;
  /** How many `glossary.write` calls the window allows before `METHOD_RATE_LIMITED`. Defaults to 20. */
  readonly glossaryWriteRateLimitMax?: number;
}

/** Everything {@link startStudioServer} accepts: every {@link StudioServerDeps} seam, plus where to bind and run. */
export interface StudioServerOptions extends StudioServerDeps {
  /**
   * The TCP port to bind on the loopback interface. Omit for {@link DEFAULT_STUDIO_PORT}, or pass
   * `0` to let the operating system assign a free one and read it back from
   * {@link StudioServer.port}.
   */
  readonly port?: number;
  /**
   * The project root every RPC handler resolves relative paths against: the locale files, the lock
   * file, and the git repository behind the history view. Omit to use `process.cwd()`.
   */
  readonly cwd?: string;
}

/** A running Verbatra Studio server, returned once it is bound and serving. */
export interface StudioServer {
  /**
   * The loopback URL the server is reachable at, including the port actually bound. It carries no
   * bootstrap token; the entry URL written to `output` at startup is this URL plus `?token=`.
   */
  readonly url: string;
  /** The port actually bound, which is what to read when `port` was omitted or `0`. */
  readonly port: number;
  /**
   * Stops accepting connections, ends the live-refresh streams, and closes the file watcher.
   *
   * @returns Resolves once the server and its resources are fully released.
   */
  close(): Promise<void>;
}
