export type FieldSize = "xs" | "sm" | "md";

export const FIELD_BASE =
  "vk-field block w-full rounded-(--radius-md) border border-(--border-default) bg-(--surface-raised) text-(--text-strong) placeholder:text-(--text-muted) disabled:opacity-60 aria-invalid:border-(--border-danger)";

export const FIELD_SIZE: Readonly<Record<FieldSize, string>> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-[7px] text-sm",
  md: "px-[18px] py-[11px] text-sm",
};
