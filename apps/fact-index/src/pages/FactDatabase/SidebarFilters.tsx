import React, {
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import PropTypes from "prop-types";
import {
  Stack,
  Group,
  Text,
  Badge,
  Button,
  NumberInput,
  Card,
  Divider,
  ActionIcon,
  useMantineTheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconX, IconFilter } from "@tabler/icons-react";
import { FaTag, FaUsers, FaCalendarAlt, FaCheck, FaTimes } from "react-icons/fa";
import type {
  FactFilters,
  ChipState,
  FilterKey,
  TagOption,
} from "./types";

// State cycling: neutral → include → exclude → neutral...
const nextChipState = (current: ChipState | undefined) => {
  if (current === "include") return "exclude";
  if (current === "exclude") return "neutral";
  return "include";
};

export interface SidebarFiltersProps {
  filters: FactFilters;
  setFilters: Dispatch<SetStateAction<FactFilters>>;
  subjects: TagOption[];
  audiences: TagOption[];
}

export default function SidebarFilters({
  filters,
  setFilters,
  subjects,
  audiences,
}: SidebarFiltersProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const cardBackground = isDark ? theme.colors.dark[7] : theme.white;
  const textColor = isDark ? theme.colors.gray[0] : theme.colors.dark[9];
  const helperColor = isDark ? theme.colors.gray[3] : theme.colors.dark[5];
  // Toggle chip state for subjects/audiences filters
  function handleChipToggle(key: FilterKey, value: string) {
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
  function renderChips(key: FilterKey, items: TagOption[]) {
    const chipStates = filters[key] || {};
    return (
      <Group gap="xs" wrap="wrap">
        {items.map((item) => {
          const state = chipStates[item.name] || "neutral";
          
          // Color based on state for visual feedback
          const badgeColor = state === "include" ? "blue" : state === "exclude" ? "red" : undefined;
          const badgeVariant = state === "neutral" ? "default" : "filled";
          
          const label = (
            <Group gap="xs" align="center">
              {state === "include" && <FaCheck aria-hidden="true" size={12} />}
              {state === "exclude" && <FaTimes aria-hidden="true" size={12} />}
              <span>{item.name}</span>
            </Group>
          );
          return (
            <Badge
              key={item.id || item.name}
              variant={badgeVariant}
              color={badgeColor}
              autoContrast
              onClick={() => handleChipToggle(key, item.name)}
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
              style={{ cursor: "pointer" }}
              onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
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
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{
        backgroundColor: cardBackground,
        color: textColor,
        transition: 'background-color 150ms ease',
      }}
    >
      <Stack gap="lg">
        <div>
          <Text fw={800} size="lg" component="div" c={textColor}>
            <Group gap="xs" align="center">
              <IconFilter aria-hidden="true" size={20} />
              <span>Filter Facts</span>
            </Group>
          </Text>
        </div>

        {/* Filter Instructions */}
        <div>
          <Group gap="xs" align="center">
            <Badge size="sm" color="blue" autoContrast>
              <FaCheck aria-hidden="true" size={12} /> Include
            </Badge>
            <Badge size="sm" color="red" autoContrast>
              <FaTimes aria-hidden="true" size={12} /> Exclude
            </Badge>
          </Group>
          <Text size="xs" mt="xs" c={helperColor}>
            Click badges to filter. Filters are applied automatically.
          </Text>
        </div>

        <Divider />

        {/* Subjects */}
        <div>
          <Text fw={600} mb="xs" size="sm" component="div" c={textColor}>
            <Group gap="xs" align="center">
              <FaTag aria-hidden="true" />
              <span>Subjects</span>
            </Group>
          </Text>
          {subjects.length === 0 ? (
            <Text size="sm" c={helperColor}>
              No subject tags available yet
            </Text>
          ) : (
            renderChips("subjects", subjects)
          )}
        </div>

        <Divider />

        {/* Audiences */}
        <div>
          <Text fw={600} mb="xs" size="sm" component="div" c={textColor}>
            <Group gap="xs" align="center">
              <FaUsers aria-hidden="true" />
              <span>Audiences</span>
            </Group>
          </Text>
          {audiences.length === 0 ? (
            <Text size="sm" c={helperColor}>
              No audience tags available yet
            </Text>
          ) : (
            renderChips("audiences", audiences)
          )}
        </div>

        <Divider  />

        {/* Years */}
        <div>
          <Text fw={600} mb="xs" size="sm" component="div" c={textColor}>
            <Group gap="xs" align="center">
              <FaCalendarAlt aria-hidden="true" />
              <span>Date Range</span>
            </Group>
          </Text>
          <Stack gap="sm">
            <Group grow gap="xs">
              <NumberInput
                min={1900}
                max={new Date().getFullYear()}
                value={filters.yearFrom ? parseInt(filters.yearFrom) : ""}
                placeholder="From year"
                onChange={(value) =>
                  setFilters((f) => ({ ...f, yearFrom: value ? String(value) : "" }))
                }
                aria-label="Year from"
                size="md"
                rightSection={
                  filters.yearFrom ? (
                    <ActionIcon
                      size="xs"
                      color="gray"
                      radius="xl"
                      variant="transparent"
                      onClick={() =>
                        setFilters((f) => ({ ...f, yearFrom: "" }))
                      }
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
                onChange={(value) =>
                  setFilters((f) => ({ ...f, yearTo: value ? String(value) : "" }))
                }
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
              variant="outline"
              color="dark"
              size="xs"
              onClick={() => setFilters((f) => ({ ...f, yearFrom: "", yearTo: "" }))}
            >
                Clear date range
              </Button>
            ) : null}
          </Stack>
        </div>

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
