// ./db/db.ts
import { DataSource as TypeOrmDataSource } from "typeorm";
import { FactModel, SubjectModel, AudienceModel } from "./fact/type.js";
// import { Subject } from "./user/model.js";
// TODO: Fix import path or create './user/model.ts' with 'Subject' export

export const AppDataSource = new TypeOrmDataSource({
  type: "sqlite",
  database: "../backend/db.sqlite",
  synchronize: true,
  logging: true,
  entities: [FactModel, SubjectModel, AudienceModel, Subject],
});
async function initializeDatabase() {
  try {
    await AppDataSource.initialize();
  } catch (err) {
    console.error("Failed to initialize database", err);
    process.exit(1);
  }
}

initializeDatabase();
