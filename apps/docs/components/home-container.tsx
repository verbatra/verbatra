"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const HOME_LAYOUT_ID = "nd-home-layout";

export function HomeContainer({ className, ...rest }: ComponentPropsWithoutRef<"div">): ReactNode {
  return <div id={HOME_LAYOUT_ID} {...rest} className={cn("flex flex-1 flex-col", className)} />;
}
