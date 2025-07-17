import React, { useState, useRef } from "react";
import * as styles from "./TriButton.module.scss";

export type State = "neutral" | "include" | "exclude";

interface TriButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  label: string;
  state?: State;
  onChange: (nextState:State) => void;
  onStateChange?: (nextState: State) => void;
  className?: string;
}

// Cycle through tri-states: neutral → include → exclude → neutral...
const nextTriState = (current: State): State => {
  if (current === "include") return "exclude";
  if (current === "exclude") return "neutral";
  return "include";
};

// Map tri-state to ARIA pressed states for accessibility
const triAriaPressed = (state: State): "true" | "mixed" | "false" => {
  if (state === "include") return "true";
  if (state === "exclude") return "mixed";
  return "false";
};

/**
 * TriButton component for tri-state toggling (neutral, include, exclude).
 * @param {string} label - Button text label
 * @param {"neutral"|"include"|"exclude"} state - Current toggle state
 * @param {function} onChange - Called with next state when toggled
 * @param {function} [onStateChange] - Optional callback fired on state change
 * @param {string} className - Optional additional CSS classes
 */
export default function TriButton({
  label,
  state = "neutral",
  onChange,
  onStateChange,
  className = "",
  ...props
}: TriButtonProps) {
  // For status messages
  const [status, setStatus] = useState("");
  const statusRef = useRef<HTMLSpanElement | null>(null);

  // Wrapper to handle toggle and callback
  const handleToggle = () => {
    const nextState = nextTriState(state);
    onChange(nextState);
    if (onStateChange) {
      onStateChange(nextState);
    }
    setStatus(`${label}: ${{
      neutral: "cleared",
      include: "included",
      exclude: "excluded"
    }[nextState]}.`);
    // Clear status after a short delay to prevent repeated announcements
    setTimeout(() => setStatus(""), 2000);
  };

  return (
    <>
      <button
        type="button"
        className={[
          styles.chip,
          state === "neutral" && styles.chipNeutral,
          state === "include" && styles.chipInclude,
          state === "exclude" && styles.chipExclude,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="switch"
        aria-checked={triAriaPressed(state)}
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
        {...props}
      >
        {label}
        {state === "include" && (
          <span className={styles.chipMark} aria-hidden="true">
            ✔
          </span>
        )}
        {state === "exclude" && (
          <span className={styles.chipMark} aria-hidden="true">
            ✖
          </span>
        )}
        {state === "neutral" && (
          <span className={styles.chipMark} aria-hidden="true">
            ⏺
          </span>
        )}
        {/* Status as visually hidden for screen readers */}
        <span
          ref={statusRef}
          className="visually-hidden"
          aria-live="polite"
          aria-atomic="true"
        >
          {status}
        </span>
      </button>
    </>
  );
}
