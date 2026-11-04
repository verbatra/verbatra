export type FieldSize = "xs" | "sm" | "md";

export const FIELD_BASE =
  "vk-field block w-full rounded-(--radius-md) border border-(--text-faint) bg-(--surface-raised) text-(--text-strong) placeholder:text-(--text-muted) motion-safe:transition-colors motion-safe:duration-(--duration-fast) hover:border-(--border-accent) disabled:opacity-60 aria-invalid:border-(--border-danger)";

export const FIELD_SIZE: Readonly<Record<FieldSize, string>> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-[7px] text-sm",
  md: "px-[18px] py-[11px] text-sm",
};
