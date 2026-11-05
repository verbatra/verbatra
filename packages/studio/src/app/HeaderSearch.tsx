import { SearchInput } from "@verbatra/ui";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { routeParams } from "../client/routes.js";
import { navigateToRoute, useRoute } from "./use-route.js";

export function HeaderSearch({
  className,
  label,
  onSearch,
}: {
  readonly className?: string;
  readonly label: string;
  readonly onSearch?: () => void;
}): ReactNode {
  const [value, setValue] = useState("");
  const route = useRoute();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const query = value.trim();
    const current = route.page === "translations" ? route.params : {};
    const navigated = navigateToRoute({
      page: "translations",
      params: routeParams({
        locale: current.locale,
        statuses: current.statuses,
        key: current.key,
        query,
      }),
    });
    if (navigated) {
      setValue("");
      onSearch?.();
    }
  }

  return (
    <search aria-label={label} className={className}>
      <form onSubmit={submit}>
        <SearchInput
          aria-label="Search keys and text"
          placeholder="Search keys and text…"
          value={value}
          wrapperClassName="sm:max-w-none"
          className="h-9 rounded-full border-(--text-faint) bg-(--surface-card) py-0"
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    </search>
  );
}
