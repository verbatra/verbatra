import { createVitestConfig } from "@verbatra/config/vitest";

export default createVitestConfig({
  coverageExclude: [
    "src/anthropic/client.ts",
    "src/openai/client.ts",
    "src/openai-compatible/client.ts",
    "src/gemini/client.ts",
    "src/deepl/client.ts",
    "src/google-translate/client.ts",
    "src/test-support.ts",
  ],
});
