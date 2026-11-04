import { microLabelClassName } from "@verbatra/ui";
import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  meta,
  actions,
}: {
  readonly kicker?: string;
  readonly title: string;
  readonly description?: string;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
}): ReactNode {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {kicker !== undefined ? <p className={`mb-1 ${microLabelClassName}`}>{kicker}</p> : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description !== undefined ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        {meta !== undefined ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div className="flex flex-none items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
