import { Fragment, type ReactNode, type Ref } from "react";
import { Button } from "./Button.js";
import { Card } from "./Card.js";
import { Icon, type IconName } from "./Icon.js";
import { cn } from "./lib/cn.js";
import { Sheet } from "./Sheet.js";

export function MonoValue({ children }: { readonly children: ReactNode }): ReactNode {
  return <span className="font-mono">{children}</span>;
}

export function Container({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>;
}

export function OverlayBackdrop({
  onClose,
  label,
}: {
  readonly onClose: () => void;
  readonly label: string;
}): ReactNode {
  return (
    <button
      type="button"
      className="absolute inset-0 z-0 cursor-default border-none bg-foreground/40"
      onClick={onClose}
      aria-label={label}
    />
  );
}

export function DialogCloseButton({
  onClose,
  label = "Close",
  className,
}: {
  readonly onClose: () => void;
  readonly label?: string;
  readonly className?: string;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      className={className ?? "flex-none p-1.5"}
      onClick={onClose}
      aria-label={label}
    >
      <Icon name="close" />
    </Button>
  );
}

export function DrawerShell(props: {
  readonly kicker?: string;
  readonly title: ReactNode;
  readonly ariaLabel: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly containerRef: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}): ReactNode {
  return <Sheet side="end" {...props} />;
}

export function Section({
  title,
  intro,
  children,
}: {
  readonly title: string;
  readonly intro?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="mb-8">
      <h3 className={cn("mb-2", microLabelClassName)}>{title}</h3>
      {intro !== undefined ? <p className="mb-3 text-sm text-muted-foreground">{intro}</p> : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  action,
  children,
}: {
  readonly icon?: IconName;
  readonly title?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <Icon name={icon} size={20} className="text-muted-foreground/60" />
      {title !== undefined ? <p className="font-medium text-foreground">{title}</p> : null}
      <div className="max-w-md text-sm text-muted-foreground">{children}</div>
      {action}
    </div>
  );
}

export function PageSection({
  title,
  meta,
  children,
  className,
}: {
  readonly title: string;
  readonly meta?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <section className={cn("mb-10", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {meta !== undefined ? <div className="flex items-center gap-2">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SectionCard({
  title,
  intro,
  meta,
  children,
  className,
}: {
  readonly title: string;
  readonly intro?: ReactNode;
  readonly meta?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <Card as="section" padding="md" className={cn("mb-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {intro !== undefined ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{intro}</p>
          ) : null}
        </div>
        {meta !== undefined ? (
          <div className="flex flex-none items-center gap-2">{meta}</div>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

export function DetailList({
  items,
}: {
  readonly items: ReadonlyArray<readonly [string, ReactNode]>;
}): ReactNode {
  return (
    <dl className="grid max-w-3xl grid-cols-[max-content_minmax(0,480px)] gap-x-6 gap-y-2">
      {items.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="m-0 text-sm text-foreground">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export const tableClasses = {
  table: "w-full min-w-[480px] border-collapse text-sm",
  th: "border-b border-border bg-muted/60 px-3 py-2.5 text-start font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
  tbody: "divide-y divide-border",
  td: "px-3 py-2.5 text-foreground",
  rowHover: "hover:bg-accent/40",
  numeric: "text-end tabular-nums",
};

export const pillClassName =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 font-sans text-xs font-medium leading-5";

export const pillDotClassName = "size-1.5 flex-none rounded-full bg-current";

export const microLabelClassName =
  "font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
