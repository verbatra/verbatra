import type { CSSProperties, ReactNode } from "react";

export type CardProps = {
  signature?: boolean;
  padded?: boolean;
  children: ReactNode;
  className?: string;
};

const BASE = "not-prose rounded-xl border border-fd-border bg-fd-card text-fd-foreground";

export default function Card({
  signature = false,
  padded = true,
  children,
  className,
}: CardProps): ReactNode {
  const classes = `${BASE}${padded ? " p-5" : ""}${className ? ` ${className}` : ""}`;
  const style: CSSProperties | undefined = signature
    ? { borderInlineStart: "2px solid var(--v-glow)", boxShadow: "var(--shadow-panel)" }
    : undefined;

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
