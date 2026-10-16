"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CopyControl, type CopyControlSize } from "@/components/ui/copy-control";

type CopyButtonProps = {
  text: string;
  label: string;
  size?: CopyControlSize;
  className?: string;
};

export function CopyButton({ text, label, size = "md", className }: CopyButtonProps): ReactNode {
  const t = useTranslations("landing.install");
  return (
    <CopyControl
      text={text}
      label={label}
      status={{ copy: t("copy"), copied: t("copied"), copyFailed: t("copyFailed") }}
      size={size}
      {...(className === undefined ? {} : { className })}
    />
  );
}
