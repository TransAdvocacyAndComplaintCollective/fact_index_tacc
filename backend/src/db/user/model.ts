// src/entities/access-model.ts
// TypeORM v0.3+ entity definitions for a flexible identity → group/role → policy model
// Cleaned up and simplified by removing Tag/TagNamespace. Added helper function for finding candidate subjects.

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  Index,
  Unique,
  DataSource,
} from "typeorm";

/****************************
 * Enums
 ***************************/
export enum Provider {
  PUBLIC = "PUBLIC",
  DEV = "DEV",
  GOOGLE = "GOOGLE",
  GOOGLE_WORKSPACE = "GOOGLE_WORKSPACE",
  GOOGLE_GROUPS = "GOOGLE_GROUPS",
  FACEBOOK = "FACEBOOK",
  DISCORD = "DISCORD",
  BLUESKY = "BLUESKY",
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  IP = "IP",
  OTHER = "OTHER",
}

export enum IdentifierType {
  USER_ID = "USER_ID",
  USERNAME = "USERNAME",
  USERNAME_PATTERN = "USERNAME_PATTERN",
  GROUP_ID = "GROUP_ID",
  ROLE_ID = "Discord_ROLE_ID",
  GUILD_ID = "Discord_GUILD_ID",
  DOMAIN = "DOMAIN",
  EMAIL_DOMAIN = "EMAIL DOMAIN",
  EMAIL_SUBDOMAIN = "EMAIL SUBDOMAIN",
  EMAIL = "EMAIL",
  PHONE_E164 = "PHONE_E164",
  IP = "IP",
  IP_RANGE_CIDR = "IP_RANGE_CIDR",
}

export enum MatchMode {
  EXACT = "EXACT",
  PREFIX = "PREFIX",
  SUFFIX = "SUFFIX",
  REGEX = "REGEX",
  DOMAIN = "DOMAIN",
  CIDR = "CIDR",
  HASH = "HASH",
}

export enum Decision {
  ACCEPT = "ACCEPT",
  DENY = "DENY",
  NEUTRAL = "NEUTRAL",
}

/****************************
 * Subject & Identifiers
 ***************************/
@Entity({ name: "subjects" })
export class Subject {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 190 })
  slug!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  displayName?: string | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => SubjectIdentifier, (si) => si.subject, { cascade: true })
  identifiers!: SubjectIdentifier[];

  @ManyToMany(() => Group, (g) => g.subjects, { cascade: false })
  groups!: Group[];

  @ManyToMany(() => Role, (r) => r.subjects, { cascade: false })
  roles!: Role[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity({ name: "subject_identifiers" })
@Unique("uq_subject_identifier", ["subject", "provider", "identifierType", "matchMode", "value"])
@Index(["provider", "identifierType", "matchMode", "value"])
export class SubjectIdentifier {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Subject, (s) => s.identifiers, { onDelete: "CASCADE" })
  subject!: Subject;

  @Column({ type: "text", enum: Provider })
  provider!: Provider;

  @Column({ type: "text", enum: IdentifierType })
  identifierType!: IdentifierType;

  @Column({ type: "text", enum: MatchMode })
  matchMode!: MatchMode;

  @Column({ type: "varchar", length: 512 })
  value!: string;

  @Column({ type: "boolean", default: false })
  isHashed!: boolean;

  @Column({ type: "boolean", default: false })
  isPseudonymized!: boolean;

  @Column({ type: "varchar", length: 64, nullable: true })
  hashAlgorithm?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  hashSaltId?: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/****************************
 * Groups
 ***************************/
@Entity({ name: "groups" })
@Unique(["name"])
export class Group {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 190 })
  name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  description?: string | null;

  @ManyToMany(() => Subject, (s) => s.groups)
  @JoinTable({ name: "group_subjects" })
  subjects!: Subject[];

  @ManyToMany(() => Role, (r) => r.groups)
  roles!: Role[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/****************************
 * Roles
 ***************************/
@Entity({ name: "roles" })
@Index(["name", "scopeGroup"], { unique: true })
export class Role {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @ManyToOne(() => Group, { nullable: true, onDelete: "SET NULL" })
  scopeGroup?: Group | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  description?: string | null;

  @ManyToMany(() => Subject, (s) => s.roles)
  @JoinTable({ name: "role_subjects" })
  subjects!: Subject[];

  @ManyToMany(() => Group, (g) => g.roles)
  @JoinTable({ name: "role_groups" })
  groups!: Group[];

  @OneToMany(() => RoleObjectValue, (rov) => rov.role, { cascade: true })
  objectValues!: RoleObjectValue[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/****************************
 * Policy Rules
 ***************************/
@Entity({ name: "policy_rules" })
@Index(["permission", "subPermission", "priority"])
export class PolicyRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  permission!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  subPermission?: string | null;

  @Column({ type: "enum", enum: Decision, default: Decision.NEUTRAL })
  effect!: Decision;

  @Column({ type: "int", default: 0 })
  priority!: number;

  @ManyToMany(() => Role)
  @JoinTable({ name: "policy_rule_roles" })
  roles!: Role[];

  @ManyToMany(() => Group)
  @JoinTable({ name: "policy_rule_groups" })
  groups!: Group[];

  @ManyToMany(() => Subject)
  @JoinTable({ name: "policy_rule_subjects" })
  subjects!: Subject[];

  @Column({ type: "jsonb", nullable: true })
  context?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/****************************
 * RoleObjectValues
 ***************************/
@Entity({ name: "role_object_values" })
@Unique("uq_role_object_path", ["role", "project", "subProject", "task", "subTask"])
export class RoleObjectValue {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Role, (r) => r.objectValues, { onDelete: "CASCADE" })
  role!: Role;

  @Column({ type: "varchar", length: 160 })
  project!: string;

  @Column({ type: "varchar", length: 160, nullable: true })
  subProject?: string | null;

  @Column({ type: "varchar", length: 160 })
  task!: string;

  @Column({ type: "varchar", length: 160, nullable: true })
  subTask?: string | null;

  @Column({ type: "jsonb", nullable: true })
  value?: unknown;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

