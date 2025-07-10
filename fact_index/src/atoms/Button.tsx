import React, {
  useState,
  useCallback,
  ReactNode,
  ButtonHTMLAttributes,
  AnchorHTMLAttributes,
} from "react";
import clsx from "clsx";
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
} from "react-router-dom";
import styles from "./Button.module.scss";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outlined"
  | "danger"
  | "success"
  | "info"
  | "warning"
  | "ghost"
  | "subtle"
  | "link";
type ButtonSize = "sm" | "md" | "lg";

type CommonButtonProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  activeClassName?: string;
  nav?: boolean;
  toggleable?: boolean;
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (active: boolean) => void;
  style?: React.CSSProperties;
};

type RouterButtonProps = CommonButtonProps & {
  to: string;
  href?: undefined;
  nav?: boolean;
  target?: string;
  rel?: string;
  type?: never;
  onClick?: (e?: any) => void;
};
type AnchorButtonProps = CommonButtonProps & {
  href: string;
  to?: undefined;
  target?: string;
  rel?: string;
  type?: never;
  onClick?: (e?: any) => void;
};
type NativeButtonProps = CommonButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "children" | "onClick"> & {
    type?: "button" | "submit" | "reset";
    to?: undefined;
    href?: undefined;
    nav?: never;
    onClick?: (e?: any) => void;
  };

export type ButtonProps = RouterButtonProps | AnchorButtonProps | NativeButtonProps;

export default function Button(props: ButtonProps) {
  const {
    children,
    onClick,
    className = "",
    variant = "outlined",
    size = "md",
    loading = false,
    disabled = false,
    fullWidth = false,
    type = "button",
    to,
    nav = false,
    href,
    target,
    rel,
    activeClassName,
    toggleable = false,
    active: controlledActive,
    defaultActive = false,
    onToggle,
    style,
    ...rest
  } = props as ButtonProps & { [key: string]: any };

  const isDisabled = disabled || loading;
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActive);

  const isActive = toggleable
    ? (controlledActive !== undefined ? controlledActive : uncontrolledActive)
    : undefined;

  const handleToggle = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      if (isDisabled) return;
      if (toggleable) {
        const nextActive =
          controlledActive !== undefined ? !controlledActive : !uncontrolledActive;
        if (controlledActive === undefined) setUncontrolledActive(nextActive);
        if (onToggle) onToggle(nextActive);
      }
    },
    [isDisabled, toggleable, controlledActive, uncontrolledActive, onToggle]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (toggleable && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        handleToggle(e);
        if (onClick) onClick(e);
      }
    },
    [toggleable, handleToggle, onClick]
  );

  const content = (
    <>
      {loading && (
        <svg
          className={styles.spinner}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          ></path>
        </svg>
      )}
      {children}
    </>
  );

  const computedClass = clsx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    className,
    toggleable && isActive && styles.active
  );

  // Only the props that are safe for <a> or <Link>
  const anchorSafeProps = {
    className: computedClass,
    style,
    tabIndex: isDisabled ? -1 : 0,
    "aria-busy": loading ? true : undefined,
    "aria-disabled": isDisabled ? true : undefined,
    ...(toggleable ? { "aria-pressed": !!isActive } : {}),
  };

  // NavLink (react-router)
  if (nav && to && !isDisabled) {
    return (
      <RouterNavLink
        to={to}
        className={({ isActive: navActive }) =>
          clsx(
            styles.button,
            styles[variant],
            styles[size],
            fullWidth && styles.fullWidth,
            className,
            (navActive || (toggleable && isActive)) &&
              (activeClassName || styles.active)
          )
        }
        style={style}
        tabIndex={0}
        aria-disabled={isDisabled ? true : undefined}
        aria-busy={loading ? true : undefined}
        {...(toggleable ? { "aria-pressed": !!isActive } : {})}
        // onClick/onKeyDown go here only if needed for toggle, but usually not with NavLink
      >
        {content}
      </RouterNavLink>
    );
  }

  // RouterLink (react-router)
  if (to && !isDisabled) {
    return (
      <RouterLink
        to={to}
        {...anchorSafeProps}
        target={target}
        rel={target === "_blank" ? rel || "noopener noreferrer" : rel}
        onClick={e => {
          if (toggleable) handleToggle(e);
          if (onClick) onClick(e);
        }}
        onKeyDown={handleKeyDown}
      >
        {content}
      </RouterLink>
    );
  }

  // Anchor link
  if (href && !isDisabled) {
    return (
      <a
        href={href}
        {...anchorSafeProps}
        target={target}
        rel={target === "_blank" ? rel || "noopener noreferrer" : rel}
        onClick={e => {
          if (toggleable) handleToggle(e);
          if (onClick) onClick(e);
        }}
        onKeyDown={handleKeyDown}
      >
        {content}
      </a>
    );
  }

  // Native button (default)
  return (
    <button
      type={type}
      className={computedClass}
      style={style}
      disabled={isDisabled}
      aria-busy={loading ? true : undefined}
      aria-disabled={isDisabled ? true : undefined}
      tabIndex={isDisabled ? -1 : 0}
      {...(toggleable ? { "aria-pressed": !!isActive } : {})}
      onClick={e => {
        if (toggleable) handleToggle(e);
        if (onClick) onClick(e);
      }}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {content}
    </button>
  );
}
