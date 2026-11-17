import { afterEach, describe, expect, it, vi } from "vitest";

const searchGetMock = vi.fn();
const emitUmamiEventMock = vi.fn();

vi.mock("fumadocs-core/search/server", () => ({
  createFromSource: () => ({ GET: searchGetMock }),
}));
vi.mock("@/lib/source", () => ({ source: {} }));
vi.mock("@/lib/csp-script-hashes", () => ({
  loadBuiltScriptHashes: () => ({ "/en": [], "/de/docs": [] }),
}));
vi.mock("@/lib/umami-event", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/umami-event")>()),
  emitUmamiEvent: emitUmamiEventMock,
}));

const { GET } = await import("./route");

function request(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://verbatra.kreitz-webdev.de/api/search${query}`, { headers });
}

function results(items: unknown[], init: ResponseInit = {}): Response {
  return Response.json(items, init);
}

afterEach(() => {
  searchGetMock.mockReset();
  emitUmamiEventMock.mockReset();
});

describe("GET /api/search", () => {
  it("returns the search response body unchanged", async () => {
    searchGetMock.mockResolvedValue(results([{ id: "a" }]));
    const response = await GET(request("?query=install"));
    expect(await response.json()).toEqual([{ id: "a" }]);
  });

  it("emits search_run some when there are results", async () => {
    searchGetMock.mockResolvedValue(results([{ id: "a" }]));
    await GET(request("?query=install"));
    expect(emitUmamiEventMock).toHaveBeenCalledTimes(1);
    expect(emitUmamiEventMock.mock.calls[0]?.[1]).toEqual({
      url: "/",
      name: "search_run",
      data: { results: "some" },
    });
  });

  it("emits search_run none when there are no results", async () => {
    searchGetMock.mockResolvedValue(results([]));
    await GET(request("?query=zzzz"));
    expect(emitUmamiEventMock.mock.calls[0]?.[1]).toMatchObject({ data: { results: "none" } });
  });

  it("takes the page from a same-site referer", async () => {
    searchGetMock.mockResolvedValue(results([]));
    await GET(request("?query=docs", { referer: "https://verbatra.kreitz-webdev.de/de/docs" }));
    expect(emitUmamiEventMock.mock.calls[0]?.[1]).toMatchObject({ url: "/de/docs" });
  });

  it.each(["a", "ab", "  "])("emits nothing for the short query %j", async (query) => {
    searchGetMock.mockResolvedValue(results([{ id: "a" }]));
    await GET(request(`?query=${encodeURIComponent(query)}`));
    expect(emitUmamiEventMock).not.toHaveBeenCalled();
  });

  it("emits for a query of exactly three characters", async () => {
    searchGetMock.mockResolvedValue(results([{ id: "a" }]));
    await GET(request("?query=cli"));
    expect(emitUmamiEventMock).toHaveBeenCalledTimes(1);
  });

  it("never puts the query text into the event", async () => {
    searchGetMock.mockResolvedValue(results([]));
    await GET(request("?query=my-secret-term"));
    expect(JSON.stringify(emitUmamiEventMock.mock.calls)).not.toContain("my-secret-term");
  });

  it.each(["", "?query=", "?locale=de"])("emits nothing without a query (%j)", async (query) => {
    searchGetMock.mockResolvedValue(results([]));
    await GET(request(query));
    expect(emitUmamiEventMock).not.toHaveBeenCalled();
  });

  it("emits nothing when the search failed", async () => {
    searchGetMock.mockResolvedValue(results([], { status: 500 }));
    const response = await GET(request("?query=docs"));
    expect(response.status).toBe(500);
    expect(emitUmamiEventMock).not.toHaveBeenCalled();
  });

  it("emits nothing when the body is not a result list", async () => {
    searchGetMock.mockResolvedValue(new Response("nope", { status: 200 }));
    const response = await GET(request("?query=docs"));
    expect(await response.text()).toBe("nope");
    expect(emitUmamiEventMock).not.toHaveBeenCalled();
  });
});
