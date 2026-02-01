import React from 'react';
import { NavLink } from 'react-router-dom';
import { Group, Anchor, Button, Avatar, Text, Box, useMantineTheme, useMantineColorScheme } from '@mantine/core';
import ThemeToggle from './ThemeToggle';
import { useAuthContext } from '../context/AuthContext';
import { FaChartBar, FaHome, FaFolderOpen, FaMagic, FaDiscord } from 'react-icons/fa';
import { useRBACContext } from '@impelsysinc/react-rbac';

function getDiscordAvatarUrl(
  id: string | undefined | null,
  avatar?: string | null,
  discriminator?: string | null
) {
  if (!id) return null;

  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=64`;
  }

  const parsed = Number.isFinite(Number(discriminator)) ? Number(discriminator) : 0;
  const fallbackIndex = parsed % 5;
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
}

function NavBar() {
  const { user, logout, loading, login, isAdmin } = useAuthContext();
  const { canAccess } = useRBACContext();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isAuthenticated = Boolean(user);
  const avatarSrc = user ? getDiscordAvatarUrl(user.id, user.avatar, user.discriminator) : null;
  
  const isDark = colorScheme === 'dark';
  const titleColor = isDark ? theme.white : theme.colors.dark[9];
  const navBgColor = isDark ? theme.colors.dark[8] : theme.colors.gray[0];
  const linkColor = isDark ? theme.colors.blue[4] : theme.colors.blue[6];

  return (
    <Box 
      component="nav" 
      aria-label="Main navigation" 
      px="md" 
      py="md"
      style={{
        backgroundColor: navBgColor,
        transition: 'background-color 150ms ease',
      }}
    >
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Text fw={700} size="lg" c={titleColor} component="div">
            <Group gap="xs" align="center">
              <FaChartBar aria-hidden="true" />
              <span>FACT INDEX</span>
            </Group>
          </Text>
          <Group gap="lg">
            <Anchor component={NavLink} to="/" fw={500} c={linkColor}>
              <Group gap="xs" align="center">
                <FaHome aria-hidden="true" />
                <span>Home</span>
              </Group>
            </Anchor>
            <Anchor component={NavLink} to="/facts" fw={500} c={linkColor}>
              <Group gap="xs" align="center">
                <FaFolderOpen aria-hidden="true" />
                <span>Database</span>
              </Group>
            </Anchor>
            {isAuthenticated && (Boolean(isAdmin) || canAccess({ resource: "admin.magiclink", action: "create" })) && (
              <Anchor component={NavLink} to="/admin" fw={500} c={linkColor}>
                <Group gap="xs" align="center">
                  <FaMagic aria-hidden="true" />
                  <span>Admin</span>
                </Group>
              </Anchor>
            )}
          </Group>
        </Group>

        <Group gap="md">
          <ThemeToggle />
          {loading ? (
            <Text size="sm" c="dimmed">Loading…</Text>
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
            <Button onClick={() => login()} variant="filled" color="indigo" size="sm" leftSection={<FaDiscord aria-hidden="true" size={16} />}>
              Login with Discord
            </Button>
          )}
        </Group>
      </Group>
    </Box>
  );
}

export default NavBar;
