import {
  createSchema as coreCreateSchema,
  getDb as coreGetDb,
  initializeDb as coreInitializeDb,
  type DatabaseSchema,
} from "../../../../libs/db-core/src/dbClient.ts";

export { coreCreateSchema as createSchema, coreGetDb as getDb, coreInitializeDb as initializeDb };
export type { DatabaseSchema };
