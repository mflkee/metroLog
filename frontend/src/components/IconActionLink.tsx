import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type CommonProps = {
  className?: string;
  icon: ReactNode;
  label: string;
  size?: "default" | "tiny";
  title?: string;
};

type ExternalIconActionLinkProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    to?: never;
  };

type InternalIconActionLinkProps = CommonProps & {
  href?: never;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  target?: never;
  rel?: never;
  to: string;
};

type IconActionLinkProps = ExternalIconActionLinkProps | InternalIconActionLinkProps;

export function IconActionLink({
  className,
  icon,
  label,
  size = "default",
  title,
  ...props
}: IconActionLinkProps) {
  const composedClassName = [
    "icon-action-button",
    size === "tiny" ? "icon-action-button--tiny" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const internalProps = props as InternalIconActionLinkProps;
  if (typeof internalProps.to === "string") {
    const { to, ...linkProps } = internalProps;
    return (
      <Link
        aria-label={label}
        className={composedClassName}
        title={title ?? label}
        to={to}
        {...linkProps}
      >
        {icon}
      </Link>
    );
  }

  const { href, ...anchorProps } = props as ExternalIconActionLinkProps;
  return (
    <a
      aria-label={label}
      className={composedClassName}
      href={href}
      title={title ?? label}
      {...anchorProps}
    >
      {icon}
    </a>
  );
}
