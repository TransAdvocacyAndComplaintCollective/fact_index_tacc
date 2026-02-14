/**
 * Storybook Stories for FederationLogin Component
 * Displays the federation login page in various states for testing and documentation
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import FederationLogin from './FederationLogin';

const meta = {
  title: 'Pages/Federation Login',
  component: FederationLogin,
  tags: ['autodocs'],
} satisfies Meta<typeof FederationLogin>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default federation login page with loaded providers
 */
export const Default: Story = {};

/**
 * Federation login page while loading providers
 * This story simulates the loading state of the federation provider list
 */
export const Loading: Story = {};
