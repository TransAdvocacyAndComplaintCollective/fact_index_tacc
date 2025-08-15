// ./db/db.ts
import { DataSource as TypeOrmDataSource } from "typeorm"
import { FactModel, SubjectModel, AudienceModel } from "./fact/type.js";
import { Group, PolicyRule, Role, RoleObjectValue, Subject, SubjectIdentifier } from "./user/model.js";
export const AppDataSource = new TypeOrmDataSource({
  type: "sqlite",
  database: "db.sqlite",
  synchronize: true,
  logging: true,
  entities: [
    FactModel,
    SubjectModel,
    AudienceModel,
    Subject,
    SubjectIdentifier,
    Group,
    Role,
    PolicyRule,
    RoleObjectValue,
  ],
});
async function initializeDatabase() {
  await AppDataSource.initialize()
}
initializeDatabase() ;