import React from "react";
import styles from "./Chip.module.scss";

interface ChipProps {
  readonly children: React.ReactNode;
  readonly type?: "chipType" | "chipSubject" | "chipNone";
}

/**
 * Renders a styled chip with the correct modifier class.
 * Accepts type: 'chipType', 'chipSubject', or 'chipNone'
 */
export default function Chip({ children, type }: ChipProps) {
  const className = [styles.chip, type && styles[type]].filter(Boolean).join(" ");
  return <span className={className}>{children}</span>;
}
