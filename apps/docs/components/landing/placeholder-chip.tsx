import type { ReactNode } from "react";

export function PlaceholderChip({
  token,
  broken = false,
}: {
  token: string;
  broken?: boolean;
}): ReactNode {
  return (
    <span className="vk-placeholder" data-placeholder="" data-broken={broken ? "" : undefined}>
      {token}
    </span>
  );
}
