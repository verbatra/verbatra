import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";
import { emitUmamiEvent, refererPage } from "@/lib/umami-event";

const MIN_QUERY_LENGTH = 3;

const { GET: search } = createFromSource(source);

async function hasResults(response: Response): Promise<boolean | undefined> {
  if (!response.ok) return undefined;
  try {
    const body: unknown = await response.clone().json();
    return Array.isArray(body) ? body.length > 0 : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request): Promise<Response> {
  const response = await search(request);
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length >= MIN_QUERY_LENGTH) {
    const found = await hasResults(response);
    if (found !== undefined) {
      emitUmamiEvent(request, {
        url: refererPage(request, "/"),
        name: "search_run",
        data: { results: found ? "some" : "none" },
      });
    }
  }
  return response;
}
