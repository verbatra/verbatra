import { microLabelClassName } from "@verbatra/ui";
import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  readonly kicker?: string;
  readonly title: string;
  readonly description?: string;
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
      </div>
      {actions !== undefined ? (
        <div className="flex flex-none items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
