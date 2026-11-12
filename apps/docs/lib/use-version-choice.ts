import { useSyncExternalStore } from "react";
import {
  chosenLatest,
  currentChoice,
  subscribeVersion,
  type VersionChoice,
  type VersionPackage,
} from "@/lib/docs-version";

export function useVersionChoice(pkg: VersionPackage): VersionChoice {
  return useSyncExternalStore(subscribeVersion, () => currentChoice(pkg), chosenLatest);
}
