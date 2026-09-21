import type { CSSProperties, ReactNode } from "react";

export type BadgeProps = {
  tone?: "neutral" | "glow" | "new" | "changed" | "unchanged" | "solid";
  children: ReactNode;
};

const BASE =
  "not-prose inline-flex items-center font-mono uppercase rounded-[6px] border px-[7px] py-[3px] text-xs tracking-[0.08em]";

const NEUTRAL = "text-fd-muted-foreground border-fd-border";

const TONE_STYLE: Record<Exclude<NonNullable<BadgeProps["tone"]>, "neutral">, CSSProperties> = {
  glow: {
    color: "var(--v-glow)",
    borderColor: "color-mix(in srgb, var(--v-glow) 40%, transparent)",
  },
  new: {
    color: "var(--v-status-new)",
    borderColor: "color-mix(in srgb, var(--v-glow) 40%, transparent)",
  },
  changed: {
    color: "var(--v-status-changed)",
    borderColor: "color-mix(in srgb, var(--v-purple) 40%, transparent)",
  },
  unchanged: {
    color: "var(--v-status-unchanged)",
    borderColor: "var(--color-fd-border)",
  },
  solid: {
    color: "var(--accent-fill-fg)",
    borderColor: "transparent",
    background: "var(--accent-fill)",
  },
};

export default function Badge({ tone = "neutral", children }: BadgeProps): ReactNode {
  if (tone === "neutral") {
    return <span className={`${BASE} ${NEUTRAL}`}>{children}</span>;
  }

  return (
    <span className={BASE} style={TONE_STYLE[tone]}>
      {children}
    </span>
  );
}
