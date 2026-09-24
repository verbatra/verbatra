"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isPackageManagerId,
  PACKAGE_MANAGER_STORAGE_KEY,
  type PackageManagerId,
} from "@/lib/install-commands";

type StorageName = "sessionStorage" | "localStorage";

const READ_ORDER: ReadonlyArray<StorageName> = ["sessionStorage", "localStorage"];

function readStorage(name: StorageName): string | null {
  try {
    return window[name].getItem(PACKAGE_MANAGER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(name: StorageName, value: string): void {
  try {
    window[name].setItem(PACKAGE_MANAGER_STORAGE_KEY, value);
  } catch {}
}

export function readPackageManager(): PackageManagerId | undefined {
  for (const name of READ_ORDER) {
    const value = readStorage(name);
    if (isPackageManagerId(value)) return value;
  }
  return undefined;
}

export function writePackageManager(value: PackageManagerId): void {
  for (const name of READ_ORDER) writeStorage(name, value);
}

export function usePackageManager(
  fallback: PackageManagerId,
): [PackageManagerId, (value: PackageManagerId) => void] {
  const [manager, setManager] = useState<PackageManagerId>(fallback);

  useEffect(() => {
    const stored = readPackageManager();
    if (stored !== undefined) setManager(stored);
  }, []);

  const select = useCallback((value: PackageManagerId) => {
    setManager(value);
    writePackageManager(value);
  }, []);

  return [manager, select];
}
