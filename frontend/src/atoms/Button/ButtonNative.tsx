import type { ReactNode, CSSProperties, MouseEvent, KeyboardEvent } from "react";
import React from "react";
import clsx from "clsx";
import styles from "./Button.module.scss";
import type { ButtonSize, ButtonVariant } from "./ButtonTypes";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonNativeProps {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  toggleable?: boolean;
  isActive?: boolean;
  activeClassName?: string;
  style?: CSSProperties;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  onClick?: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  handleToggle?: () => void;
}

export default function ButtonNative(props: Readonly<ButtonNativeProps>) {
  const {
    children,
    className = "",
    variant = "outlined",
    size = "md",
    loading = false,
    disabled = false,
    fullWidth = false,
    toggleable = false,
    isActive,
    activeClassName,
    style,
    type = "button",
    onClick,
    onKeyDown,
    handleToggle,
  } = props;

  const sizeStyles: Record<ButtonSize, string> = {
    sm: styles.sm,
    md: styles.md,
    lg: styles.lg,
  };

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

  return (
    <button
      onClick={e => {
        if (toggleable && handleToggle) handleToggle();
        if (onClick) onClick(e);
      }}
      type={type === "submit" ? "submit" : "button"}
      disabled={disabled}
      aria-busy={loading || undefined}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      style={style}
      aria-pressed={!!(toggleable && (isActive === true))}
      className={clsx(
        styles.button,
        styles[variant],
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        className,
        toggleable && isActive === true ? (activeClassName ?? styles.active) : undefined
      )}
      onKeyDown={onKeyDown}
    >
      {content}
    </button>
  );
}
