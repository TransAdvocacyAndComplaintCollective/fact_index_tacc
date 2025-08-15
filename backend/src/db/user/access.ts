// src/auth/access.ts
import { Brackets, DataSource, In } from "typeorm";
import {
  Decision,
  Group,
  IdentifierType,
  MatchMode,
  PolicyRule,
  Provider,
  Role,
  RoleObjectValue,
  Subject,
  SubjectIdentifier,
} from "./model.js";
import {
  AuthCheckParams,
  AuthCheckResult,
  GroupCreateParams,
  GroupUpdateParams,
  LoginFact,
  ParamsCheck,
  PolicyRuleCreateParams,
  PolicyRuleUpdateParams,
  RoleCreateParams,
  RoleObjectValueCreateParams,
  RoleObjectValueUpdateParams,
  RoleUpdateParams,
  SubjectCreateParams,
  SubjectIdentifierCreateParams,
  SubjectIdentifierUpdateParams,
  SubjectUpdateParams,
} from "./types.js";

/**
 * Find all subjects matching any of the provided login facts.
 * You can extend this to support CIDR, regex, domain, etc.
 */
async function findSubjectsByFacts(
  ds: DataSource,
  facts: LoginFact[]
): Promise<Subject[]> {
  const repo = ds.getRepository(SubjectIdentifier);
  const allMatches: Subject[] = [];

  for (const fact of facts) {
    const matches = await repo.find({
      where: {
        provider: fact.provider,
        identifierType: fact.type,
        value: fact.value,
      },
      relations: { subject: true },
    });

    for (const match of matches) {
      if (!allMatches.find((s) => s.id === match.subject.id)) {
        allMatches.push(match.subject);
      }
    }
  }

  return allMatches;
}

/**
 * Main auth check
 */
export async function checkAuth(
  ds: DataSource,
  params: AuthCheckParams
): Promise<AuthCheckResult> {
  const matchedSubjects = await findSubjectsByFacts(ds, params.facts);

  // Load rules that match any of these subjects (directly or via roles/groups)
  const ruleRepo = ds.getRepository(PolicyRule);

  const matchedRules = await ruleRepo
    .createQueryBuilder("rule")
    .leftJoinAndSelect("rule.subjects", "subject")
    .leftJoinAndSelect("rule.roles", "role")
    .leftJoinAndSelect("rule.groups", "group")
    .where("rule.permission = :perm", { perm: params.permission })
    .andWhere(
      new Brackets((qb) => {
        qb.where("rule.subPermission IS NULL").orWhere(
          "rule.subPermission = :subPerm",
          {
            subPerm: params.subPermission ?? null,
          }
        );
      })
    )
    .getMany();

  // Filter rules by matching subjects/roles/groups
  const applicableRules = matchedRules.filter((rule) => {
    // subject match
    if (rule.subjects.some((s) => matchedSubjects.some((ms) => ms.id === s.id)))
      return true;
    // role match
    if (
      rule.roles.some((role) =>
        matchedSubjects.some((s) => s.roles?.some((r) => r.id === role.id))
      )
    )
      return true;
    // group match
    if (
      rule.groups.some((group) =>
        matchedSubjects.some((s) => s.groups?.some((g) => g.id === group.id))
      )
    )
      return true;
    return false;
  });

  // Pick highest priority rule
  const winningRule = applicableRules.sort(
    (a, b) => b.priority - a.priority
  )[0];

  return {
    allowed: winningRule ? winningRule.effect === Decision.ACCEPT : false,
    decision: winningRule?.effect ?? Decision.NEUTRAL,
    matchedSubjects,
    matchedRules: applicableRules,
  };
}

/****************************
 * Utilities
 ***************************/
async function ensureExists<T>(
  ds: DataSource,
  entity: { new (): T },
  id: string,
  name: string
) {
  const repo = ds.getRepository(entity);
  const found = await repo.findOne({ where: { id } as any });
  if (!found) throw new Error(`${name} not found: ${id}`);
  return found as any;
}

