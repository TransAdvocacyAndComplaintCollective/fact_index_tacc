import React from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Select,
} from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import { AdminConfig } from "../adminTypes";
import {
  FEDERATION_ENTITY_TYPE_OPTIONS,
  TRUST_MARK_OPERATOR_OPTIONS,
} from "../adminConstants";

type MutationState = {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
};

type FederationPolicyValues = {
  namingConstraintsCsv: string;
  allowSubdomains: boolean;
  allowedEntityTypes: string[];
  maxPathLength: number;
  trustAnchorEntityId: string;
  defaultAuthorizationDetailsJson: string;
};

type TrustSuperiorValues = {
  trustAnchorEntityId: string;
};

type TrustMarkPolicyValues = {
  requiredTrustMarksCsv: string;
  claim: string;
  operator: string;
  value: string;
};

type OpenIdFederationPanelProps = {
  canManageConfig: boolean;
  config?: AdminConfig;
  federationPolicyForm: UseFormReturnType<FederationPolicyValues>;
  trustSuperiorForm: UseFormReturnType<TrustSuperiorValues>;
  trustMarkPolicyForm: UseFormReturnType<TrustMarkPolicyValues>;
  handleFederationPolicySubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  handleTrustSuperiorSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  handleTrustMarkPolicySubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  saveFederationPolicyMutation: MutationState;
  saveTrustSuperiorMutation: MutationState;
  saveTrustMarkPolicyMutation: MutationState;
  trustMarkTypeOptions: string[];
  newTrustMarkType: string;
  setNewTrustMarkType: (value: string) => void;
  handleAddTrustMarkType: () => void;
  formatError: (error: unknown) => string;
};

