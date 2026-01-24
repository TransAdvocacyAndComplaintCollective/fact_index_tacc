import React from "react";
import PropTypes from "prop-types";
import { Stack, Group, Text, Badge, Button, NumberInput, Card, Divider, ActionIcon } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

// State cycling: neutral → include → exclude → neutral...
const nextChipState = (current) => {
  if (current === "include") return "exclude";
  if (current === "exclude") return "neutral";
  return "include";
};

export default function SidebarFilters({ filters, setFilters, subjects, audiences }) {
  // Toggle chip state for subjects/audiences filters
  function handleChipToggle(key, value) {
    setFilters((f) => {
      const current = (f[key]?.[value]) || "neutral";
      const next = nextChipState(current);
      return {
        ...f,
        [key]: {
          ...f[key],
          [value]: next,
        },
      };
    });
  }

  // Render chips (subject or audience)
  function renderChips(key, items) {
    const chipStates = filters[key] || {};
    return (
      <Group gap="xs" wrap="wrap">
        {items.map((item) => {
          const state = chipStates[item.name] || "neutral";
          const variantMap = {
            "neutral": "default",
            "include": "filled",
            "exclude": "outline"
          };
          const colorMap = {
            "neutral": "gray",
            "include": "blue",
            "exclude": "red"
          };
          const label = state === "include" ? `${item.name} ✔` : state === "exclude" ? `${item.name} ✖` : item.name;
          return (
            <Badge
              key={item.id || item.name}
              variant={variantMap[state]}
              color={colorMap[state]}
              onClick={() => handleChipToggle(key, item.name)}
              style={{ cursor: "pointer" }}
              role="checkbox"
              aria-checked={state === "include" ? true : state === "exclude" ? "mixed" : false}
              aria-label={
                state === "neutral"
                  ? `${item.name}: not selected. Click to include`
                  : state === "include"
                  ? `${item.name}: included. Click to exclude`
                  : `${item.name}: excluded. Click to clear`
              }
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleChipToggle(key, item.name);
                }
              }}
            >
              {label}
            </Badge>
          );
        })}
      </Group>
    );
  }

  return (
    <Card shadow="md" padding="lg" radius="md" withBorder style={{
      borderLeft: '4px solid var(--mantine-color-blue-6)',
      backgroundColor: 'var(--mantine-color-gray-0)'
    }}>
      <Stack gap="lg">
        <Text fw={700} size="lg" style={{ color: 'var(--mantine-color-blue-7)' }}>
          🔍 Filter Facts
        </Text>

        {/* Subjects */}
        <div>
          <Text fw={600} mb="xs" size="sm" style={{ textTransform: 'uppercase', color: 'var(--mantine-color-gray-7)' }}>
            📌 Subjects
          </Text>
          {subjects.length === 0 ? (
            <Text size="sm" c="dimmed" style={{ padding: '0.75rem', backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: '6px', textAlign: 'center' }}>
              No subject tags available yet
            </Text>
          ) : (
            renderChips("subjects", subjects)
          )}
        </div>

        <Divider />

        {/* Audiences */}
        <div>
          <Text fw={600} mb="xs" size="sm" style={{ textTransform: 'uppercase', color: 'var(--mantine-color-gray-7)' }}>
            👥 Audiences
          </Text>
          {audiences.length === 0 ? (
            <Text size="sm" c="dimmed" style={{ padding: '0.75rem', backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: '6px', textAlign: 'center' }}>
              No audience tags available yet
            </Text>
          ) : (
            renderChips("audiences", audiences)
          )}
        </div>

        <Divider />

        {/* Years */}
        <div>
          <Text fw={600} mb="xs" size="sm" style={{ textTransform: 'uppercase', color: 'var(--mantine-color-gray-7)' }}>
            📅 Date Range
          </Text>
          <Stack gap="sm">
            <Group grow gap="xs">
              <NumberInput
                min={1900}
                max={new Date().getFullYear()}
                value={filters.yearFrom ? parseInt(filters.yearFrom) : ""}
                placeholder="From year"
                onChange={(val) => setFilters((f) => ({ ...f, yearFrom: val ? String(val) : "" }))}
                aria-label="Year from"
                size="md"
                rightSection={
                  filters.yearFrom ? (
                    <ActionIcon 
                      size="xs" 
                      color="gray" 
                      radius="xl" 
                      variant="transparent"
                      onClick={() => setFilters((f) => ({ ...f, yearFrom: "" }))}
                      aria-label="Clear from year"
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  ) : null
                }
              />
              <NumberInput
                min={1900}
                max={new Date().getFullYear()}
                value={filters.yearTo ? parseInt(filters.yearTo) : ""}
                placeholder="To year"
                onChange={(val) => setFilters((f) => ({ ...f, yearTo: val ? String(val) : "" }))}
                aria-label="Year to"
                size="md"
                rightSection={
                  filters.yearTo ? (
                    <ActionIcon 
                      size="xs" 
                      color="gray" 
                      radius="xl" 
                      variant="transparent"
                      onClick={() => setFilters((f) => ({ ...f, yearTo: "" }))}
                      aria-label="Clear to year"
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  ) : null
                }
              />
            </Group>
            {filters.yearFrom || filters.yearTo ? (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setFilters((f) => ({ ...f, yearFrom: "", yearTo: "" }))}
              >
                Clear date range
              </Button>
            ) : null}
          </Stack>
        </div>

        <Divider />

        {/* Filter Instructions */}
        <div style={{
          backgroundColor: 'var(--mantine-color-blue-0)',
          border: '1px solid var(--mantine-color-blue-3)',
          borderRadius: '6px',
          padding: '0.75rem',
          marginTop: '-0.5rem'
        }}>
          <Text size="sm" c="blue" fw={500}>
            💡 <strong>How to filter:</strong> Click badges to <strong>include</strong> (✔) or <strong>exclude</strong> (✖)
          </Text>
        </div>

        {/* Apply Filters Button */}
        <Button
          onClick={() => setFilters((f) => ({ ...f }))}
          fullWidth
          color="blue"
          fw={600}
          size="md"
        >
          Apply Filters
        </Button>
      </Stack>
    </Card>
  );
}

SidebarFilters.propTypes = {
  filters: PropTypes.object.isRequired,
  setFilters: PropTypes.func.isRequired,
  subjects: PropTypes.array.isRequired,
  audiences: PropTypes.array.isRequired,
};
