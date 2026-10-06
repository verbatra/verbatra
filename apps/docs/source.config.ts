import { join } from "node:path";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import { z } from "zod";
import { remarkAiSetupPromptMarkdown } from "./lib/ai-setup-prompt";
import { rehypeAvailableFromInHeading } from "./lib/available-from-heading";
import { rehypeCodeOptions } from "./lib/code-block-meta";
import { remarkIntroducedIn } from "./lib/introduced-in";
import { PAGE_TYPES } from "./lib/page-type";
import {
  remarkSdkTypeTable,
  remarkTypeTableMarkdown,
  sdkTypeTableOptions,
} from "./lib/sdk-type-table";
import { remarkStackBlocks } from "./lib/stack-blocks";
import { rehypeStackedTables } from "./lib/stacked-tables";
import { STACK_IDS } from "./lib/stacks";

const REPO_ROOT = join(process.cwd(), "../..");

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema.extend({
      status: z.string().optional(),
      sidebarTitle: z.string().optional(),
      tocDepth: z.number().int().min(2).max(4).optional(),
      codeHeadings: z.boolean().optional(),
      type: z.enum(PAGE_TYPES).optional(),
      stack: z.enum(STACK_IDS).optional(),
    }),
    postprocess: { includeProcessedMarkdown: true, valueToExport: ["introducedIn"] },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkNpmOptions: false,
    rehypeCodeOptions,
    remarkPlugins: [
      remarkStackBlocks,
      remarkIntroducedIn,
      remarkSdkTypeTable,
      [remarkAutoTypeTable, sdkTypeTableOptions(REPO_ROOT)],
      remarkTypeTableMarkdown,
      remarkAiSetupPromptMarkdown,
    ],
    rehypePlugins: (plugins) => [...plugins, rehypeAvailableFromInHeading, rehypeStackedTables],
  },
});
