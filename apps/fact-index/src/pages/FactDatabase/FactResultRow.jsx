import React from "react";
import PropTypes from "prop-types";
import { Group, Stack, Badge, Text, Anchor } from "@mantine/core";

export default function FactResultRow({
  fact,
  isSelected = false,
  classes = {}
}) {
  const titleId = `fact-title-${fact.id}`;

  return (
    <div
      aria-current={isSelected ? "true" : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="fact-result-row-inner"
    >
      <Stack gap="xs">
        {/* Title and Date */}
        <Group justify="space-between" align="flex-start">
          <Text id={titleId} fw={600} size="md" style={{ flex: 1 }}>
            {fact.title}
          </Text>
          {fact.date && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              📅 {new Date(fact.date).toLocaleDateString()}
            </Text>
          )}
        </Group>

        {/* Context */}
        {fact.context && (
          <Text size="sm" c="dimmed" lh={1.4}>
            {fact.context}
          </Text>
        )}

        {/* Badges (Type and Subject) */}
        {(fact.type || fact.subject) && (
          <Group gap="xs">
            {fact.type && (
              <Badge variant="light" color="blue" size="sm">
                {fact.type}
              </Badge>
            )}
            {fact.subject && (
              <Badge variant="light" color="purple" size="sm">
                {fact.subject}
              </Badge>
            )}
          </Group>
        )}

        {/* Source */}
        {fact.source && (
          <Group gap="xs">
            <Text size="xs" c="dimmed">🔗</Text>
            <Text size="xs" c="dimmed">
              {fact.sourceUrl ? (
                <Anchor
                  href={fact.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  size="xs"
                >
                  {fact.source}
                </Anchor>
              ) : (
                fact.source
              )}
            </Text>
          </Group>
        )}
      </Stack>
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