/****************************
 * Subject
 ***************************/
export async function createSubject(
  ds: DataSource,
  params: SubjectCreateParams
) {
  const repo = ds.getRepository(Subject);
  const subject = repo.create({
    slug: params.slug,
    displayName: params.displayName ?? null,
    active: params.active ?? true,
  });
  return repo.save(subject);
}

export async function updateSubject(
  ds: DataSource,
  subjectId: string,
  patch: SubjectUpdateParams
) {
  const repo = ds.getRepository(Subject);
  await repo.update({ id: subjectId }, patch as any);
  return ensureExists(ds, Subject, subjectId, "Subject");
}

export async function deleteSubject(ds: DataSource, subjectId: string) {
  const repo = ds.getRepository(Subject);
  await repo.delete({ id: subjectId });
}

/****************************
 * SubjectIdentifier
 ***************************/
export async function addSubjectIdentifier(
  ds: DataSource,
  params: SubjectIdentifierCreateParams
) {
  const subject = await ensureExists(ds, Subject, params.subjectId, "Subject");
  const repo = ds.getRepository(SubjectIdentifier);
  const si = repo.create({
    subject,
    provider: params.provider,
    identifierType: params.identifierType,
    matchMode: params.matchMode,
    value: params.value,
    isHashed: params.isHashed ?? false,
    isPseudonymized: params.isPseudonymized ?? false,
    hashAlgorithm: params.hashAlgorithm ?? null,
    hashSaltId: params.hashSaltId ?? null,
    metadata: params.metadata ?? null,
  });
  return repo.save(si);
}

export async function updateSubjectIdentifier(
  ds: DataSource,
  subjectIdentifierId: string,
  patch: SubjectIdentifierUpdateParams
) {
  const repo = ds.getRepository(SubjectIdentifier);
  await repo.update({ id: subjectIdentifierId }, patch as any);
  return ensureExists(
    ds,
    SubjectIdentifier,
    subjectIdentifierId,
    "SubjectIdentifier"
  );
}

export async function removeSubjectIdentifier(
  ds: DataSource,
  subjectIdentifierId: string
) {
  const repo = ds.getRepository(SubjectIdentifier);
  await repo.delete({ id: subjectIdentifierId });
}

/****************************
 * Group
 ***************************/
export async function createGroup(ds: DataSource, params: GroupCreateParams) {
  const repo = ds.getRepository(Group);
  const g = repo.create({
    name: params.name,
    description: params.description ?? null,
  });
  return repo.save(g);
}

export async function updateGroup(
  ds: DataSource,
  groupId: string,
  patch: GroupUpdateParams
) {
  const repo = ds.getRepository(Group);
  await repo.update({ id: groupId }, patch as any);
  return ensureExists(ds, Group, groupId, "Group");
}

export async function deleteGroup(ds: DataSource, groupId: string) {
  const repo = ds.getRepository(Group);
  await repo.delete({ id: groupId });
}

export async function addSubjectToGroup(
  ds: DataSource,
  groupId: string,
  subjectId: string
) {
  await ensureExists(ds, Group, groupId, "Group");
  await ensureExists(ds, Subject, subjectId, "Subject");
  await ds
    .createQueryBuilder()
    .relation(Group, "subjects")
    .of(groupId)
    .add(subjectId);
}

export async function removeSubjectFromGroup(
  ds: DataSource,
  groupId: string,
  subjectId: string
) {
  await ensureExists(ds, Group, groupId, "Group");
  await ensureExists(ds, Subject, subjectId, "Subject");
  await ds
    .createQueryBuilder()
    .relation(Group, "subjects")
    .of(groupId)
    .remove(subjectId);
}

/****************************
 * Role
 ***************************/
export async function createRole(ds: DataSource, params: RoleCreateParams) {
  const repo = ds.getRepository(Role);
  let scopeGroup: Group | null = null;
  if (params.scopeGroupId) {
    scopeGroup = await ensureExists(ds, Group, params.scopeGroupId, "Group");
  }
  const role = repo.create({
    name: params.name,
    scopeGroup: scopeGroup ?? null,
    description: params.description ?? null,
  });
  return repo.save(role);
}

