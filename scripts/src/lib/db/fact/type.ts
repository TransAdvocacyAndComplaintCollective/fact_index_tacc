import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from "typeorm";

// ----------------- SubjectModel -----------------
@Entity()
export class SubjectModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToMany(() => FactModel, (fact) => fact.subjects)
  facts!: FactModel[];
}

// ----------------- AudienceModel -----------------
@Entity()
export class AudienceModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToMany(() => FactModel, (fact) => fact.audiences)
  facts!: FactModel[];
}

// ----------------- FactModel -----------------
@Entity()
export class FactModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "fact_text" })
  factText!: string; // required, so no undefined

  @Column({ nullable: true })
  statement?: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ type: "text", nullable: true }) // store timestamp as text
  timestamp?: string;

  @Column({ nullable: true })
  source?: string;

  @Column({ nullable: true })
  type?: string;

  @Column({ nullable: true })
  context?: string;

  @Column({ nullable: true })
  year?: number;

  @Column({ nullable: true })
  suppressed?: boolean;

  @ManyToMany(() => SubjectModel, (subject) => subject.facts, { cascade: true })
  @JoinTable()
  subjects?: SubjectModel[];

  @ManyToMany(() => AudienceModel, (audience) => audience.facts, { cascade: true })
  @JoinTable()
  audiences?: AudienceModel[];
}

// ----------------- Types for DTO / API -----------------
export class FactType {
  id!: number;
  fact_text!: string;
  statement?: string;
  title?: string;
  timestamp?: string;
  source?: string;
  type?: string;
  context?: string;
  year?: number;
  user?: string;
  suppressed?: boolean;
}

export class SubjectType {
  id!: number;
  name!: string;
}

export class AudienceType {
  id!: number;
  name!: string;
}

// ----------------- Search Parameters -----------------
export interface SearchParams {
  keyword?: string;
  subjectsInclude?: string[];
  subjectsExclude?: string[];
  audiencesInclude?: string[];
  audiencesExclude?: string[];
  yearFrom?: number;
  yearTo?: number;
  sortBy?: "timestamp" | "year" | "title" | "relevance";
  sortOrder?: "asc" | "desc";
  offset?: number;
  limit?: number;
}
