import { redact } from "@verbatra/sdk";
import type { Streams } from "./types.js";

export function redactingStreams(streams: Streams): Streams {
  return {
    out: (text) => streams.out(redact(text)),
    err: (text) => streams.err(redact(text)),
  };
}
