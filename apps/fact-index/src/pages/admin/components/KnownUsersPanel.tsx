import React, { useMemo } from "react";
import type { UseFormReturnType } from "@mantine/form";
import { Alert, Badge, Button, Card, Group, Stack, Text, TextInput, Title } from "@mantine/core";

type MutationState = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  mutate: (values: { userId: string; username: string }) => void;
};

type KnownUserValues = {
  userId: string;
  username: string;
};

export default function KnownUsersPanel({
  knownUsers,
  canManageUsers,
  knownUserForm,
  upsertKnownUserMutation,
  formatError,
  onGoToUserPermissions,
  onGoToWhitelist,
}: {
  knownUsers: Array<{ userId: string; username: string | null; firstSeenAt: string; lastSeenAt: string }>;
  canManageUsers: boolean;
  knownUserForm: UseFormReturnType<KnownUserValues>;
  upsertKnownUserMutation: MutationState;
  formatError: (error: unknown) => string;
  onGoToUserPermissions?: (userId: string) => void;
  onGoToWhitelist?: (userId: string) => void;
}) {
  const knownUsersSorted = useMemo(
    () =>
      [...(knownUsers || [])].sort((a, b) =>
        String(a.username || a.userId).localeCompare(String(b.username || b.userId)),
      ),
    [knownUsers],
  );

  return (
    <Stack gap="md">
      <Card withBorder radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={2}>
              <Title order={5}>Known Users</Title>
              <Text size="sm" c="dimmed">
                Store usernames for reference. You can add users here even if they have never logged in.
              </Text>
            </Stack>
            <Badge color="blue" variant="light">
              {knownUsersSorted.length}
            </Badge>
          </Group>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              upsertKnownUserMutation.mutate(knownUserForm.values);
            }}
          >
            <Stack gap="sm">
              <Group grow align="end">
                <TextInput
                  label="User ID"
                  placeholder="123456789012345678"
                  required
                  disabled={!canManageUsers || upsertKnownUserMutation.isPending}
                  {...knownUserForm.getInputProps("userId")}
                />
                <TextInput
                  label="Username"
                  placeholder="someuser"
                  disabled={!canManageUsers || upsertKnownUserMutation.isPending}
                  {...knownUserForm.getInputProps("username")}
                />
              </Group>
              <Group>
                <Button
                  type="submit"
                  loading={upsertKnownUserMutation.isPending}
                  disabled={!canManageUsers || upsertKnownUserMutation.isPending}
                >
                  Save user
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={() => knownUserForm.reset()}
                  disabled={upsertKnownUserMutation.isPending}
                >
                  Reset
                </Button>
              </Group>
              {upsertKnownUserMutation.isError && (
                <Text size="sm" c="red">
                  {formatError(upsertKnownUserMutation.error)}
                </Text>
              )}
              {!canManageUsers && (
                <Alert color="orange" variant="light" title="Read-only">
                  You do not have permission to edit known users.
                </Alert>
              )}
            </Stack>
          </form>

          {knownUsersSorted.length ? (
            <Stack gap="xs">
              {knownUsersSorted.map((u) => (
                <Card key={u.userId} withBorder radius="md" p="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600}>{u.username || "(unknown)"}</Text>
                      <Text size="sm" c="dimmed">
                        {u.userId}
                      </Text>
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        variant="default"
                        onClick={() => knownUserForm.setValues({ userId: u.userId, username: u.username || "" })}
                      >
                        Edit
                      </Button>
                      {onGoToUserPermissions && (
                        <Button variant="light" onClick={() => onGoToUserPermissions(u.userId)}>
                          Permissions
                        </Button>
                      )}
                      {onGoToWhitelist && (
                        <Button variant="light" onClick={() => onGoToWhitelist(u.userId)}>
                          Whitelist
                        </Button>
                      )}
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : (
            <Alert color="gray" variant="light">
              No users recorded yet.
            </Alert>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
