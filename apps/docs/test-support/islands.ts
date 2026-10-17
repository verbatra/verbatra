type Preloadable = { preload: () => Promise<unknown> };

function isIsland(value: unknown): value is Preloadable {
  return (
    typeof value === "function" && typeof (value as Partial<Preloadable>).preload === "function"
  );
}

export async function preloadRegisteredIslands(): Promise<void> {
  const registries = await Promise.all([
    import("@/components/landing/islands"),
    import("@/components/chrome-islands"),
  ]);
  await Promise.all(
    registries
      .flatMap((registry) => Object.values(registry).filter(isIsland))
      .map((island) => island.preload()),
  );
}
