import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type AnyProps = Record<string, unknown> & { children?: ReactNode; footer?: ReactNode };

function isAsyncComponent(type: unknown): type is (props: AnyProps) => Promise<ReactNode> {
  return typeof type === "function" && type.constructor.name === "AsyncFunction";
}

export async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<AnyProps>;
  if (isAsyncComponent(element.type)) return resolveServer(await element.type(element.props));
  const overrides: Partial<AnyProps> = {};
  if (element.props.children !== undefined) {
    overrides.children = await resolveServer(element.props.children);
  }
  if (element.props.footer !== undefined) {
    overrides.footer = await resolveServer(element.props.footer);
  }
  return cloneElement(element, overrides);
}
