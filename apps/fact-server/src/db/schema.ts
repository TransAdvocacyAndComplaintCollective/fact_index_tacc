import {
  createSchema as coreCreateSchema,
  getDb as coreGetDb,
  initializeDb as coreInitializeDb,
  type DatabaseSchema,
} from "@factdb/db-core";

export { coreCreateSchema as createSchema, coreGetDb as getDb, coreInitializeDb as initializeDb };
export type { DatabaseSchema };
