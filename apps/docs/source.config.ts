import { join } from "node:path";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import { z } from "zod";
import { rehypeAvailableFromInHeading } from "./lib/available-from-heading";
import { rehypeCodeOptions } from "./lib/code-block-meta";
import { remarkIntroducedIn } from "./lib/introduced-in";
import { PAGE_TYPES } from "./lib/page-type";
import {
  remarkSdkTypeTable,
  remarkTypeTableMarkdown,
  sdkTypeTableOptions,
} from "./lib/sdk-type-table";
import { rehypeStackedTables } from "./lib/stacked-tables";

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
    }),
    postprocess: { includeProcessedMarkdown: true, valueToExport: ["introducedIn"] },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkNpmOptions: false,
    rehypeCodeOptions,
    remarkPlugins: [
      remarkIntroducedIn,
      remarkSdkTypeTable,
      [remarkAutoTypeTable, sdkTypeTableOptions(REPO_ROOT)],
      remarkTypeTableMarkdown,
    ],
    rehypePlugins: (plugins) => [...plugins, rehypeAvailableFromInHeading, rehypeStackedTables],
  },
});
