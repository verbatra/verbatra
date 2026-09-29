import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";
import { remarkIntroducedIn } from "./lib/introduced-in";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema.extend({ status: z.string().optional() }),
    postprocess: { includeProcessedMarkdown: true, valueToExport: ["introducedIn"] },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkNpmOptions: { persist: { id: "package-manager" } },
    remarkPlugins: [remarkIntroducedIn],
  },
});
