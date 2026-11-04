import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { cn } from "./cn.ts";
import { FIELD_BASE, FIELD_SIZE, type FieldSize } from "./field.ts";
import { Icon } from "./icon.tsx";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  readonly size?: FieldSize;
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly ref?: Ref<HTMLTextAreaElement> | undefined;
}

export function TextArea({ className, ...props }: TextAreaProps): ReactNode {
  return <textarea className={cn(FIELD_BASE, FIELD_SIZE.sm, className)} {...props} />;
}

export function TextField({
  className,
  type = "text",
  size = "sm",
  ...props
}: TextFieldProps): ReactNode {
  return (
    <input
      type={type}
      className={cn(FIELD_BASE, FIELD_SIZE[size], className)}
      {...props}
      data-size={size}
    />
  );
}

const SEARCH_PADDING: Readonly<Record<FieldSize, string>> = {
  xs: "ps-7",
  sm: "ps-8",
  md: "ps-10",
};

export interface SearchInputProps extends Omit<TextFieldProps, "type"> {
  readonly wrapperClassName?: string;
}

export function SearchInput({
  className,
  wrapperClassName,
  size = "sm",
  ...props
}: SearchInputProps): ReactNode {
  return (
    <span className={cn("relative block w-full sm:max-w-[320px]", wrapperClassName)}>
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)"
      />
      <input
        className={cn(FIELD_BASE, FIELD_SIZE[size], SEARCH_PADDING[size], className)}
        {...props}
        type="search"
        data-size={size}
      />
    </span>
  );
}
