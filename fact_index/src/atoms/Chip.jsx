// Chip.jsx
import React from "react";
import PropTypes from "prop-types";
import * as styles from "./Chip.module.scss";

/**
 * Renders a styled chip with the correct modifier class.
 * Accepts type: 'chipType', 'chipSubject', or 'chipNone'
 */
export default function Chip({ children, type }) {
  // type must match the modifier class in SCSS exactly
  const className = [styles.chip, type && styles[type]].filter(Boolean).join(" ");
  return <span className={className}>{children}</span>;
}

Chip.propTypes = {
  children: PropTypes.node.isRequired,
  type: PropTypes.oneOf(["chipType", "chipSubject", "chipNone"]),
};
