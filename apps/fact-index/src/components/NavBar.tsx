import React from 'react';
import { NavLink } from 'react-router-dom';
import { Group, Anchor, Button, Text, Box, useMantineTheme, useMantineColorScheme } from '@mantine/core';
import ThemeToggle from './ThemeToggle';
import { useAuthContext } from '../context/AuthContext';
import { FaChartBar, FaHome, FaFolderOpen, FaDiscord, FaDatabase } from 'react-icons/fa';
import { useRBACContext } from '@impelsysinc/react-rbac';
import { safeCanAccess } from '../utils/safeCanAccess';

function NavBar() {
  const { user, logout, loading, isAdmin, authenticated } = useAuthContext();
  const { canAccess } = useRBACContext();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isAuthenticated = Boolean(authenticated);
  const granted = Array.isArray(user?.permissions) ? user!.permissions : [];
  const canSeeAdmin =
    Boolean(isAdmin) ||
    granted.includes("superuser") ||
    granted.includes("admin:read") ||
    granted.includes("admin:write") ||
    safeCanAccess(canAccess, "admin:read") ||
    safeCanAccess(canAccess, "admin:write") ||
    false;
  
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
            <Anchor component={NavLink} to="/data-portal" fw={500} c={linkColor}>
              <Group gap="xs" align="center">
                <FaDatabase aria-hidden="true" />
                <span>Data Portal</span>
              </Group>
            </Anchor>
            {isAuthenticated && canSeeAdmin && (
              <Anchor component={NavLink} to="/admin" fw={500} c={linkColor}>
                <Group gap="xs" align="center">
                  <FaDiscord aria-hidden="true" />
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
              <div>
                <Text fw={500} size="sm">{user?.username}</Text>
                <Text size="xs" c="dimmed">Logged in</Text>
              </div>
              <Button variant="light" color="red" size="xs" onClick={logout}>
                Logout
              </Button>
            </Group>
          ) : (
            <Button
              onClick={() => {
                window.location.href = '/login/';
              }}
              variant="filled"
              color="indigo"
              size="sm"
            >
              Login
            </Button>
          )}
        </Group>
      </Group>
    </Box>
  );
}

export default NavBar;
