import React from "react";
import PropTypes from "prop-types";
import * as styles from "./TriButton.module.scss";

// Cycle through tri-states: neutral → include → exclude → neutral...
const nextTriState = (current) => {
  if (current === "include") return "exclude";
  if (current === "exclude") return "neutral";
  return "include";
};

// Map tri-state to ARIA checked states for accessibility
const triAriaChecked = (state) => {
  if (state === "include") return true;
  if (state === "exclude") return "mixed";
  return false;
};

/**
 * TriButton - tri-state toggle button component
 *
 * @param {string} label - Button text label
 * @param {"neutral"|"include"|"exclude"} state - Current toggle state
 * @param {function} onChange - Called with next state when toggled
 * @param {function} [onStateChange] - Optional callback fired on state change
 * @param {string} className - Optional additional CSS classes
 */
export default function TriButton({ label, state, onChange, onStateChange, className = "", ...props }) {
  // Wrapper to handle toggle and callback
  const handleToggle = () => {
    const nextState = nextTriState(state);
    onChange(nextState);
    if (onStateChange) {
      onStateChange(nextState);
    }
  };

  return (
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
      role="checkbox"
      aria-checked={triAriaChecked(state)}
      aria-label={
        state === "neutral"
          ? `${label}: not selected. Tap to include`
          : state === "include"
          ? `${label}: included. Tap to exclude`
          : `${label}: excluded. Tap to clear`
      }
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
        <span className={styles.chipMark} aria-label="Included">
          ✔
        </span>
      )}
      {state === "exclude" && (
        <span className={styles.chipMark} aria-label="Excluded">
          ✖
        </span>
      )}
      {state === "neutral" && (
        <span className={styles.chipMark} aria-label="Neutral">
          ⏺
        </span>
      )}
    </button>
  );
}

TriButton.propTypes = {
  label: PropTypes.string.isRequired,
  state: PropTypes.oneOf(["neutral", "include", "exclude"]).isRequired,
  onChange: PropTypes.func.isRequired,
  onStateChange: PropTypes.func,
  className: PropTypes.string,
};
