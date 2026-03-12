import React from "react";
import { Container, Title, Text, Card, Stack } from "@mantine/core";

export default function DataPortal() {
  return (
    <Container size="md" py="xl">
      <Stack gap="md">
        <Title order={1}>Data Portal</Title>
        <Card withBorder radius="md" p="lg">
          <Stack gap="xs">
            <Text fw={600}>Coming soon</Text>
            <Text c="dimmed">
              This is a placeholder page for the Data Portal. We’ll add datasets, dashboards, and
              downloads here.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}

