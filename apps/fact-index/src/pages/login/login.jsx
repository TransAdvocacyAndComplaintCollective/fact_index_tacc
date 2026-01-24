import React, { useEffect, useState } from "react";
import { Container, Paper, Title, Alert, Button, Group, Text, Collapse, List } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import "./login.scss";

const providers = [
  {
    name: "Discord",
    url: "/auth/discord",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden focusable="false">
        {/* Discord icon SVG */}
        <path
          fill="#5865F2"
          d="M22,24h-4v-3.5c0-1.5,0-3-1-3s-1.4,1.4-1.4,1.4S13,17.1,11.4,16.5c-1.5,0.7-2.7,1.6-2.7,1.6S8,17.4,8,16c0-2.7,3-2.2,3-2.2s0.3-1.4,0.6-2.8C9.6,9.3,7,8.8,7,6.8c0-0.8,0.8-1.2,1.6-1.2c1.1,0,2.5,1.1,3.4,2c0.9-0.9,2.3-2,3.4-2C16.2,5.6,17,6,17,6.8c0,2-2.6,2.5-4.6,4.2c0.3,1.4,0.6,2.8,0.6,2.8S19,13.3,19,16c0,1.4-0.3,2.1-0.3,2.1s-1.2-0.9-2.7-1.6C15,17.1,14.4,18.5,14.4,18.5s-0.4-1.4-1.4-1.4s-1,2-1,3.5V24H2C0.9,24,0,23.1,0,22V2C0,0.9,0.9,0,2,0h20c1.1,0,2,0.9,2,2v20C24,23.1,23.1,24,22,24z"
        />
      </svg>
    ),
  },
  // Add new providers as you build them:
  // {
  //   name: "Bluesky",
  //   url: "/auth/bluesky",
  //   icon: <BlueskyIcon />
  // },
  // {
  //   name: "Facebook",
  //   url: "/auth/facebook",
  //   icon: <FacebookIcon />
  // }
];

export default function Login() {
  const [authAvailable, setAuthAvailable] = useState(true);
  const [errorReason, setErrorReason] = useState(null);
  const [reasonCode, setReasonCode] = useState(null);
  const [userMessage, setUserMessage] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/auth/available')
      .then(async (r) => {
        if (!mounted) return;
        try {
          const json = await r.json();
          setAuthAvailable(Boolean(json?.available) || r.ok);
        } catch {
          setAuthAvailable(r.ok);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setAuthAvailable(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const reason = qp.get('reason');
    const rcode = qp.get('reasonCode');
    const um = qp.get('userMessage');
    if (reason) setErrorReason(reason);
    if (rcode) setReasonCode(rcode);
    if (um) setUserMessage(um);
  }, []);

  const helpToggle = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setShowHelp((s) => !s);
  };

  return (
    <Container size="xs" pt="xl">
      <Paper withBorder shadow="sm" p="md" radius="md">
        <Title order={3} mb="md">Login required</Title>

        {!authAvailable ? (
          <Alert icon={<IconAlertCircle size={16} />} title="Login unavailable" color="red" mb="md">
            Login currently unavailable. Please try again later.
          </Alert>
        ) : (
          <>
            {(userMessage || errorReason) && (
              <Alert icon={<IconAlertCircle size={16} />} title="Authentication failed" color="orange" mb="sm">
                {decodeURIComponent(userMessage || errorReason)}
              </Alert>
            )}

            {(userMessage || reasonCode) && (
              <Button variant="subtle" onClick={helpToggle} mb="sm">
                How to join the Discord server or contact an admin
              </Button>
            )}

            <Collapse in={showHelp}>
              <Paper withBorder p="sm" radius="sm" mb="md">
                <Text mb="xs">
                  If you see a message about not being in the required server or missing a role:
                </Text>
                <List withPadding type="ordered">
                  <List.Item>Confirm you're logged into the correct Discord account (the one you used to sign up).</List.Item>
                  <List.Item>Ask the server owner or an administrator to invite your account to the server.</List.Item>
                  <List.Item>If you're in the server but missing a role, request that an admin grant the required role.</List.Item>
                </List>
                <Text mt="sm">
                  If you don't know who to contact, reach out to the project administrator and provide the message you saw here so they can help:
                  <Text span fw={600}> {decodeURIComponent(userMessage || errorReason || '')}</Text>
                </Text>
                <Group mt="sm">
                  <Button variant="light" onClick={() => (window.location.href = '/')}>Back to home</Button>
                </Group>
              </Paper>
            </Collapse>

            <Group grow>
              {providers.map((provider) => (
                <Button key={provider.name} leftSection={provider.icon} onClick={() => (window.location.href = provider.url)}>
                  Login with {provider.name}
                </Button>
              ))}
            </Group>
          </>
        )}
      </Paper>
    </Container>
  );
}
