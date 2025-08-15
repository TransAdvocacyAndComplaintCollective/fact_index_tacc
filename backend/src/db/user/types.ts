// ./db/user/types.ts
import { Decision, IdentifierType, MatchMode, PolicyRule, Provider, Subject } from "./model.js";

/****************************
 * Helper Types & Functions
 ***************************/
export type LoginFact = {
    provider?: Provider;
    type: IdentifierType;
    value: string;
};
/**
 * Parameters for an auth check
 */
export interface AuthCheckParams {
  facts: LoginFact[]; // incoming identity facts
  permission: string;
  subPermission?: string;
  context?: Record<string, unknown>; // resource/environment context
}

/**
 * Result of an auth check
 */
export interface AuthCheckResult {
  allowed: boolean;
  decision: Decision;
  matchedSubjects: Subject[];
  matchedRules: PolicyRule[];
}

export type SubjectCreateParams = {
  slug: string;
  displayName?: string | null;
  active?: boolean;
};
export type SubjectUpdateParams = Partial<SubjectCreateParams>;

export type SubjectIdentifierCreateParams = {
  subjectId: string;
  provider: Provider;
  identifierType: IdentifierType;
  matchMode: MatchMode;
  value: string;
  isHashed?: boolean;
  isPseudonymized?: boolean;
  hashAlgorithm?: string | null;
  hashSaltId?: string | null;
  metadata?: Record<string, unknown> | null;
};
export type SubjectIdentifierUpdateParams = Partial<Omit<SubjectIdentifierCreateParams, "subjectId">>;

export type GroupCreateParams = { name: string; description?: string | null };
export type GroupUpdateParams = Partial<GroupCreateParams>;

export type RoleCreateParams = {
  name: string;
  scopeGroupId?: string | null;
  description?: string | null;
};
export type RoleUpdateParams = Partial<RoleCreateParams>;

export type PolicyRuleCreateParams = {
  permission: string;
  subPermission?: string | null;
  effect?: Decision; // default NEUTRAL
  priority?: number; // default 0
  subjectIds?: string[];
  groupIds?: string[];
  roleIds?: string[];
  context?: Record<string, unknown> | null;
};
export type PolicyRuleUpdateParams = Partial<PolicyRuleCreateParams> & {
  // For relations, provide arrays to replace entirely (pass undefined to leave untouched).
  subjectIds?: string[] | undefined;
  groupIds?: string[] | undefined;
  roleIds?: string[] | undefined;
};

export type RoleObjectValueCreateParams = {
  roleId: string;
  project: string;
  subProject?: string | null;
  task: string;
  subTask?: string | null;
  value?: unknown;
};
export type RoleObjectValueUpdateParams = Partial<Omit<RoleObjectValueCreateParams, "roleId">>;

export type ParamsCheck = {
  decision: Decision;
  priority: number;
  project: string;
  subProject?: string | null;
  task: string;
  subTask?: string | null;
  value?: string;
};