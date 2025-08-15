// ./db/fact/fact.ts
import { AudienceModel, AudienceType, FactModel, FactType, SearchParams, SubjectModel, SubjectType } from "./type.js";
import { Like, In, Not } from "typeorm";
import { AppDataSource } from "../db.js";

// Delete a fact
export async function deleteFact(id: string | number): Promise<boolean> {
  const res = await AppDataSource
    .getRepository(FactModel)
    .delete({ id: Number(id) });
  return typeof res.affected === "number" && res.affected > 0;
}

// Create a fact with related subjects and audiences
export async function createFact(fact: Partial<FactModel>): Promise<FactModel> {
  const factRepo = AppDataSource.getRepository(FactModel);

  // Handle subjects and audiences if they come as IDs
  if (fact.subjects && fact.subjects.length > 0) {
    fact.subjects = await AppDataSource
      .getRepository(SubjectModel)
      .findBy({ id: In(fact.subjects.map((s: any) => s.id ?? s)) });
  }
  if (fact.audiences && fact.audiences.length > 0) {
    fact.audiences = await AppDataSource
      .getRepository(AudienceModel)
      .findBy({ id: In(fact.audiences.map((a: any) => a.id ?? a)) });
  }

  const saved = await factRepo.save(factRepo.create(fact));
  return saved;
}

export async function updateFact(
  id: string | number,
  fact: Partial<FactModel>
): Promise<FactModel | null> {
  const factRepo = AppDataSource.getRepository(FactModel);
  const existing = await factRepo.findOne({
    where: { id: Number(id) },
    relations: ["subjects", "audiences"],
  });
  if (!existing) return null;

  if (fact.subjects) {
    existing.subjects = await AppDataSource
      .getRepository(SubjectModel)
      .findBy({ id: In(fact.subjects.map((s: any) => s.id ?? s)) });
  }
  if (fact.audiences) {
    existing.audiences = await AppDataSource
      .getRepository(AudienceModel)
      .findBy({ id: In(fact.audiences.map((a: any) => a.id ?? a)) });
  }

  Object.assign(existing, fact);
  return await factRepo.save(existing);
}

export async function getFactById(id: string | number): Promise<FactModel | null> {
  return AppDataSource.getRepository(FactModel).findOne({
    where: { id: Number(id) },
    relations: ["subjects", "audiences"],
  });
}
// Search facts with filters
export async function searchFacts(params: SearchParams): Promise<FactType[]> {
  const repo = AppDataSource.getRepository(FactModel);
  const qb = repo
    .createQueryBuilder("fact")
    .leftJoinAndSelect("fact.subjects", "subject")
    .leftJoinAndSelect("fact.audiences", "audience");

  if (params.keyword) {
    qb.andWhere(
      "(fact.fact_text LIKE :kw OR fact.statement LIKE :kw OR fact.title LIKE :kw)",
      { kw: `%${params.keyword}%` }
    );
  }

  if (params.subjectsInclude?.length) {
    qb.andWhere("subject.name IN (:...subjectsInclude)", {
      subjectsInclude: params.subjectsInclude,
    });
  }
  if (params.subjectsExclude?.length) {
    qb.andWhere("subject.name NOT IN (:...subjectsExclude)", {
      subjectsExclude: params.subjectsExclude,
    });
  }
  if (params.audiencesInclude?.length) {
    qb.andWhere("audience.name IN (:...audiencesInclude)", {
      audiencesInclude: params.audiencesInclude,
    });
  }
  if (params.audiencesExclude?.length) {
    qb.andWhere("audience.name NOT IN (:...audiencesExclude)", {
      audiencesExclude: params.audiencesExclude,
    });
  }

  if (params.yearFrom) {
    qb.andWhere("fact.year >= :yf", { yf: params.yearFrom });
  }
  if (params.yearTo) {
    qb.andWhere("fact.year <= :yt", { yt: params.yearTo });
  }

  if (params.sortBy) {
    const order: "ASC" | "DESC" =
      params.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    let col: string;
    switch (params.sortBy) {
      case "timestamp":
        col = "fact.timestamp";
        break;
      case "year":
        col = "fact.year";
        break;
      case "title":
        col = "fact.title";
        break;
      default:
        col = "fact.id";
    }
    qb.orderBy(col, order);
  }

  if (params.offset) qb.skip(params.offset);
  if (params.limit) qb.take(params.limit);

  return await qb.getMany();
}

// Get all audiences
export async function getAudiences(): Promise<AudienceType[]> {
  return await AppDataSource.getRepository(AudienceModel).find();
}
// Get all subjects
export async function getSubjects(): Promise<SubjectType[]> {
  return await AppDataSource.getRepository(SubjectModel).find();
}