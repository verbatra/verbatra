import { createHmac, randomBytes } from "node:crypto";
import { normalizeText } from "@verbatra/core";

/**
 * Stands in for a translation value that must not be shown: a marker that keeps the value's
 * length and a hash only the same marker instance can reproduce.
 */
export interface ValueMarker {
  /**
   * Returns `[redacted length=<n> hash=<h>]` for `value`, where `n` counts the characters of its
   * Unicode-normalized form and `h` is {@link ValueMarker.hash} of it, so two normalizations of one
   * value get the same marker.
   */
  mark(value: string): string;
  /**
   * Returns a 16-digit hex hash of `value`, keyed with this marker's salt. Two values that differ
   * only in their Unicode normalization hash alike; the same value hashes differently under
   * another marker.
   */
  hash(value: string): string;
}

const HASH_HEX_DIGITS = 16;

const SALT_BYTES = 32;

/**
 * Creates a {@link ValueMarker} keyed with a random salt, so a hash it produces is comparable only
 * within the session that holds the marker and cannot be checked against a guessed value outside
 * it. Pass the same marker to {@link approveEntry} or {@link rejectEntry} to accept a hash in place
 * of the reviewed value.
 *
 * @param salt - The key for the hash. Defaults to 32 random bytes.
 * @returns The marker.
 */
export function createValueMarker(salt: Uint8Array = randomBytes(SALT_BYTES)): ValueMarker {
  const digest = (normalized: string): string =>
    createHmac("sha256", salt).update(normalized).digest("hex").slice(0, HASH_HEX_DIGITS);
  return {
    hash: (value) => digest(normalizeText(value)),
    mark: (value) => {
      const normalized = normalizeText(value);
      return `[redacted length=${[...normalized].length} hash=${digest(normalized)}]`;
    },
  };
}
