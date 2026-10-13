import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function PlainList({
  ordered = false,
  ...props
}: ComponentPropsWithoutRef<"ul"> & { ordered?: boolean }): ReactNode {
  const List = ordered ? "ol" : "ul";
  return <List role="list" {...props} />;
}
