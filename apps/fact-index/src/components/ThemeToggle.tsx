import React from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { useAppColorScheme } from '../lib/appColorScheme';
import { FaSun, FaMoon } from 'react-icons/fa';

export default function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useAppColorScheme();
  const dark = colorScheme === 'dark';

  return (
    <Tooltip label={dark ? 'Switch to light theme' : 'Switch to dark theme'} withArrow>
      <ActionIcon
        variant="outline"
        color={dark ? 'yellow' : 'blue'}
        onClick={() => toggleColorScheme()}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {dark ? <FaSun /> : <FaMoon />}
      </ActionIcon>
    </Tooltip>
  );
}
