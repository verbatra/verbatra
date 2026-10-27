import { readPublishedSchemas, schemaResponse, schemaUrl } from "@/lib/json-schemas";

export const dynamic = "force-static";

export function GET(): Response {
  const schemas = readPublishedSchemas().map((schema) => ({
    name: schema.name,
    title: schema.document.title,
    url: schemaUrl(schema.name),
    package: schema.packageName,
  }));
  return schemaResponse(
    {
      version: 1,
      description:
        "JSON Schemas for the verbatra config and every --json document the CLI prints. v1 tracks envelope version 1 and always serves the latest release.",
      schemas,
    },
    "application/json",
  );
}
