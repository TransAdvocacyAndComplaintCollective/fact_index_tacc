// mantineTheme.ts
import type { MantineTheme, MantineThemeOverride } from '@mantine/core';

export const mantineTheme: MantineThemeOverride = {
  primaryColor: 'blue',
  autoContrast: true,

  colors: {
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5c5f66',
      '#373A40',
      '#2C2E33',
      '#25262b',
      '#1A1B1E',
      '#141517',
      '#101113',
    ],
  },

  components: {
    Button: {
      defaultProps: {
        radius: 'sm',
        autoContrast: true,
      },
      styles: (theme: MantineTheme) => ({
        root: {
          transition: 'all 150ms ease',
          borderRadius: theme.radius.sm,

          // Light mode: use blue-7 (darker) for better contrast; Dark mode: use blue-4 (lighter) 
          backgroundColor: 'light-dark(var(--mantine-color-blue-7), var(--mantine-color-blue-4))',
          color: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-9))',

          '&[dataVariant="subtle"]': {
            backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))',
            color: 'light-dark(var(--mantine-color-dark-9), var(--mantine-color-gray-0))',
          },

          '&[dataVariant="light"]': {
            backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-4))',
            color: 'light-dark(var(--mantine-color-dark-9), var(--mantine-color-gray-0))',
          },

          '&[dataVariant="default"]': {
            backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))',
            color: 'light-dark(var(--mantine-color-dark-9), var(--mantine-color-gray-0))',
          },
        },
      }),
    },

    Card: {
      defaultProps: {
        padding: 'lg',
        radius: 'md',
        shadow: 'sm',
      },
      styles: (theme: MantineTheme) => ({
        root: {
          borderRadius: theme.radius.md,
          transition: 'transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease',

          backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
          border: '1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))',
          color: 'var(--mantine-color-text)',

          '&:hover': {
            boxShadow: theme.shadows.md,
          },
        },
      }),
    },

    Badge: {
      defaultProps: {
        autoContrast: true,
      },
    },

    Anchor: {
      styles: () => ({
        root: {
          color: 'light-dark(var(--mantine-color-blue-8), var(--mantine-color-blue-2)) !important',
        },
      }),
    },

    Alert: {
      styles: () => ({
        label: {
          color: 'light-dark(var(--mantine-color-orange-9), var(--mantine-color-white)) !important',
          fontWeight: 700,
        },
        root: {
          '&[dataVariant="light"][dataColor="orange"]': {
            backgroundColor: 'light-dark(var(--mantine-color-orange-1), var(--mantine-color-dark-6))',
            // keep text readable; label is forced above
            color: 'light-dark(var(--mantine-color-orange-9), var(--mantine-color-text))',
          },
        },
      }),
    },

    Tooltip: {
      defaultProps: {
        withArrow: true,
      },
    },
  },
};

export default mantineTheme;
