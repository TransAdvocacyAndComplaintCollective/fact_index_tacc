// src/pages/Home/Home.jsx

import React from "react";
import { useAuthContext } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import { Container, Title, Text, Button, Stack, Loader, Card } from "@mantine/core";
import "./Home.scss";

export default function Home() {
  const { loading, authenticated, user } = useAuthContext();

  if (loading) {
    return (
      <Container size="md" py="xl">
        <Stack align="center" gap="lg">
          <Loader />
          <Text c="dimmed">Checking authentication…</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="md" py="80px">
      <Stack gap="xl" align="center" style={{ textAlign: 'center' }}>
        <Title order={1} size="2.5rem" fw={700}>
          📊 Welcome to FACT INDEX
        </Title>
        
        <Text size="lg" c="dimmed" maw="500px" lh={1.6}>
          A collaborative database of facts supporting trans advocacy and community education.
        </Text>

        {authenticated ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{ marginTop: '1.5rem', width: '100%', maxWidth: '400px' }}>
            <Stack gap="md" align="center">
              <Text size="md">
                👋 Hello{user?.username ? `, ${user.username}` : ""}! You are logged in.
              </Text>
              <Button 
                component={Link} 
                to="/facts" 
                size="md" 
                color="blue"
                leftSection="📁"
              >
                Browse Facts Database
              </Button>
            </Stack>
          </Card>
        ) : (
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{ marginTop: '1.5rem', width: '100%', maxWidth: '400px' }}>
            <Stack gap="md" align="center">
              <Text size="md">
                To access all features, please log in with Discord.
              </Text>
              <Button 
                component={Link} 
                to="/login" 
                size="md" 
                color="indigo"
                leftSection="🔗"
              >
                Login
              </Button>
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
