import type { HTMLAttributes, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { Card } from "./Card.js";
import { cn } from "./lib/cn.js";
import { tableClasses } from "./ui.js";

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
  ...props
}: HTMLAttributes<HTMLTableRowElement> & {
  readonly hover?: boolean;
  readonly ref?: Ref<HTMLTableRowElement>;
}): ReactNode {
  return <tr className={cn(hover && tableClasses.rowHover, className)} {...props} />;
}

export function TableHeaderCell({
  className,
  numeric = false,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { readonly numeric?: boolean }): ReactNode {
  return (
    <th className={cn(tableClasses.th, numeric && tableClasses.numeric, className)} {...props} />
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
      {...props}
    />
  );
}

export function TableCard({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactNode {
  return <Card padding="none" className={cn("overflow-x-auto", className)} {...props} />;
}
