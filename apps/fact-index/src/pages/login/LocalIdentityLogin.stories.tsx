/**
 * Storybook Stories for LocalIdentityLogin Component
 * Displays the local identity provider login form in various states
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, expect, userEvent } from 'storybook/test';
import LocalIdentityLogin from './LocalIdentityLogin';

const meta = {
  title: 'Pages/Local Identity Login',
  component: LocalIdentityLogin,
  tags: ['autodocs'],
} satisfies Meta<typeof LocalIdentityLogin>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default local identity login form
 */
export const Default: Story = {};

/**
 * Local identity login form with back button callback
 */
export const WithBackButton: Story = {
  args: {
    onBack: fn(),
  },
  play: async ({ canvas, args }) => {
    // Click the Back button and verify the callback was invoked
    const backButton = canvas.getByRole('button', { name: /back to login/i });
    await userEvent.click(backButton);
    await expect(args.onBack).toHaveBeenCalled();
  },
};
