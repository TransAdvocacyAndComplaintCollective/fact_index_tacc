import React from "react";
import type { ReactNode, CSSProperties } from "react";
import clsx from "clsx";
import styles from "./Button.module.scss";
import type { ButtonVariant, ButtonSize } from "./ButtonTypes";

export interface AnchorButtonProps {
    readonly href: string;
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
    readonly target?: string;
    readonly rel?: string;
}

export default function AnchorButton(props: AnchorButtonProps) {
    const {
        href,
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
        target,
        rel,
    } = props;

    const sizeStyles: Record<ButtonSize, string> = {
        sm: styles.sm,
        md: styles.md,
        lg: styles.lg,
    };

    // Calculate rel for _blank target, explicitly handling null/undefined
    const computedRel: string | undefined =
        target === "_blank"
            ? (rel ?? "noopener noreferrer")
            : rel;

    // Compose classes
    const computedClass = clsx(
        styles.button,
        styles[variant],
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        className,
        toggleable && isActive === true ? (activeClassName ?? styles.active) : undefined,
        disabled && styles.disabled
    );

    // If disabled, prevent click and tab
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (disabled || loading) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    return (
        <a
            href={disabled ? undefined : href}
            target={target}
            rel={computedRel}
            className={computedClass}
            aria-busy={loading || undefined}
            aria-disabled={disabled || undefined}
            aria-pressed={!!(toggleable && isActive === true)}
            style={style}
            tabIndex={disabled ? -1 : tabIndex}
            onClick={handleClick}
            draggable={disabled ? false : undefined}
        >
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
        </a>
    );
}
