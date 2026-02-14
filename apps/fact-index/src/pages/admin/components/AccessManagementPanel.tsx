import React from "react";
import { UseFormReturnType } from "@mantine/form";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { GuildEntry, RoleEntry } from "../adminTypes";

type MutationState = {
  isPending: boolean;
  isError: boolean;
  isSuccess?: boolean;
  error: unknown;
};

type DiscordAccessValues = {
  mappingId: string;
  discordIdType: string;
  discordId: string;
  mappingMode: string;
  localGrant: string;
  localRoleId: string;
};

type LocalRoleValues = {
  roleId: string;
  permissions: string[];
};

type AddLocalRoleValues = {
  name: string;
};

type OpenIdAccessValues = {
  mappingId: string;
  idType: string;
  domain: string;
  numHops: number;
  userId: string;
  mappingMode: string;
  localGrant: string;
  localRoleId: string;
};

type AccessManagementPanelProps = {
  guilds: Record<string, GuildEntry>;
  roles: Record<string, RoleEntry>;
  canReadGuilds: boolean;
  canReadRoles: boolean;
  canManageRoles: boolean;
  localRoleCards: React.ReactNode[];
  discordMappingCards: React.ReactNode[];
  openidMappingCards: React.ReactNode[];
  localRoleSelectOptions: Array<{ value: string; label: string }>;
  localPermissionOptions: Array<{ value: string; label: string }>;
  trustMarkSelectOptions: Array<{ value: string; label: string }>;
  addRoleModalOpen: boolean;
  setAddRoleModalOpen: (open: boolean) => void;
  addLocalRoleForm: UseFormReturnType<AddLocalRoleValues>;
  addLocalRoleMutation: MutationState;
  handleAddLocalRoleSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  discordAccessForm: UseFormReturnType<DiscordAccessValues>;
  saveDiscordAccessMutation: MutationState;
  handleDiscordAccessSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  localRoleForm: UseFormReturnType<LocalRoleValues>;
  saveLocalRoleMutation: MutationState;
  handleLocalRoleSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  loadLocalRoleForEdit: (roleId: string) => void;
  openidAccessForm: UseFormReturnType<OpenIdAccessValues>;
  saveOpenIdAccessMutation: MutationState;
  handleOpenIdAccessSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  formatError: (error: unknown) => string;
};

