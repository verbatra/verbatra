"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { trackUmamiEvent, type UmamiEvent } from "@/lib/umami";
import { useLinkPrefetch } from "@/lib/use-painted";

const MIDDLE_BUTTON = 1;

type Tracking = { track?: UmamiEvent | undefined };

type AnchorHandlers = {
  onClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  onAuxClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
};

function trackedHandlers({ track, onClick, onAuxClick }: Tracking & AnchorHandlers) {
  const send = () => {
    if (track) trackUmamiEvent(track.name, track.data);
  };
  return {
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      send();
    },
    onAuxClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onAuxClick?.(event);
      if (event.button === MIDDLE_BUTTON) send();
    },
  };
}

export type TrackedLinkProps = ComponentProps<typeof Link> & Tracking;

export function TrackedLink({
  track,
  onClick,
  onAuxClick,
  prefetch,
  ...rest
}: TrackedLinkProps): ReactNode {
  return (
    <Link
      {...rest}
      prefetch={useLinkPrefetch(prefetch)}
      {...trackedHandlers({ track, onClick, onAuxClick })}
    />
  );
}

export type TrackedAnchorProps = ComponentProps<"a"> & Tracking;

export function TrackedAnchor({
  track,
  onClick,
  onAuxClick,
  ...rest
}: TrackedAnchorProps): ReactNode {
  return <a {...rest} {...trackedHandlers({ track, onClick, onAuxClick })} />;
}
