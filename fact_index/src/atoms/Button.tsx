import React, {
  useState,
  useCallback,
  ReactNode,
  ButtonHTMLAttributes,
} from "react";
import clsx from "clsx";
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
} from "react-router-dom";
import * as styles from "./Button.module.scss";

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
  onClick?: (e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => void;
  style?: React.CSSProperties;
};
type RouterButtonProps = CommonButtonProps & {
  to: string;
  href?: undefined;
  nav?: boolean;
  target?: string;
  rel?: string;
  type?: never;
};

type AnchorButtonProps = CommonButtonProps & {
  href: string;
  to?: undefined;
  target?: string;
  rel?: string;
  type?: never;
};

type NativeButtonProps = CommonButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "children" | "onClick"> & {
    type?: "button" | "submit" | "reset";
    to?: undefined;
    href?: undefined;
    nav?: never;
  };

type ButtonProps = RouterButtonProps | AnchorButtonProps | NativeButtonProps;
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
  } = props as ButtonProps & { [key: string]: unknown };

  const isDisabled = disabled || loading;
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActive);

  let isActive: boolean | undefined;
  if (toggleable) {
    if (controlledActive !== undefined) {
      isActive = controlledActive;
    } else {
      isActive = uncontrolledActive;
    }
  } else {
    isActive = undefined;
  }

  const handleToggle = useCallback(
    () => {
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
        handleToggle();
        if (onClick) onClick(e);
      }
    },
    [toggleable, handleToggle, onClick]
  );

  const content = (
    <>
      {loading && (
        <svg
          className={(styles).spinner}
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

  const sizeStyles: Record<ButtonSize, string> = {
    sm: (styles as unknown as Record<string, string>).sm,
    md: (styles as unknown as Record<string, string>).md,
    lg: (styles as unknown as Record<string, string>).lg,
  };
  const computedClass = clsx(
    styles.button,
    (styles as unknown as Record<string, string>)[variant],
    sizeStyles[size],
    fullWidth && (styles).fullWidth,
    className,
    toggleable && isActive && (activeClassName || "active")
  );

  let buttonType: "button" | "submit" | "reset";
  if (type === "submit") {
    buttonType = "submit";
  } else if (type === "reset") {
    buttonType = "reset";
  } else {
    buttonType = "button";
  }

  // Extract small render functions to reduce complexity
  const renderNavLink = () => (
    <RouterNavLink
      to={to!}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      style={style}
      aria-pressed={toggleable ? !!isActive : undefined}
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
      tabIndex={0}
    >
      {content}
    </RouterNavLink>
  );

  const renderRouterLink = () => (
    <RouterLink
      to={to!}
      className={computedClass}
      aria-busy={loading || undefined}
      style={style}
      aria-disabled={isDisabled || undefined}
      tabIndex={0}
      aria-pressed={toggleable ? !!isActive : undefined}
    >
      {content}
    </RouterLink>
  );

  const renderAnchorLink = () => (
    <a
      href={href!}
      target={target}
      rel={target === "_blank" ? rel || "noopener noreferrer" : rel}
      className={computedClass}
      aria-busy={loading || undefined}
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      style={style}
      onClick={e => {
        if (toggleable) handleToggle();
        if (onClick) onClick(e);
      }}
      onKeyDown={handleKeyDown}
    >
      {content}
    </a>
  );

  const renderNativeButton = () => (
    <button
      type={buttonType}
      onClick={e => {
        if (toggleable) handleToggle();
        if (onClick) onClick(e);
      }}
      onKeyDown={handleKeyDown}
      disabled={isDisabled}
      className={computedClass}
      aria-busy={loading || undefined}
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      style={style}
      aria-pressed={toggleable ? !!isActive : undefined}
    >
      {content}
    </button>
  );

  const renderContent = () => {
    if (nav && to && !isDisabled) return renderNavLink();
    if (to && !isDisabled) return renderRouterLink();
    if (href && !isDisabled) return renderAnchorLink();
    return renderNativeButton();
  };

  return renderContent();
}
