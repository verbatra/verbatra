"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const HOME_LAYOUT_ID = "nd-home-layout";

export function HomeContainer({ className, children, style }: ComponentProps<"main">): ReactNode {
  return (
    <div id={HOME_LAYOUT_ID} className={cn("flex flex-1 flex-col", className)} style={style}>
      {children}
    </div>
  );
}
