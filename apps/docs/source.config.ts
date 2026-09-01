import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema.extend({ status: z.string().optional() }),
    postprocess: { includeProcessedMarkdown: true },
  },
});

export default defineConfig();
