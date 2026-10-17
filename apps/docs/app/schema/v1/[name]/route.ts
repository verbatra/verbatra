import { readPublishedSchemas, schemaResponse } from "@/lib/json-schemas";

export const dynamic = "force-static";

export const dynamicParams = false;

export function generateStaticParams() {
  return readPublishedSchemas().map((schema) => ({ name: `${schema.name}.json` }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await context.params;
  const schema = readPublishedSchemas().find((entry) => `${entry.name}.json` === name);
  if (schema === undefined) return new Response(null, { status: 404 });
  return schemaResponse(schema.document);
}
