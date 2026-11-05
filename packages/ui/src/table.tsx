import type { HTMLAttributes, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { Card } from "./card.tsx";
import { cn } from "./cn.ts";

export const tableClasses = {
  table: "w-full min-w-[480px] border-collapse text-sm",
  th: "border-b border-(--border-default) bg-(--surface-muted)/60 px-3 py-2.5 text-start font-mono text-[11px] font-semibold uppercase tracking-(--tracking-wide) text-(--text-muted)",
  tbody: "divide-y divide-(--border-default)",
  td: "px-3 py-2.5 text-(--text-strong)",
  rowHover: "hover:bg-(--surface-hover)/40",
  rowSelected: "bg-(--surface-hover)",
  numeric: "text-end tabular-nums",
};

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>): ReactNode {
  return <table className={cn(tableClasses.table, className)} {...props} />;
}

export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>): ReactNode {
  return <thead {...props} />;
}

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): ReactNode {
  return <tbody className={cn(tableClasses.tbody, className)} {...props} />;
}

export function TableRow({
  className,
  hover = true,
  selected,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  readonly hover?: boolean;
  readonly selected?: boolean;
  readonly ref?: Ref<HTMLTableRowElement>;
}): ReactNode {
  return (
    <tr
      className={cn(
        hover && selected !== true && tableClasses.rowHover,
        selected === true && tableClasses.rowSelected,
        className,
      )}
      aria-selected={selected}
      data-selected={selected === true ? "" : undefined}
      {...props}
    />
  );
}

export function TableHeaderCell({
  className,
  numeric = false,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { readonly numeric?: boolean }): ReactNode {
  return (
    <th
      className={cn(tableClasses.th, numeric && tableClasses.numeric, className)}
      data-numeric={numeric ? "" : undefined}
      {...props}
    />
  );
}

export function TableCell({
  className,
  mono = false,
  numeric = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  readonly mono?: boolean;
  readonly numeric?: boolean;
}): ReactNode {
  return (
    <td
      className={cn(
        tableClasses.td,
        mono && "font-mono",
        numeric && tableClasses.numeric,
        className,
      )}
      data-mono={mono ? "" : undefined}
      data-numeric={numeric ? "" : undefined}
      {...props}
    />
  );
}

export function TableCard({
  className,
  "aria-label": ariaLabel,
  ...props
}: HTMLAttributes<HTMLDivElement> & { readonly ref?: Ref<HTMLDivElement> }): ReactNode {
  const labelled =
    ariaLabel === undefined ? {} : { role: "region", tabIndex: 0, "aria-label": ariaLabel };
  return (
    <Card
      padding="none"
      className={cn(
        "relative isolate overflow-x-auto",
        ariaLabel !== undefined && "vk-field",
        className,
      )}
      {...labelled}
      {...props}
    />
  );
}
