import { fetchProjectStats, STATS_CACHE_CONTROL } from "@/lib/project-stats";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const { stars } = await fetchProjectStats({ caching: "hourly" });
  return Response.json({ stars }, { headers: { "Cache-Control": STATS_CACHE_CONTROL } });
}
