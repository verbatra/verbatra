"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { forwardedUrl, type SdkAnchorTargets } from "@/lib/sdk-anchors";

function isOnPage(anchor: string): boolean {
  return document.getElementById(anchor) !== null;
}

export function SdkAnchorForwarder({ targets }: { targets: SdkAnchorTargets }) {
  const router = useRouter();
  useEffect(() => {
    const forward = () => {
      const url = forwardedUrl(window.location.hash, targets, isOnPage);
      if (url !== undefined) router.replace(url);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, [router, targets]);
  return null;
}