export default function AccessManagementPanel({
  guilds,
  roles,
  canReadGuilds,
  canReadRoles,
  canManageRoles,
  localRoleCards,
  discordMappingCards,
  openidMappingCards,
  localRoleSelectOptions,
  localPermissionOptions,
  trustMarkSelectOptions,
  addRoleModalOpen,
  setAddRoleModalOpen,
  addLocalRoleForm,
  addLocalRoleMutation,
  handleAddLocalRoleSubmit,
  discordAccessForm,
  saveDiscordAccessMutation,
  handleDiscordAccessSubmit,
  localRoleForm,
  saveLocalRoleMutation,
  handleLocalRoleSubmit,
  loadLocalRoleForEdit,
  openidAccessForm,
  saveOpenIdAccessMutation,
  handleOpenIdAccessSubmit,
  formatError,
}: AccessManagementPanelProps) {
  return (
    <Tabs.Panel value="access-management" pt="md">
      <Stack gap="md">
        <Card withBorder radius="md">
          <Group gap="xs" wrap="wrap">
            <Badge color="blue" variant="light">
              {Object.keys(guilds).length} guild rules
            </Badge>
            <Badge color="blue" variant="light">
              {Object.keys(roles).length} role definitions
            </Badge>
          </Group>
        </Card>

        <Tabs defaultValue="discord" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="discord">Discord</Tabs.Tab>
            <Tabs.Tab value="local-roles">Local Roles</Tabs.Tab>
            <Tabs.Tab value="openid">OpenID</Tabs.Tab>
          </Tabs.List>
          <Modal
            opened={addRoleModalOpen}
            onClose={() => {
              if (addLocalRoleMutation.isPending) return;
              setAddRoleModalOpen(false);
            }}
            title="Add Local Role"
            centered
          >
            <form onSubmit={handleAddLocalRoleSubmit}>
              <Stack gap="sm">
                <TextInput
                  label="Role Name"
                  placeholder="Analyst"
                  required
                  {...addLocalRoleForm.getInputProps("name")}
                />
                <Group justify="flex-end">
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => setAddRoleModalOpen(false)}
                    disabled={addLocalRoleMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={addLocalRoleMutation.isPending}>
                    Add Role
                  </Button>
                </Group>
                {addLocalRoleMutation.isError && (
                  <Text size="sm" c="red">
                    {formatError(addLocalRoleMutation.error)}
                  </Text>
                )}
              </Stack>
            </form>
          </Modal>

          <Tabs.Panel value="discord" pt="md">
            <Accordion defaultValue="access-rules" variant="separated" radius="md">
              <Accordion.Item value="access-rules">
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600}>Access Rules &amp; Role Catalog</Text>
                    <Group gap="xs">
                      <Badge color="blue">{Object.keys(guilds).length} guilds</Badge>
                      <Badge color="blue">{Object.keys(roles).length} roles</Badge>
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    {!canReadGuilds ? (
                      <Alert color="red" title="Access denied">
                        You do not have permission to view guild configuration.
                      </Alert>
                    ) : (
                      <>
                        <Card withBorder radius="md">
                          <Stack gap="md">
                            <Title order={5}>Discord Identity Mapping</Title>
                            <form onSubmit={handleDiscordAccessSubmit}>
                              <Stack gap="sm">
                                <Select
                                  label="ID Type"
                                  data={[
                                    { value: "user", label: "Discord User ID" },
                                    { value: "role", label: "Discord Role ID" },
                                    { value: "guild", label: "Discord Guild ID" },
                                  ]}
                                  value={discordAccessForm.values.discordIdType || "user"}
                                  onChange={(value) => discordAccessForm.setFieldValue("discordIdType", value || "user")}
                                  allowDeselect={false}
                                />
                                <TextInput
                                  label="Discord ID"
                                  placeholder={
                                    discordAccessForm.values.discordIdType === "guild"
                                      ? "Enter Discord guild ID"
                                      : discordAccessForm.values.discordIdType === "role"
                                      ? "Enter Discord role ID"
                                      : "Enter Discord user ID"
                                  }
                                  {...discordAccessForm.getInputProps("discordId")}
                                />
                                <Select
                                  label="Map To"
                                  data={[
                                    { value: "action", label: "Local Action" },
                                    { value: "role", label: "Local Role" },
                                  ]}
                                  value={discordAccessForm.values.mappingMode || "action"}
                                  onChange={(value) => discordAccessForm.setFieldValue("mappingMode", value || "action")}
                                  allowDeselect={false}
                                />
                                {discordAccessForm.values.mappingMode === "role" ? (
                                  <Select
                                    label="Local Role"
                                    placeholder="Select local role"
                                    data={localRoleSelectOptions}
                                    value={discordAccessForm.values.localRoleId || null}
                                    onChange={(value) => discordAccessForm.setFieldValue("localRoleId", value || "")}
                                    searchable
                                    nothingFoundMessage="No local roles found"
                                    allowDeselect={false}
                                    required
                                  />
                                ) : (
                                  <Select
                                    label="Local Action"
                                    placeholder="Select local action"
                                    data={localPermissionOptions}
                                    value={discordAccessForm.values.localGrant || null}
                                    onChange={(value) => discordAccessForm.setFieldValue("localGrant", value || "")}
                                    searchable
                                    nothingFoundMessage="No options found"
                                    allowDeselect={false}
                                    required
                                  />
                                )}
                                <Button
                                  type="submit"
                                  loading={saveDiscordAccessMutation.isPending}
                                  disabled={!canManageRoles || saveDiscordAccessMutation.isPending}
                                >
                                  {discordAccessForm.values.mappingId ? "Update Discord mapping" : "Save Discord mapping"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="default"
                                  onClick={() => discordAccessForm.reset()}
                                  disabled={saveDiscordAccessMutation.isPending}
                                >
                                  Reset
                                </Button>
                                {!canManageRoles && (
                                  <Text size="sm" color="orange">
                                    You need role write permission to save Discord mappings
                                  </Text>
                                )}
                                {saveDiscordAccessMutation.isError && (
                                  <Text size="sm" color="red">
                                    {formatError(saveDiscordAccessMutation.error)}
                                  </Text>
                                )}
                              </Stack>
                            </form>
                          </Stack>
                        </Card>

                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Title order={6}>Configured Discord Mappings</Title>
                            <Badge color="blue">{discordMappingCards.length}</Badge>
                          </Group>
                          {discordMappingCards.length > 0 ? (
                            <Stack gap="xs">{discordMappingCards}</Stack>
                          ) : (
                            <Alert color="gray" variant="light">
                              No Discord mappings found.
                            </Alert>
                          )}
                        </Stack>
                      </>
                    )}

                    <Text size="sm" c="dimmed">Local role definitions are listed in the Local Roles sub-tab.</Text>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Tabs.Panel>

          <Tabs.Panel value="local-roles" pt="md">
            <Card withBorder radius="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={4}>Local Roles</Title>
                  <Badge color="blue">{localRoleCards.length} roles</Badge>
                </Group>
                {!canReadRoles ? (
                  <Alert color="red" title="Access denied">
                    You do not have permission to view local roles.
                  </Alert>
                ) : (
                  <>
                    <Text size="sm" c="dimmed">
                      Map local roles to actions.
                    </Text>

                    <Card withBorder radius="md">
                      <Stack gap="sm">
                        <Title order={5}>Role Actions Mapping</Title>
                        <form onSubmit={handleLocalRoleSubmit}>
                          <Stack gap="sm">
                            <Group align="end" wrap="nowrap">
                              <Select
                                style={{ flex: 1 }}
                                label="Local Role"
                                placeholder="Select a local role"
                                data={localRoleSelectOptions}
                                searchable
                                allowDeselect={false}
                                required
                                value={localRoleForm.values.roleId || null}
                                onChange={(value) => {
                                  if (!value) return;
                                  loadLocalRoleForEdit(value);
                                }}
                              />
                              <Button
                                type="button"
                                variant="light"
                                onClick={() => setAddRoleModalOpen(true)}
                                loading={addLocalRoleMutation.isPending}
                                disabled={!canManageRoles || addLocalRoleMutation.isPending}
                              >
                                Add Local Role
                              </Button>
                            </Group>
                            <MultiSelect
                              label="Actions"
                              placeholder="Select one or more actions"
                              data={localPermissionOptions}
                              searchable
                              nothingFoundMessage="No actions found"
                              value={localRoleForm.values.permissions}
                              onChange={(value) => localRoleForm.setFieldValue("permissions", value)}
                              disabled={!localRoleForm.values.roleId}
                            />
                            <Group>
                              <Button
                                type="submit"
                                loading={saveLocalRoleMutation.isPending}
                                disabled={!canManageRoles || !localRoleForm.values.roleId || saveLocalRoleMutation.isPending}
                              >
                                Save Role Mapping
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                onClick={() => localRoleForm.reset()}
                                disabled={!localRoleForm.values.roleId || saveLocalRoleMutation.isPending}
                              >
                                Reset
                              </Button>
                            </Group>
                            {!canManageRoles && (
                              <Text size="sm" color="orange">
                                You need role write permission to update local role mappings.
                              </Text>
                            )}
                            {saveLocalRoleMutation.isError && (
                              <Text size="sm" color="red">
                                {formatError(saveLocalRoleMutation.error)}
                              </Text>
                            )}
                            {saveLocalRoleMutation.isSuccess && (
                              <Text size="sm" color="green">
                                Local role mapping saved.
                              </Text>
                            )}
                          </Stack>
                        </form>
                      </Stack>
                    </Card>

                    {localRoleCards.length > 0 ? (
                      <Stack gap="xs">{localRoleCards}</Stack>
                    ) : (
                      <Alert color="gray" variant="light">
                        No local roles found. Use Add Local Role to create one.
                      </Alert>
                    )}
                  </>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="openid" pt="md">
            <Stack gap="md">
              <Card withBorder radius="md">
                <Stack gap="sm">
                  <Title order={5}>OpenID Mapping</Title>
                  <form onSubmit={handleOpenIdAccessSubmit}>
                    <Stack gap="sm">
                      <Select
                        label="ID Type"
                        data={[
                          { value: "trust_mark", label: "Trust Mark" },
                          { value: "trust_anchor_trust_mark_issuer", label: "Trust Anchor - Trust Mark Issuer" },
                          { value: "provider_domain", label: "Provider Domain" },
                          { value: "trust_domain", label: "Trust Domain" },
                          { value: "issuer_domain_user_id", label: "Issuer Domain + User ID" },
                          { value: "anyone", label: "Anyone" },
                        ]}
                        value={openidAccessForm.values.idType}
                        onChange={(value) => openidAccessForm.setFieldValue("idType", value || "provider_domain")}
                        allowDeselect={false}
                      />
                      {(openidAccessForm.values.idType === "trust_mark" ||
                        openidAccessForm.values.idType === "trust_anchor_trust_mark_issuer") && (
                        <Select
                          label="Trust Mark"
                          placeholder="Select trust mark"
                          data={trustMarkSelectOptions}
                          value={openidAccessForm.values.domain || null}
                          onChange={(value) => openidAccessForm.setFieldValue("domain", value || "")}
                          searchable
                          nothingFoundMessage="No trust marks configured"
                          allowDeselect={false}
                          required
                        />
                      )}
                      {openidAccessForm.values.idType !== "anyone" &&
                        openidAccessForm.values.idType !== "trust_mark" &&
                        openidAccessForm.values.idType !== "trust_anchor_trust_mark_issuer" && (
                        <TextInput
                          label="Domain"
                          placeholder="issuer.example.org"
                          required
                          {...openidAccessForm.getInputProps("domain")}
                        />
                      )}
                      {(openidAccessForm.values.idType === "trust_domain" ||
                        openidAccessForm.values.idType === "issuer_domain_user_id") && (
                        <NumberInput
                          label="Num Hops"
                          min={0}
                          step={1}
                          clampBehavior="strict"
                          value={openidAccessForm.values.numHops}
                          onChange={(value) =>
                            openidAccessForm.setFieldValue("numHops", typeof value === "number" ? value : 0)
                          }
                        />
                      )}
                      {openidAccessForm.values.idType === "issuer_domain_user_id" && (
                        <TextInput
                          label="User ID"
                          placeholder="user-123"
                          required
                          {...openidAccessForm.getInputProps("userId")}
                        />
                      )}
                      <Select
                        label="Map To"
                        data={[
                          { value: "action", label: "Local Action" },
                          { value: "role", label: "Local Role" },
                        ]}
                        value={openidAccessForm.values.mappingMode || "action"}
                        onChange={(value) => openidAccessForm.setFieldValue("mappingMode", value || "action")}
                        allowDeselect={false}
                      />
                      {openidAccessForm.values.mappingMode === "role" ? (
                        <Select
                          label="Local Role"
                          placeholder="Select local role"
                          data={localRoleSelectOptions}
                          value={openidAccessForm.values.localRoleId || null}
                          onChange={(value) => openidAccessForm.setFieldValue("localRoleId", value || "")}
                          searchable
                          nothingFoundMessage="No local roles found"
                          allowDeselect={false}
                          required
                        />
                      ) : (
                        <Select
                          label="Local Action"
                          placeholder="Select local action"
                          data={localPermissionOptions}
                          value={openidAccessForm.values.localGrant || null}
                          onChange={(value) => openidAccessForm.setFieldValue("localGrant", value || "")}
                          searchable
                          nothingFoundMessage="No options found"
                          allowDeselect={false}
                          required
                        />
                      )}
                      <Button
                        type="submit"
                        loading={saveOpenIdAccessMutation.isPending}
                        disabled={!canManageRoles || saveOpenIdAccessMutation.isPending}
                      >
                        {openidAccessForm.values.mappingId ? "Update OpenID mapping" : "Save OpenID mapping"}
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => openidAccessForm.reset()}
                        disabled={saveOpenIdAccessMutation.isPending}
                      >
                        Reset
                      </Button>
                      {!canManageRoles && (
                        <Text size="sm" color="orange">
                          You need role write permission to save OpenID mappings
                        </Text>
                      )}
                      {saveOpenIdAccessMutation.isError && (
                        <Text size="sm" color="red">
                          {formatError(saveOpenIdAccessMutation.error)}
                        </Text>
                      )}
                    </Stack>
                  </form>
                </Stack>
              </Card>

              <Stack gap="xs">
                <Group justify="space-between">
                  <Title order={6}>Configured OpenID Mappings</Title>
                  <Badge color="blue">{openidMappingCards.length}</Badge>
                </Group>
                {openidMappingCards.length > 0 ? (
                  <Stack gap="xs">{openidMappingCards}</Stack>
                ) : (
                  <Alert color="gray" variant="light">
                    No OpenID mappings found.
                  </Alert>
                )}
              </Stack>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Tabs.Panel>
  );
}
