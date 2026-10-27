/**
 * The Gemini authoring model type. Unlike the sibling Anthropic and OpenAI model types, this
 * union is hand-maintained rather than re-exported from `@google/genai`: every entry point of
 * that package's `.d.ts` carries an unconditional top-level import of
 * `@modelcontextprotocol/sdk/client/index.js`, an optional peer dependency it does not install.
 * Re-exporting any type from that package, including its model union, drags that import into
 * this package's own published types and breaks `tsc --noEmit` with `skipLibCheck: false` for
 * any consumer who has not separately installed the MCP SDK. Keeping this list literal avoids
 * that transitive dependency entirely.
 *
 * It is an open union (`(string & {})` at the end), so unknown or newly released model IDs are
 * still accepted. Type-only: it informs editor completions and is never validated at runtime,
 * where the schema stays `z.string().min(1)`. The list was last refreshed against
 * `@google/genai` 2.17.1 and does not update automatically; refresh it by hand when adopting a
 * newer SDK version that adds models worth completing on.
 */
export type GeminiModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemma-4-26b-a4b-it"
  | "gemma-4-31b-it"
  | "gemini-flash-latest"
  | "gemini-flash-lite-latest"
  | "gemini-pro-latest"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-flash-image"
  | "gemini-3-flash-preview"
  | "gemini-3.1-pro-preview"
  | "gemini-3.1-pro-preview-customtools"
  | "gemini-3.1-flash-lite"
  | "gemini-3-pro-image"
  | "nano-banana-pro-preview"
  | "gemini-3.1-flash-image"
  | "gemini-3.5-flash"
  | "gemini-3.6-flash"
  | "gemini-3.7-flash"
  | "lyria-3-clip-preview"
  | "lyria-3-pro-preview"
  | "gemini-robotics-er-1.6-preview"
  | "gemini-robotics-er-2-preview"
  | (string & {});
