import React from "react";
import type { ReactNode, CSSProperties } from "react";
import clsx from "clsx";
import { NavLink as RouterNavLink } from "react-router-dom";
import styles from "./Button.module.scss";
import type { ButtonVariant, ButtonSize } from "./ButtonTypes";

export interface ButtonNavLinkProps {
    readonly to: string;
    readonly children: ReactNode;
    readonly className?: string;
    readonly variant?: ButtonVariant;
    readonly size?: ButtonSize;
    readonly loading?: boolean;
    readonly disabled?: boolean;
    readonly fullWidth?: boolean;
    readonly activeClassName?: string;
    readonly toggleable?: boolean;
    readonly isActive?: boolean;
    readonly style?: CSSProperties;
    readonly tabIndex?: number;
}

export default function ButtonNavLink(props: ButtonNavLinkProps) {
    const {
        to,
        children,
        className = "",
        variant = "outlined",
        size = "md",
        loading = false,
        disabled = false,
        fullWidth = false,
        activeClassName,
        toggleable = false,
        isActive,
        style,
        tabIndex = 0,
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
            type="button"
            disabled={disabled}
            aria-busy={loading || undefined}
            tabIndex={tabIndex}
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
        >
            <RouterNavLink
                to={to}
                aria-busy={loading || undefined}
                aria-disabled={disabled || undefined}
                style={style}
                aria-pressed={toggleable ? isActive !== false : undefined}
                className={({ isActive: navActive }) =>
                    clsx(
                        styles.button,
                        styles[variant],
                        sizeStyles[size],
                        fullWidth && styles.fullWidth,
                        className,
                        (navActive || (toggleable && isActive === true)) &&
                        (activeClassName ?? styles.active)
                    )
                }
                tabIndex={tabIndex}
            >
                {content}
            </RouterNavLink>
        </button>
    );
}
