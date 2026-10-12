import { beforeAll } from "vitest";

type Preloadable = { preload: () => Promise<unknown> };

function isIsland(value: unknown): value is Preloadable {
  return (
    typeof value === "function" && typeof (value as Partial<Preloadable>).preload === "function"
  );
}

beforeAll(async () => {
  if (typeof window === "undefined") return;
  const registries = await Promise.all([
    import("@/components/landing/islands"),
    import("@/components/chrome-islands"),
  ]);
  await Promise.all(
    registries
      .flatMap((registry) => Object.values(registry).filter(isIsland))
      .map((island) => island.preload()),
  );
});
