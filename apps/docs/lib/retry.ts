export const RETRY_DELAYS_MS: ReadonlyArray<number> = [500, 2000];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retrying<T>(
  load: () => Promise<T>,
  delaysMs: ReadonlyArray<number> = RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      const delay = delaysMs[attempt];
      if (delay === undefined) throw error;
      await wait(delay);
    }
  }
}
