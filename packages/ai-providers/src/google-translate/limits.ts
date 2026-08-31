export const GOOGLE_TRANSLATE_MAX_REQUEST_BYTES = 100 * 1024;

const GOOGLE_TRANSLATE_PAYLOAD_OVERHEAD_RESERVE_BYTES = 2 * 1024;

export const GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES =
  GOOGLE_TRANSLATE_MAX_REQUEST_BYTES - GOOGLE_TRANSLATE_PAYLOAD_OVERHEAD_RESERVE_BYTES;

const textEncoder = new TextEncoder();

function estimateJsonBytes(text: string): number {
  return textEncoder.encode(JSON.stringify(text)).length;
}

export function chunkTextsForGoogleTranslate(texts: readonly string[]): readonly string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;

  for (const text of texts) {
    const textBytes = estimateJsonBytes(text);
    const startsNewChunk =
      current.length > 0 && currentBytes + textBytes > GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES;
    if (startsNewChunk) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(text);
    currentBytes += textBytes;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}
