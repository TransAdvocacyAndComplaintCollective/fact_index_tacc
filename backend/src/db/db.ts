// ./db/db.ts
import { DataSource as TypeOrmDataSource } from "typeorm"
import { FactModel, SubjectModel, AudienceModel } from "./fact/type.js";
export const AppDataSource = new TypeOrmDataSource({
  type: "sqlite",
  database: "db.sqlite",
  synchronize: true,
  logging: true,
  entities: [
    FactModel,
    SubjectModel,
    AudienceModel
  ],
});
async function initializeDatabase() {
  await AppDataSource.initialize()
}
initializeDatabase() ;