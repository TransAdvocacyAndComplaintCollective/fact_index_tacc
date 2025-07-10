import React, { useState, useRef } from "react";
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
  // For status messages
  const [status, setStatus] = useState("");
  const statusRef = useRef();

  // Map state to a user-friendly string for announcement
  const stateLabel = {
    neutral: "Not selected",
    include: "Included",
    exclude: "Excluded"
  }[state];

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
        role="checkbox"
        aria-checked={triAriaChecked(state)}
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
          <span className={styles.chipMark} >
            ✔
          </span>
        )}
        {state === "exclude" && (
          <span className={styles.chipMark} >
            ✖
          </span>
        )}
        {state === "neutral" && (
          <span className={styles.chipMark}>
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

TriButton.propTypes = {
  label: PropTypes.string.isRequired,
  state: PropTypes.oneOf(["neutral", "include", "exclude"]).isRequired,
  onChange: PropTypes.func.isRequired,
  onStateChange: PropTypes.func,
  className: PropTypes.string,
};
