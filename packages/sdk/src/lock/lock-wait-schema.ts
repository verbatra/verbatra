import { z } from "zod";

/**
 * The zod schema for a {@link LockWaitEvent}, reported while a run waits for a locale's write
 * lock. The CLI prints it to stderr under `--json` with `type: "lock-wait"` added. It allows
 * fields it does not list.
 */
export const lockWaitEventSchema = z.object({
  lockPath: z.string(),
  elapsedMs: z.number(),
  holder: z
    .object({
      pid: z.number().exactOptional(),
      hostname: z.string().exactOptional(),
      acquiredAt: z.string().exactOptional(),
    })
    .exactOptional(),
});
