export interface StoppableController {
  stop(): Promise<void>;
  readonly ended?: Promise<void>;
}

export interface StoppableSession {
  readonly done: Promise<number>;
  requestStop(): void;
}

export interface StoppableSessionOptions<C extends StoppableController> {
  getController(): Promise<C>;
  onStopRequested?: () => void;
  onFailure(error: unknown): number;
}

export function stoppableSession<C extends StoppableController>(
  options: StoppableSessionOptions<C>,
): StoppableSession {
  let resolveDone!: (code: number) => void;
  const done = new Promise<number>((resolve) => {
    resolveDone = resolve;
  });

  let controller: C | undefined;
  let stopping = false;
  let startupFailed = false;

  const stopController = (c: C): void => {
    void c
      .stop()
      .then(() => resolveDone(0))
      .catch((error: unknown) => resolveDone(options.onFailure(error)));
  };

  options
    .getController()
    .then((c) => {
      controller = c;
      void c.ended?.then(() => resolveDone(0));
      if (stopping) {
        stopController(c);
      }
    })
    .catch((error: unknown) => {
      startupFailed = true;
      resolveDone(options.onFailure(error));
    });

  const requestStop = (): void => {
    if (startupFailed) {
      return;
    }
    if (!stopping) {
      stopping = true;
      options.onStopRequested?.();
      if (controller !== undefined) {
        stopController(controller);
      }
      return;
    }
    resolveDone(130);
  };

  return { done, requestStop };
}
