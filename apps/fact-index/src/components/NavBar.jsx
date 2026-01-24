import React from 'react';
import { NavLink } from 'react-router-dom';
import { Group, Anchor, Button, Avatar, Text, Box } from '@mantine/core';
import { useAuthContext } from '../context/AuthContext';

function getDiscordAvatarUrl(id, avatar, discriminator) {
  if (!id) return null;
  if (avatar) {
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
  }
  if (!discriminator) return null;
  const parsed = Number.isFinite(Number(discriminator)) ? Number(discriminator) : 0;
  const fallbackIndex = parsed % 5;
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
}

function NavBar() {
  const { user, logout, loading, login } = useAuthContext();
  const isAuthenticated = Boolean(user);
  const avatarSrc = user ? getDiscordAvatarUrl(user.id, user.avatar, user.discriminator) : null;

  return (
    <Box component="nav" aria-label="Main navigation" px="md" py="md" style={{ 
      borderBottom: '2px solid var(--mantine-color-blue-6)', 
      backgroundColor: 'var(--mantine-color-dark-8)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    }}>
      <Group justify="space-between" align="center">
        <Group gap="xl">
          <Text fw={700} size="lg" style={{ color: 'var(--mantine-color-blue-4)' }}>📊 FACT INDEX</Text>
          <Group gap="lg">
            <Anchor component={NavLink} to="/" fw={500} c="blue.4" style={{ 
              cursor: 'pointer', 
              transition: 'color 0.2s',
              textDecoration: 'none'
            }} 
            onMouseEnter={(e) => e.target.style.color = 'var(--mantine-color-blue-2)'} 
            onMouseLeave={(e) => e.target.style.color = 'var(--mantine-color-blue-4)'}>
              🏠 Home
            </Anchor>
            <Anchor component={NavLink} to="/facts" fw={500} c="blue.4" style={{ 
              cursor: 'pointer', 
              transition: 'color 0.2s',
              textDecoration: 'none'
            }} 
            onMouseEnter={(e) => e.target.style.color = 'var(--mantine-color-blue-2)'} 
            onMouseLeave={(e) => e.target.style.color = 'var(--mantine-color-blue-4)'}>
              📁 Database
            </Anchor>
          </Group>
        </Group>

        <Group gap="md">
          {loading ? (
            <Text c="dimmed" size="sm">Loading…</Text>
          ) : isAuthenticated ? (
            <Group gap="xs" align="center">
              <Avatar
                src={avatarSrc}
                alt={user?.username ? `${user.username} avatar` : "user avatar"}
                radius="xl"
                size={32}
              >
                {user?.username?.[0]}
              </Avatar>
              <div>
                <Text fw={500} size="sm">{user?.username}</Text>
                <Text size="xs" c="dimmed">Logged in</Text>
              </div>
              <Button variant="light" color="red" size="xs" onClick={logout}>
                Logout
              </Button>
            </Group>
          ) : (
            <Button onClick={() => login('/auth/discord')} variant="filled" color="indigo" size="sm">
              🔗 Login with Discord
            </Button>
          )}
        </Group>
      </Group>
    </Box>
  );
}

export default NavBar;
