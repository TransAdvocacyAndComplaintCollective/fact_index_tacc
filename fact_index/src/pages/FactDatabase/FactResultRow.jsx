import React from "react";
import PropTypes from "prop-types";

export default function FactResultRow({
  fact,
  isSelected = false,
  classes = {}
}) {
  // Create an id for the title, e.g. "fact-title-42"
  const titleId = `fact-title-${fact.id}`;

  return (
    <div
      className={
        `${classes.row || ""}` +
        (isSelected ? ` ${classes.selected || ""}` : "")
      }
      aria-current={isSelected ? "true" : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      // REMOVE role="listitem" -- now done in parent
      data-testid="fact-result-row-inner"
    >
      <div className={classes.grid}>
        <div className={classes.top}>
          <span id={titleId} className={classes.text}>
            {fact.title}
          </span>
          {fact.date && (
            <span className={classes.date}>
              {new Date(fact.date).toLocaleDateString()}
            </span>
          )}
        </div>
        {fact.context && (
          <div className={classes.context}>{fact.context}</div>
        )}
        <div className={classes.chips}>
          {fact.type && (
            <span className={`${classes.chip} ${classes.chipType}`}>
              {fact.type}
            </span>
          )}
          {fact.subject && (
            <span className={`${classes.chip} ${classes.chipSubject}`}>
              {fact.subject}
            </span>
          )}
        </div>
        {fact.source && (
          <div className={classes.source}>
            Source:{" "}
            {fact.sourceUrl ? (
              <a
                href={fact.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={-1}
              >
                {fact.source}
              </a>
            ) : (
              fact.source
            )}
          </div>
        )}
      </div>
    </div>
  );
}
FactResultRow.propTypes = {
  fact: PropTypes.shape({
    id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    date: PropTypes.string,
    context: PropTypes.string,
    type: PropTypes.string,
    subject: PropTypes.string,
    source: PropTypes.string,
    sourceUrl: PropTypes.string
  }).isRequired,
  isSelected: PropTypes.bool,
  classes: PropTypes.shape({
    row: PropTypes.string,
    selected: PropTypes.string,
    grid: PropTypes.string,
    top: PropTypes.string,
    text: PropTypes.string,
    date: PropTypes.string,
    context: PropTypes.string,
    chips: PropTypes.string,
    chip: PropTypes.string,
    chipType: PropTypes.string,
    chipSubject: PropTypes.string,
    source: PropTypes.string
  })
};
