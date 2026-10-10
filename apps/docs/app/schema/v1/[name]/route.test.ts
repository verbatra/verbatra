import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { readPublishedSchemas, SCHEMA_CONTENT_TYPE, schemaUrl } from "@/lib/json-schemas";
import { config } from "../../../../proxy";
import { GET as index } from "../route";
import { GET, generateStaticParams } from "./route";

const schemas = readPublishedSchemas();

async function serve(name: string): Promise<Response> {
  return GET(new Request(schemaUrl(name)), { params: Promise.resolve({ name }) });
}

describe("/schema/v1/[name]", () => {
  it("prerenders one URL per schema the sdk and cli packages emit, the config among them", () => {
    const names = generateStaticParams().map((params) => params.name);

    expect(names).toContain("config.json");
    expect(names).toContain("run-summary.json");
    expect(names).toContain("envelope.json");
    expect(names).toContain("stderr-record.json");
    expect(names).toHaveLength(schemas.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("serves every emitted schema as application/schema+json, readable from any origin", async () => {
    for (const schema of schemas) {
      const response = await serve(`${schema.name}.json`);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(`${SCHEMA_CONTENT_TYPE}; charset=utf-8`);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(await response.json()).toEqual(schema.document);
    }
  });

  it("serves each document at the URL its own $id names", () => {
    for (const schema of schemas) {
      expect(schema.document.$id, schema.name).toBe(schemaUrl(schema.name));
    }
  });

  it("answers 404 for a name no package emits", async () => {
    expect((await serve("nope.json")).status).toBe(404);
  });

  it("lists every schema with its URL and title in the index", async () => {
    const response = index();
    const body = (await response.json()) as {
      schemas: { name: string; url: string; title: string }[];
    };

    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(body.schemas.map((entry) => entry.url)).toEqual(
      schemas.map((schema) => schemaUrl(schema.name)),
    );
    expect(body.schemas.every((entry) => typeof entry.title === "string")).toBe(true);
  });

  it("is never rewritten to a locale or given a page Content-Security-Policy by the proxy", () => {
    for (const url of ["/schema/v1", "/schema/v1/config.json", "/schema/v1/run-summary.json"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
    expect(unstable_doesMiddlewareMatch({ config, url: "/docs" })).toBe(true);
  });
});
