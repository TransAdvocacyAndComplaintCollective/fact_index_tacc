import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet } from "../../utils/apiClient";
import { Container, Card, Group, Button, Title, Text, Badge, Stack, Alert } from "@mantine/core";
import { IconArrowLeft, IconEdit } from "@tabler/icons-react";
import * as styles from "./FactDetail.module.scss";

export default function FactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fact, setFact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet(`/api/facts/facts/${id}`)
      .then(setFact)
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Container size="sm" py="xl">
        <Alert title="Loading..." color="blue">Loading fact...</Alert>
      </Container>
    );
  }
  if (!fact) {
    return (
      <Container size="sm" py="xl">
        <Alert title="Not found" color="red">This fact could not be found.</Alert>
      </Container>
    );
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        {/* Navigation */}
        <Group justify="space-between">
          <Button
            leftSection={<IconArrowLeft size={16} />}
            variant="subtle"
            onClick={() => navigate("/facts")}
          >
            Back to Fact List
          </Button>
          <Button
            leftSection={<IconEdit size={16} />}
            onClick={() => navigate(`/facts/${fact.id}/edit`)}
          >
            Edit
          </Button>
        </Group>

        {/* Fact Card */}
        <Card withBorder shadow="sm" p="lg" radius="md">
          <Stack gap="md">
            <Title order={2}>{fact.fact_text}</Title>

            {/* Source */}
            {fact.source && (
              <div>
                <Text fw={500} size="sm">Source</Text>
                <Text
                  component="a"
                  href={fact.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  c="blue"
                >
                  {fact.source}
                </Text>
              </div>
            )}

            {/* Metadata Grid */}
            <Group grow>
              <div>
                <Text fw={500} size="sm">Added by</Text>
                <Text>{fact.user || "Unknown"}</Text>
              </div>
              <div>
                <Text fw={500} size="sm">Date</Text>
                <Text>{(fact.timestamp || "").slice(0, 10)}</Text>
              </div>
            </Group>

            {/* Subjects */}
            {Array.isArray(fact.subjects) && fact.subjects.length > 0 && (
              <div>
                <Text fw={500} size="sm" mb="xs">Subjects</Text>
                <Group gap="xs">
                  {fact.subjects.map((subject) => (
                    <Badge key={subject} color="blue" variant="light">
                      {subject}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}

            {/* Target Audiences */}
            {Array.isArray(fact.audiences) && fact.audiences.length > 0 && (
              <div>
                <Text fw={500} size="sm" mb="xs">Target Audiences</Text>
                <Group gap="xs">
                  {fact.audiences.map((audience) => (
                    <Badge key={audience} color="green" variant="light">
                      {audience}
                    </Badge>
                  ))}
                </Group>
              </div>
            )}

            {/* Type */}
            {fact.type && (
              <div>
                <Text fw={500} size="sm">Type</Text>
                <Badge variant="outline">{fact.type}</Badge>
              </div>
            )}

            {/* Context */}
            {fact.context && (
              <div>
                <Text fw={500} size="sm">Context</Text>
                <Text style={{ whiteSpace: "pre-wrap" }}>{fact.context}</Text>
              </div>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
