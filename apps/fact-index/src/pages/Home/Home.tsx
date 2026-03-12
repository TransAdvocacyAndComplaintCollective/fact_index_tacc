// src/pages/Home/Home.jsx

import React from "react";
import { useAuthContext } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import {
  Box,
  Container,
  Title,
  Text,
  Button,
  Stack,
  Loader,
  Card,
  Group,
  useMantineTheme,
  useMantineColorScheme,
} from "@mantine/core";
import { FaChartBar, FaHandPaper, FaFolderOpen } from "react-icons/fa";
import { IconBrandDiscord } from "@tabler/icons-react";

export default function Home() {
  const { loading, authenticated, user } = useAuthContext();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  // Use Mantine color scheme from context; avoid reading document directly
  const isDark = (colorScheme ?? "dark") === "dark";
  const headingColor = isDark ? theme.colors.gray[0] : theme.colors.dark[9];
  const bodyColor = isDark ? theme.colors.gray[1] : theme.colors.dark[9];
  const pageBackground =
    isDark ? theme.colors.dark[8] : theme.colors.gray[1];
  const panelBackground =
    isDark ? theme.colors.dark[6] : theme.white;
  if (loading) {
    return (
      <Box
        style={{
          backgroundColor: pageBackground,
          minHeight: "100vh",
          paddingBlock: theme.spacing.xl,
          transition: 'background-color 150ms ease',
        }}
      >
        <Container size="md" py="xl">
          <Stack align="center" gap="lg">
            <Loader />
            <Text c={bodyColor}>Checking authentication…</Text>
          </Stack>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      style={{
        backgroundColor: pageBackground,
        minHeight: "100vh",
        paddingBlock: theme.spacing.xl,
        color: isDark ? theme.colors.gray[0] : theme.colors.dark[9],
        transition: 'background-color 150ms ease',
      }}
    >
      <Container size="md">
        <Stack gap="xl" align="center">
            <Title order={1} size="2.5rem" fw={700} style={{ color: headingColor }}>
              <Group gap="xs" align="center">
                <FaChartBar aria-hidden="true" />
                <span>Welcome to FACT INDEX</span>
              </Group>
            </Title>

          <Text size="lg" maw={500} lh={1.6} style={{ color: bodyColor }}>
            A collaborative database of facts supporting trans advocacy and community education.
          </Text>

          {authenticated ? (
            <Card
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              style={{
                backgroundColor: panelBackground,
                transition: 'background-color 150ms ease',
              }}
            >
              <Stack gap="md" align="center">
                <Text
                  component="div"
                  size="md"
                  style={{ color: bodyColor }}
                >
                  <Group gap="xs" align="center">
                    <FaHandPaper aria-hidden="true" />
                    <span>
                      Hello{user?.username ? `, ${user.username}` : ""}! You are logged in.
                    </span>
                  </Group>
                </Text>
                <Button
                  component={Link}
                  to="/facts"
                  size="md"
                  color="blue"
                  leftSection={<FaFolderOpen aria-hidden="true" size={16} />}
                >
                  Browse Facts Database
                </Button>
              </Stack>
            </Card>
          ) : (
            <Card
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              style={{
                backgroundColor: panelBackground,
                transition: 'background-color 150ms ease',
              }}
            >
              <Stack gap="md" align="center">
                <Text
                  size="md"
                  style={{ color: bodyColor }}
                >
                  To access all features, please log in with Discord.
                </Text>
                <Button
                  component={Link}
                  to="/login"
                  size="md"
                  color="indigo"
                  leftSection={<IconBrandDiscord aria-hidden="true" size={16} />}
                >
                  Login
                </Button>
              </Stack>
            </Card>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
