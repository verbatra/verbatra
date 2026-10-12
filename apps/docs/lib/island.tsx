import { type ComponentType, type ReactNode, use } from "react";

export type Island<P extends object> = ((props: P) => ReactNode) & {
  preload: () => Promise<unknown>;
};

function settle<T>(promise: Promise<T>): Promise<T> {
  const settled: Promise<T> = promise.then((value) => {
    Object.assign(settled, { status: "fulfilled", value });
    return value;
  });
  return settled;
}

export function island<P extends object>(load: () => Promise<ComponentType<P>>): Island<P> {
  let pending: Promise<ComponentType<P>> | undefined;
  const component = () => {
    pending ??= settle(load());
    return pending;
  };

  function Island(props: P): ReactNode {
    const Component = use(component());
    return <Component {...props} />;
  }
  return Object.assign(Island, { preload: component });
}

export function intlIsland<P extends object>(load: () => Promise<ComponentType<P>>): Island<P> {
  return island(() =>
    Promise.all([load(), import("@/components/intl-boundary")]).then(([component, boundary]) =>
      boundary.withIntl(component),
    ),
  );
}

export function rendersEagerly(): boolean {
  return typeof window === "undefined" || process.env.NODE_ENV === "test";
}

export async function preloadOnServer(islands: ReadonlyArray<Island<never>>): Promise<void> {
  if (!rendersEagerly()) return;
  await Promise.all(islands.map((item) => item.preload()));
}