export async function updateRole(
  ds: DataSource,
  roleId: string,
  patch: RoleUpdateParams
) {
  const repo = ds.getRepository(Role);
  // Handle scopeGroupId specially if present
  const toUpdate: any = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "scopeGroupId")) {
    toUpdate.scopeGroup = patch.scopeGroupId
      ? await ensureExists(ds, Group, patch.scopeGroupId!, "Group")
      : null;
    delete toUpdate.scopeGroupId;
  }
  await repo.update({ id: roleId }, toUpdate);
  return ensureExists(ds, Role, roleId, "Role");
}

export async function deleteRole(ds: DataSource, roleId: string) {
  const repo = ds.getRepository(Role);
  await repo.delete({ id: roleId });
}

export async function assignRoleToSubject(
  ds: DataSource,
  roleId: string,
  subjectId: string
) {
  await ensureExists(ds, Role, roleId, "Role");
  await ensureExists(ds, Subject, subjectId, "Subject");
  await ds
    .createQueryBuilder()
    .relation(Role, "subjects")
    .of(roleId)
    .add(subjectId);
}

export async function removeRoleFromSubject(
  ds: DataSource,
  roleId: string,
  subjectId: string
) {
  await ensureExists(ds, Role, roleId, "Role");
  await ensureExists(ds, Subject, subjectId, "Subject");
  await ds
    .createQueryBuilder()
    .relation(Role, "subjects")
    .of(roleId)
    .remove(subjectId);
}

export async function assignRoleToGroup(
  ds: DataSource,
  roleId: string,
  groupId: string
) {
  await ensureExists(ds, Role, roleId, "Role");
  await ensureExists(ds, Group, groupId, "Group");
  await ds
    .createQueryBuilder()
    .relation(Role, "groups")
    .of(roleId)
    .add(groupId);
}

export async function removeRoleFromGroup(
  ds: DataSource,
  roleId: string,
  groupId: string
) {
  await ensureExists(ds, Role, roleId, "Role");
  await ensureExists(ds, Group, groupId, "Group");
  await ds
    .createQueryBuilder()
    .relation(Role, "groups")
    .of(roleId)
    .remove(groupId);
}

/****************************
 * PolicyRule
 ***************************/
export async function createPolicyRule(
  ds: DataSource,
  params: PolicyRuleCreateParams
) {
  return ds.transaction(async (trx) => {
    const repo = trx.getRepository(PolicyRule);
    const rule = repo.create({
      permission: params.permission,
      subPermission: params.subPermission ?? null,
      effect: params.effect ?? Decision.NEUTRAL,
      priority: params.priority ?? 0,
      context: params.context ?? null,
    });
    const saved = await repo.save(rule);

    if (params.subjectIds?.length) {
      await trx
        .createQueryBuilder()
        .relation(PolicyRule, "subjects")
        .of(saved.id)
        .add(params.subjectIds);
    }
    if (params.groupIds?.length) {
      await trx
        .createQueryBuilder()
        .relation(PolicyRule, "groups")
        .of(saved.id)
        .add(params.groupIds);
    }
    if (params.roleIds?.length) {
      await trx
        .createQueryBuilder()
        .relation(PolicyRule, "roles")
        .of(saved.id)
        .add(params.roleIds);
    }
    return saved;
  });
}

