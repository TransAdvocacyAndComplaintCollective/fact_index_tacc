import React from "react";
import PropTypes from "prop-types";
import { Group, Stack, Badge, Text, Anchor, Card, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import { FaCalendarAlt, FaLink } from "react-icons/fa";

export default function FactResultRow({
  fact,
  isSelected = false
}) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const titleId = `fact-title-${fact.id}`;
  
  // Check if row has any meaningful content
  const hasContent = fact.title || fact.fact_text || fact.context || fact.type || fact.subject || fact.source;
  
  if (!hasContent) {
    return null;
  }
  
  // Use fact_text as fallback for title
  const displayTitle = fact.title || fact.fact_text;

  const isDark = colorScheme === "dark";
  const cardTextColor = isDark ? theme.colors.gray[0] : theme.colors.dark[9];
  const cardBackground = isSelected
    ? isDark
      ? theme.colors.blue[9]
      : theme.colors.blue[0]
    : isDark
    ? theme.colors.dark[7]
    : '#ffffff';
  const badgeBackground = isDark ? theme.colors.dark[5] : theme.colors.gray[3];
  const badgeTextColor = isDark ? theme.colors.gray[0] : theme.colors.dark[9];
  
  return (
    <Card 
      p="lg" 
      radius="md" 
      withBorder 
      shadow={isSelected ? "md" : "sm"}
      style={{
        willChange: "transform, border-color, background-color, box-shadow",
        transition: "border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
        transform: "translateY(0)",
        border: `1px solid ${
          isSelected ? theme.colors.blue[6] : isDark ? theme.colors.gray[7] : theme.colors.gray[3]
        }`,
        borderColor: isSelected ? theme.colors.blue[6] : isDark ? theme.colors.gray[7] : theme.colors.gray[3],
        backgroundColor: cardBackground,
        boxShadow: isSelected ? theme.shadows.md : theme.shadows.sm,
        cursor: "pointer",
        color: cardTextColor,
      }}
      className="fact-card"
    >
      <Card.Section p="0">
        <Stack gap="xs">
          {/* Title and Date */}
          <Group justify="space-between" align="flex-start">
            <Text id={titleId} fw={600} size="md" lineClamp={2} c={cardTextColor}>
              {displayTitle}
            </Text>
            {fact.date && (
              <Group gap="xs" align="center">
                <FaCalendarAlt aria-hidden="true" size={14} />
                <Text size="sm" sx={{ whiteSpace: "nowrap" }} c={cardTextColor}>
                  {new Date(fact.date).toLocaleDateString()}
                </Text>
              </Group>
            )}
          </Group>

          {/* Context */}
              {fact.context && (
                <Text size="sm" lineClamp={2} c={cardTextColor}>
                  {fact.context}
                </Text>
              )}

          {/* Badges (Type and Subject) */}
          {(fact.type || fact.subject || fact.audience) && (
            <Group gap="xs">
              {fact.type && (
                <Badge
                  size="sm"
                  variant="filled"
                  color="dark"
                  style={{
                    backgroundColor: badgeBackground,
                    color: badgeTextColor,
                  }}
                >
                  {fact.type}
                </Badge>
              )}
              {fact.subject && (
                <Badge
                  size="sm"
                  variant="filled"
                  color="dark"
                  style={{
                    backgroundColor: badgeBackground,
                    color: badgeTextColor,
                  }}
                >
                  {fact.subject}
                </Badge>
              )}
              {fact.audience && (
                <Badge
                  size="sm"
                  variant="filled"
                  color="dark"
                  style={{
                    backgroundColor: badgeBackground,
                    color: badgeTextColor,
                  }}
                >
                  {fact.audience}
                </Badge>
              )}
            </Group>
          )}

          {/* Source */}
              {fact.source && (
                <Group gap="xs" align="center">
                  <FaLink aria-hidden="true" size={12} />
                  <Text size="xs" c={cardTextColor}>
                    {fact.source}
                  </Text>
                </Group>
              )}
        </Stack>
      </Card.Section>
    </Card>
  );
}
FactResultRow.propTypes = {
  fact: PropTypes.shape({
    id: PropTypes.number.isRequired,
    title: PropTypes.string,
    fact_text: PropTypes.string,
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