export default function OpenIdFederationPanel({
  canManageConfig,
  config,
  federationPolicyForm,
  trustSuperiorForm,
  trustMarkPolicyForm,
  handleFederationPolicySubmit,
  handleTrustSuperiorSubmit,
  handleTrustMarkPolicySubmit,
  saveFederationPolicyMutation,
  saveTrustSuperiorMutation,
  saveTrustMarkPolicyMutation,
  trustMarkTypeOptions,
  newTrustMarkType,
  setNewTrustMarkType,
  handleAddTrustMarkType,
  formatError,
}: OpenIdFederationPanelProps) {
  return (
    <Tabs.Panel value="openid-federation" pt="md">
      <Card withBorder radius="md">
        <Stack gap="md">
          <Title order={4}>OpenID Federation</Title>
          <Text size="sm" c="dimmed">
            Manage federation consumer metadata, trust anchor policy, and trust marks.
          </Text>

          <Tabs defaultValue="trust-anchor-policy" keepMounted={false}>
            <Tabs.List grow>
              <Tabs.Tab value="inferior-view">Inferior View</Tabs.Tab>
              <Tabs.Tab value="trust-anchor-policy">Trust Anchor Policy</Tabs.Tab>
              <Tabs.Tab value="trust-superior">Trust Superior</Tabs.Tab>
              <Tabs.Tab value="trust-mark-issuer">Trust Mark Issuer</Tabs.Tab>
              <Tabs.Tab value="issue-trust-mark">Issue Trust Mark</Tabs.Tab>
              <Tabs.Tab value="trust-mark-builder">Trust Mark Builder</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="inferior-view" pt="md">
              <Stack gap="md">
                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>Inferior View</Title>
                    <Text size="sm" c="dimmed">
                      View subordinate entities configured under this trust anchor.
                    </Text>
                    <Alert color="blue" variant="light" title="Onboarding status">
                      <Stack gap={4}>
                        <Group gap="xs">
                          <Badge color={config?.federationPolicy?.trustAnchorEntityId ? "green" : "gray"}>
                            {config?.federationPolicy?.trustAnchorEntityId ? "Configured" : "Missing"}
                          </Badge>
                          <Text size="sm">Immediate superior configured</Text>
                        </Group>
                        <Group gap="xs">
                          <Badge color={(config?.trustMarkPolicy?.requiredTrustMarks?.length || 0) > 0 ? "green" : "gray"}>
                            {(config?.trustMarkPolicy?.requiredTrustMarks?.length || 0) > 0 ? "Configured" : "Missing"}
                          </Badge>
                          <Text size="sm">Trust mark requirements configured</Text>
                        </Group>
                        <Group gap="xs">
                          <Badge color="yellow">Pending</Badge>
                          <Text size="sm">Inferior storage and subordinate statement issuance wiring</Text>
                        </Group>
                      </Stack>
                    </Alert>
                    <Alert color="gray" variant="light" title="Configured inferiors">
                      No inferiors configured yet. Add backend support for subordinate registry and then list items here.
                    </Alert>
                  </Stack>
                </Card>

                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>Inferior</Title>
                    <Text size="sm" c="dimmed">
                      Create or register an immediate inferior (subordinate) federation entity.
                    </Text>
                    <Alert color="blue" variant="light" title="How to use this section">
                      <Stack gap={4}>
                        <Text size="sm">1. Register the inferior entity ID.</Text>
                        <Text size="sm">2. Ensure the inferior publishes `/.well-known/openid-federation`.</Text>
                        <Text size="sm">3. Inferior should include this trust anchor in `authority_hints`.</Text>
                        <Text size="sm">4. Issue a subordinate statement from this trust anchor to the inferior.</Text>
                      </Stack>
                    </Alert>
                    <TextInput
                      label="Inferior Entity ID"
                      description="Entity ID URL for the subordinate federation entity."
                      placeholder="https://inferior.example.org"
                    />
                    <TextInput
                      label="Inferior Name"
                      description="Friendly name used by admins when selecting inferiors."
                      placeholder="Example Inferior"
                    />
                    <Button type="button" disabled>
                      Save Inferior (Coming soon)
                    </Button>
                  </Stack>
                </Card>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="trust-anchor-policy" pt="md">
              <Card withBorder radius="md">
                <Stack gap="md">
                  <Title order={5}>Trust Anchor Federation-wide Policy</Title>
                  <Text size="sm" c="dimmed">
                    Configure naming constraints, allowed entity types, and trust chain length.
                  </Text>
                  <Alert color="blue" variant="light" title="How to use this tab">
                    <Stack gap={4}>
                      <Text size="sm">1. Add allowed domains in Naming Constraints.</Text>
                      <Text size="sm">2. Select allowed federation entity types.</Text>
                      <Text size="sm">3. Set Max Path Length to limit trust chain depth.</Text>
                      <Text size="sm">4. Optionally set Trust Anchor Entity ID and default authorization_details JSON.</Text>
                      <Text size="sm">5. Click Save Trust Anchor Policy.</Text>
                    </Stack>
                  </Alert>
                  <form onSubmit={handleFederationPolicySubmit}>
                    <Stack gap="sm">
                      <TextInput
                        label="Naming Constraints (domains, comma separated)"
                        description="Allowed domain boundaries for trusted entities. Enter one or more domains separated by commas."
                        placeholder="example.org, trusted.example.net"
                        required
                        {...federationPolicyForm.getInputProps("namingConstraintsCsv")}
                      />
                      <Checkbox
                        label="Allow subdomains for naming constraints"
                        description="If enabled, subdomains of each naming constraint are also accepted."
                        {...federationPolicyForm.getInputProps("allowSubdomains", { type: "checkbox" })}
                      />
                      <MultiSelect
                        label="Allowed Entity Types"
                        description="Entity types this trust anchor accepts during chain validation."
                        data={FEDERATION_ENTITY_TYPE_OPTIONS}
                        value={federationPolicyForm.values.allowedEntityTypes}
                        onChange={(value) => federationPolicyForm.setFieldValue("allowedEntityTypes", value)}
                        placeholder="Select allowed federation entity types"
                        searchable
                        nothingFoundMessage="No entity types found"
                        required
                      />
                      <NumberInput
                        label="Max Path Length"
                        description="Maximum number of federation hops allowed in a resolved trust chain."
                        min={0}
                        max={10}
                        step={1}
                        clampBehavior="strict"
                        value={federationPolicyForm.values.maxPathLength}
                        onChange={(value) =>
                          federationPolicyForm.setFieldValue(
                            "maxPathLength",
                            typeof value === "number" && Number.isFinite(value) ? value : 0
                          )
                        }
                        required
                      />
                      <TextInput
                        label="Trust Anchor Entity ID"
                        description="Canonical entity identifier URL of your trust anchor."
                        placeholder="https://trust-anchor.example.org"
                        {...federationPolicyForm.getInputProps("trustAnchorEntityId")}
                      />
                      <Textarea
                        label="Default Rich Authorization Request (authorization_details JSON)"
                        description="Default authorization_details payload used when login requests do not provide one."
                        minRows={6}
                        autosize
                        placeholder='[{"type":"openid_credential","credential_type":"UniversityDegreeCredential"}]'
                        {...federationPolicyForm.getInputProps("defaultAuthorizationDetailsJson")}
                      />
                      <Button
                        type="submit"
                        loading={saveFederationPolicyMutation.isPending}
                        disabled={!canManageConfig || saveFederationPolicyMutation.isPending}
                      >
                        Save Trust Anchor Policy
                      </Button>
                      {!canManageConfig && (
                        <Text size="sm" color="orange">
                          You need admin config write permission to update trust anchor policy
                        </Text>
                      )}
                      {saveFederationPolicyMutation.isError && (
                        <Text size="sm" color="red">
                          {formatError(saveFederationPolicyMutation.error)}
                        </Text>
                      )}
                      {saveFederationPolicyMutation.isSuccess && (
                        <Text size="sm" color="green">
                          Trust anchor policy saved.
                        </Text>
                      )}
                    </Stack>
                  </form>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="trust-superior" pt="md">
              <Card withBorder radius="md">
                <Stack gap="md">
                  <Title order={5}>Trust Superior</Title>
                  <Text size="sm" c="dimmed">
                    Define upstream federation superior/trust anchor relationships used to resolve trust chains.
                  </Text>
                  <Alert color="blue" variant="light" title="How to use this tab">
                    <Stack gap={4}>
                      <Text size="sm">1. Enter the superior entity ID for the upstream authority.</Text>
                      <Text size="sm">2. Save to set this as the immediate superior trust anchor for federation resolution.</Text>
                      <Text size="sm">3. Use a full HTTPS URL entity ID (for example: https://ta.example.org).</Text>
                      <Text size="sm">4. To change superior, update the value and save again.</Text>
                    </Stack>
                  </Alert>
                  <form onSubmit={handleTrustSuperiorSubmit}>
                    <Stack gap="sm">
                      <TextInput
                        label="Immediate Superior Entity ID"
                        description="Entity ID URL of the immediate superior trust anchor used when resolving trust chains."
                        placeholder="https://superior.example.org"
                        required
                        {...trustSuperiorForm.getInputProps("trustAnchorEntityId")}
                      />
                      <Button
                        type="submit"
                        loading={saveTrustSuperiorMutation.isPending}
                        disabled={!canManageConfig || saveTrustSuperiorMutation.isPending}
                      >
                        Save Trust Superior
                      </Button>
                      {!canManageConfig && (
                        <Text size="sm" color="orange">
                          You need admin config write permission to update trust superior
                        </Text>
                      )}
                      {saveTrustSuperiorMutation.isError && (
                        <Text size="sm" color="red">
                          {formatError(saveTrustSuperiorMutation.error)}
                        </Text>
                      )}
                      {saveTrustSuperiorMutation.isSuccess && (
                        <Text size="sm" color="green">
                          Trust superior saved.
                        </Text>
                      )}
                    </Stack>
                  </form>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="trust-mark-issuer" pt="md">
              <Card withBorder radius="md">
                <Stack gap="md">
                  <Title order={5}>Create Trust Mark Issuer</Title>
                  <Text size="sm" c="dimmed">
                    Register a trust mark issuer profile. Issuer persistence endpoints are not connected yet.
                  </Text>
                  <Alert color="blue" variant="light" title="How to use this tab">
                    <Stack gap={4}>
                      <Text size="sm">1. Enter the issuer entity ID URL.</Text>
                      <Text size="sm">2. Enter a human-readable issuer name.</Text>
                      <Text size="sm">3. Enter issuer JWKS URL for signature verification keys.</Text>
                      <Text size="sm">4. Save will be enabled when issuer backend endpoints are connected.</Text>
                    </Stack>
                  </Alert>
                  <TextInput
                    label="Issuer Entity ID"
                    description="Unique URL identity for the trust mark issuer."
                    placeholder="https://issuer.example.org"
                  />
                  <TextInput
                    label="Issuer Name"
                    description="Human-friendly display name for administrators and audit logs."
                    placeholder="Example Trust Mark Issuer"
                  />
                  <TextInput
                    label="JWKS URL"
                    description="Public key set endpoint used to verify trust mark signatures."
                    placeholder="https://issuer.example.org/jwks.json"
                  />
                  <Button type="button" disabled>
                    Save Issuer (Coming soon)
                  </Button>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="issue-trust-mark" pt="md">
              <Card withBorder radius="md">
                <Stack gap="md">
                  <Title order={5}>Issue Trust Mark</Title>
                  <Text size="sm" c="dimmed">
                    Issue a trust mark to a subject entity. Issuance endpoint wiring is not connected yet.
                  </Text>
                  <Alert color="blue" variant="light" title="How to use this tab">
                    <Stack gap={4}>
                      <Text size="sm">1. Select the trust mark type to issue.</Text>
                      <Text size="sm">2. Enter the subject entity ID that will receive the mark.</Text>
                      <Text size="sm">3. Provide claims JSON for trust mark payload fields.</Text>
                      <Text size="sm">4. Issue button will be enabled after issuance backend wiring is added.</Text>
                    </Stack>
                  </Alert>
                  <Select
                    label="Trust Mark Type"
                    description="The trust mark type/identifier to issue to the subject."
                    placeholder="Select trust mark type"
                    data={trustMarkTypeOptions.map((value) => ({ value, label: value }))}
                    searchable
                    nothingFoundMessage="No trust mark types found"
                  />
                  <TextInput
                    label="Subject Entity ID"
                    description="Entity ID of the relying party, wallet, or provider receiving this trust mark."
                    placeholder="https://wallet.example.org"
                  />
                  <Textarea
                    label="Trust Mark Claims (JSON)"
                    description="JSON object of claim values embedded in the issued trust mark token."
                    placeholder='{"assurance_level":"high"}'
                    minRows={4}
                    autosize
                  />
                  <Button type="button" disabled>
                    Issue Trust Mark (Coming soon)
                  </Button>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="trust-mark-builder" pt="md">
              <Stack gap="md">
                <Card withBorder radius="md">
                  <Stack gap="sm">
                    <Title order={5}>Trust Mark Types</Title>
                    <Text size="sm" c="dimmed">
                      View configured trust mark types and add new types to the current policy draft.
                    </Text>
                    <Alert color="blue" variant="light" title="How to use this tab">
                      <Stack gap={4}>
                        <Text size="sm">1. Review existing trust mark types shown below.</Text>
                        <Text size="sm">2. Add a new trust mark type URI and click Add Type.</Text>
                        <Text size="sm">3. Configure claim checks in Trust Mark Claims Validation.</Text>
                        <Text size="sm">4. Click Save Trust Mark Checks to persist required marks and claim rules.</Text>
                      </Stack>
                    </Alert>
                    <Group gap="xs" wrap="wrap">
                      {trustMarkTypeOptions.length ? (
                        trustMarkTypeOptions.map((value) => (
                          <Badge key={`trust-mark-type-${value}`} variant="light" color="blue">
                            {value}
                          </Badge>
                        ))
                      ) : (
                        <Text size="sm" c="dimmed">No trust mark types configured.</Text>
                      )}
                    </Group>
                    <Group align="end">
                      <TextInput
                        label="New Trust Mark Type"
                        description="Create a new trust mark type URI that can be selected during issuance."
                        placeholder="https://trust.example.org/marks/loa-high"
                        value={newTrustMarkType}
                        onChange={(event) => setNewTrustMarkType(event.currentTarget.value)}
                        style={{ flex: 1 }}
                      />
                      <Button type="button" variant="default" onClick={handleAddTrustMarkType}>
                        Add Type
                      </Button>
                    </Group>
                  </Stack>
                </Card>

                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>Trust Mark Claims Validation</Title>
                    <Text size="sm" c="dimmed">
                      Define required trust marks and how to check trust mark claims.
                    </Text>
                    <form onSubmit={handleTrustMarkPolicySubmit}>
                      <Stack gap="sm">
                        <TextInput
                          label="Required Trust Mark IDs (comma separated)"
                          description="Trust mark type IDs that must be present for access decisions."
                          placeholder="https://trust.example.org/marks/loa-high"
                          {...trustMarkPolicyForm.getInputProps("requiredTrustMarksCsv")}
                        />
                        <TextInput
                          label="Claim Name"
                          description="Claim field name to validate inside each trust mark payload."
                          placeholder="assurance_level"
                          {...trustMarkPolicyForm.getInputProps("claim")}
                        />
                        <Select
                          label="Claim Check Operator"
                          description="Comparison method used when evaluating the claim value."
                          data={TRUST_MARK_OPERATOR_OPTIONS}
                          value={trustMarkPolicyForm.values.operator || null}
                          onChange={(value) => trustMarkPolicyForm.setFieldValue("operator", value || "equals")}
                          allowDeselect={false}
                        />
                        <TextInput
                          label="Expected Claim Value"
                          description="Expected value for the selected claim. Ignored when operator is 'exists'."
                          placeholder="high"
                          disabled={trustMarkPolicyForm.values.operator === "exists"}
                          {...trustMarkPolicyForm.getInputProps("value")}
                        />
                        <Button
                          type="submit"
                          loading={saveTrustMarkPolicyMutation.isPending}
                          disabled={!canManageConfig || saveTrustMarkPolicyMutation.isPending}
                        >
                          Save Trust Mark Checks
                        </Button>
                        {!canManageConfig && (
                          <Text size="sm" color="orange">
                            You need admin config write permission to update trust mark checks
                          </Text>
                        )}
                        {saveTrustMarkPolicyMutation.isError && (
                          <Text size="sm" color="red">
                            {formatError(saveTrustMarkPolicyMutation.error)}
                          </Text>
                        )}
                        {saveTrustMarkPolicyMutation.isSuccess && (
                          <Text size="sm" color="green">
                            Trust mark checks saved.
                          </Text>
                        )}
                      </Stack>
                    </form>
                  </Stack>
                </Card>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Card>
    </Tabs.Panel>
  );
}