export async function updatePolicyRule(
  ds: DataSource,
  ruleId: string,
  patch: PolicyRuleUpdateParams
) {
  return ds.transaction(async (trx) => {
    const repo = trx.getRepository(PolicyRule);
    const toUpdate: any = { ...patch };
    delete toUpdate.subjectIds;
    delete toUpdate.groupIds;
    delete toUpdate.roleIds;

    if (Object.keys(toUpdate).length) {
      await repo.update({ id: ruleId }, toUpdate);
    }
    // Replace relations only when arrays are provided (undefined means untouched)
    if (patch.subjectIds) {
      await trx
        .createQueryBuilder()
        .relation(PolicyRule, "subjects")
        .of(ruleId)
        .set(patch.subjectIds);
    }
    if (patch.groupIds) {
      await trx
        .createQueryBuilder()
        .relation(PolicyRule, "groups")
        .of(ruleId)
        .set(patch.groupIds);
    }
    if (patch.roleIds) {
      await trx
        .createQueryBuilder()
        .relation(PolicyRule, "roles")
        .of(ruleId)
        .set(patch.roleIds);
    }

    return ensureExists(
      trx as unknown as DataSource,
      PolicyRule,
      ruleId,
      "PolicyRule"
    );
  });
}

export async function deletePolicyRule(ds: DataSource, ruleId: string) {
  const repo = ds.getRepository(PolicyRule);
  await repo.delete({ id: ruleId });
}

/****************************
 * RoleObjectValue
 ***************************/
export async function createRoleObjectValue(
  ds: DataSource,
  params: RoleObjectValueCreateParams
) {
  const role = await ensureExists(ds, Role, params.roleId, "Role");
  const repo = ds.getRepository(RoleObjectValue);
  const rov = repo.create({
    role,
    project: params.project,
    subProject: params.subProject ?? null,
    task: params.task,
    subTask: params.subTask ?? null,
    value: params.value,
  });
  return repo.save(rov);
}

export async function updateRoleObjectValue(
  ds: DataSource,
  id: string,
  patch: RoleObjectValueUpdateParams
) {
  const repo = ds.getRepository(RoleObjectValue);
  await repo.update({ id }, patch as any);
  return ensureExists(ds, RoleObjectValue, id, "RoleObjectValue");
}

export async function deleteRoleObjectValue(ds: DataSource, id: string) {
  const repo = ds.getRepository(RoleObjectValue);
  await repo.delete({ id });
}
// check auth
export async function hasPermission(
  ds: DataSource,
  facts: LoginFact[],
  project: string,
  subProject: string,
  task: string,
  subTask: string
): Promise<ParamsCheck> {
  // Get all permissions for this subject from getPermissions
  const permissions = await getPermissions(ds, facts);

  // Find the best matching permission based on provided object path
  const matching = permissions.filter(
    (p) =>
      p.project === project &&
      (p.subProject === null || p.subProject === subProject) &&
      p.task === task &&
      (p.subTask === null || p.subTask === subTask)
  );

  if (matching.length === 0) {
    return {
      decision: Decision.NEUTRAL,
      priority: 0,
      project,
      subProject,
      task,
      subTask,
      value: undefined,
    };
  }

  // Return the one with highest priority
  return matching.sort((a, b) => b.priority - a.priority)[0];
}

export async function getPermissions(
  ds: DataSource,
  facts: LoginFact[]
): Promise<ParamsCheck[]> {
  // Find subjects from login facts
  const matchedSubjects = await findSubjectsByFacts(ds, facts);

  if (matchedSubjects.length === 0) return [];

  // Collect all roles from subjects and their groups
  const roles = new Set<string>();
  matchedSubjects.forEach((s) => {
    s.roles?.forEach((r) => roles.add(r.id));
    s.groups?.forEach((g) => g.roles?.forEach((r) => roles.add(r.id)));
  });

  if (roles.size === 0) return [];

  // Get all RoleObjectValues for these roles
  const rovRepo = ds.getRepository(RoleObjectValue);
  const rovs = await rovRepo.find({
    where: {
      role: { id: In([...roles]) },
    },
    relations: ["role"],
  });

  return rovs.map((rov: RoleObjectValue) => ({
    decision: Decision.ACCEPT, // RoleObjectValues are assumed to grant access
    priority: 0, // Could be extended to include priority from policy
    project: rov.project,
    subProject: rov.subProject ?? null,
    task: rov.task,
    subTask: rov.subTask ?? null,
    value: rov.value as string,
  }));
}
