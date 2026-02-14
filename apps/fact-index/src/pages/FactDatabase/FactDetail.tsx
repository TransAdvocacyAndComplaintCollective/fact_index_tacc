import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet } from "../../utils/apiClient";
import {
  Box,
  Container,
  Card,
  Group,
  Button,
  Title,
  Text,
  Badge,
  Stack,
  Alert,
  useMantineTheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconArrowLeft, IconEdit } from "@tabler/icons-react";
import type { FactRecord } from "./types";

export interface FactDetailViewProps {
  fact: FactRecord;
  onBack?: () => void;
  onEdit?: () => void;
}

export function FactDetailView({ fact, onBack, onEdit }: FactDetailViewProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const cardBackground =
    isDark ? theme.colors.dark[6] : theme.white;
  const detailTextColor =
    isDark ? theme.colors.gray[1] : theme.colors.dark[8];
  const pageBackground =
    isDark ? theme.colors.dark[8] : theme.colors.gray[1];
  const metadataColor =
    isDark ? "gray.3" : "dark.5";
  const headingColor =
    isDark ? theme.colors.gray[0] : theme.colors.dark[9];
  return (
    <Box
      style={{
        backgroundColor: pageBackground,
        minHeight: "100vh",
        paddingBlock: theme.spacing.xl,
        transition: 'background-color 150ms ease',
      }}
    >
      <Container size="sm" py="xl">
        <Stack gap="md">
          {/* Navigation */}
          <Group justify="space-between">
            <Button
              leftSection={<IconArrowLeft size={16} />}
              variant="subtle"
              onClick={onBack}
            >
              Back to Fact List
            </Button>
            <Button leftSection={<IconEdit size={16} />} onClick={onEdit}>
              Edit
            </Button>
          </Group>

          {/* Fact Card */}
          <Card
            withBorder
            shadow="sm"
            p="lg"
            radius="md"
            style={{
              backgroundColor: cardBackground,
              color: headingColor,
              transition: 'background-color 150ms ease',
            }}
          >
            <Stack gap="md">
              <Title order={2} c={headingColor}>
                {fact.fact_text}
              </Title>

              {/* Source */}
              {fact.source && (
                <div>
                  <Text fw={500} size="sm">
                    Source
                  </Text>
                  <Text
                    component="a"
                    href={fact.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {fact.source}
                  </Text>
                </div>
              )}

              {/* Metadata Grid */}
              <Group grow>
                <div>
                  <Text fw={500} size="sm">
                    Added by
                  </Text>
                  <Text c={metadataColor}>{fact.user || "Unknown"}</Text>
                </div>
                <div>
                  <Text fw={500} size="sm">
                    Date
                  </Text>
                  <Text c={metadataColor}>{(fact.timestamp || "").slice(0, 10)}</Text>
                </div>
              </Group>

              {/* Subjects */}
              {Array.isArray(fact.subjects) && fact.subjects.length > 0 && (
                <div>
                  <Text fw={500} size="sm" mb="xs" c={detailTextColor}>
                    Subjects
                  </Text>
                  <Group gap="xs">
                    {fact.subjects?.map((subject) => (
                      <Badge key={subject} autoContrast>{subject}</Badge>
                    ))}
                  </Group>
                </div>
              )}

              {/* Target Audiences */}
              {Array.isArray(fact.audiences) && fact.audiences.length > 0 && (
                <div>
              <Text fw={500} size="sm" mb="xs" c={detailTextColor}>
                Target Audiences
              </Text>
                  <Group gap="xs">
                    {fact.audiences?.map((audience) => (
                      <Badge key={audience} autoContrast>{audience}</Badge>
                    ))}
                  </Group>
                </div>
              )}

              {/* Type */}
              {fact.type && (
                <div>
                <Text fw={500} size="sm" c={detailTextColor}>
                  Type
                </Text>
                  <Badge autoContrast>{fact.type}</Badge>
                </div>
              )}

              {/* Context */}
              {fact.context && (
                <div>
                  <Text fw={500} size="sm" c={detailTextColor}>
                    Context
                  </Text>
                  <Text c={metadataColor}>{fact.context}</Text>
                </div>
              )}
            </Stack>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}

export default function FactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const pageBackground = isDark ? theme.colors.dark[8] : theme.colors.gray[0];
  const [fact, setFact] = useState<FactRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<FactRecord>(`/api/facts/facts/${id}`)
      .then((data) => setFact(data))
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Box style={{ backgroundColor: pageBackground, minHeight: '100vh', paddingBlock: theme.spacing.xl, transition: 'background-color 150ms ease' }}>
        <Container size="sm" py="xl">
          <Alert title="Loading..." color="blue">Loading fact...</Alert>
        </Container>
      </Box>
    );
  }
  if (!fact) {
    return (
      <Box style={{ backgroundColor: pageBackground, minHeight: '100vh', paddingBlock: theme.spacing.xl, transition: 'background-color 150ms ease' }}>
        <Container size="sm" py="xl">
          <Alert title="Not found" color="red">This fact could not be found.</Alert>
        </Container>
      </Box>
    );
  }

  return (
    <FactDetailView
      fact={fact}
      onBack={() => navigate("/facts")}
      onEdit={() => navigate(`/facts/${fact.id}/edit`)}
    />
  );
}
