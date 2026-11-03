export { Badge, type BadgeTone } from "./badge.tsx";
export {
  Button,
  type ButtonClassesOptions,
  ButtonContent,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonClasses,
} from "./button.tsx";
export { Card, type CardPadding, type CardProps } from "./card.tsx";
export { cn } from "./cn.ts";
export { Icon, type IconName } from "./icon.tsx";

export const THEMES = ["dark", "light"] as const;

export type ThemeName = (typeof THEMES)[number];
