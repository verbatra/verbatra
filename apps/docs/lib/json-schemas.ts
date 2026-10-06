import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_URL } from "@/lib/site";

export const SCHEMA_PACKAGES = ["@verbatra/sdk", "@verbatra/cli"] as const;

export const SCHEMA_CONTENT_TYPE = "application/schema+json";

export const SCHEMA_PATH = "/schema/v1";

export interface PublishedSchema {
  readonly name: string;
  readonly packageName: (typeof SCHEMA_PACKAGES)[number];
  readonly document: Readonly<Record<string, unknown>>;
}

export function schemaUrl(name: string): string {
  return new URL(`${SCHEMA_PATH}/${name}.json`, SITE_URL).href;
}

function schemaDirectory(packageName: string, root: string): string {
  return join(root, "node_modules", packageName, "dist", "schemas");
}

export function readPublishedSchemas(root: string = process.cwd()): readonly PublishedSchema[] {
  return SCHEMA_PACKAGES.flatMap((packageName) => {
    const directory = schemaDirectory(packageName, root);
    return readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => ({
        name: file.slice(0, -".json".length),
        packageName,
        document: JSON.parse(readFileSync(join(directory, file), "utf8")),
      }));
  });
}

export function schemaResponse(body: unknown, contentType: string = SCHEMA_CONTENT_TYPE) {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
