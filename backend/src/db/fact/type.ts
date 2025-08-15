// ./db/fact/type.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from "typeorm";
import { Subject } from "typeorm/persistence/Subject.js";

@Entity()
export class FactModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  fact_text!: string;

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
  user?: string;

  @Column({ nullable: true })
  suppressed?: boolean;

  @ManyToMany(() => SubjectModel, subject => subject.facts, { cascade: true })
  @JoinTable()
  subjects!: SubjectModel[];

  @ManyToMany(() => AudienceModel, audience => audience.facts, { cascade: true })
  @JoinTable()
  audiences!: AudienceModel[];
}


@Entity()
export class SubjectModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToMany(() => FactModel, fact => fact.subjects)
  facts!: FactModel[];
}

@Entity()
export class AudienceModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToMany(() => FactModel, fact => fact.audiences)
  facts!: FactModel[];
}


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


// not DB

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
