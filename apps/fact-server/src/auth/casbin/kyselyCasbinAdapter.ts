/**
 * Casbin Adapter using Kysely for DB-backed policy storage.
 * Implements the Casbin Adapter interface for loading/saving policies from SQL.
 */

import type { Kysely } from "kysely";
import type { Adapter } from "casbin";
import type { Model } from "casbin";
import type { DatabaseSchema } from "../../../../../libs/db-core/src/dbClient.ts";

function trimRightNulls(vals: Array<string | null | undefined>): string[] {
  let end = vals.length;
  while (end > 0 && (vals[end - 1] == null || vals[end - 1] === "")) end--;
  return vals.slice(0, end).filter((v): v is string => v != null && v !== "");
}

function secFromPtype(ptype: string): "p" | "g" {
  // Typical: p, p2... are policy; g, g2... are grouping
  return ptype.startsWith("g") ? "g" : "p";
}

export class KyselyCasbinAdapter implements Adapter {
  private readonly db: Kysely<DatabaseSchema>;

  constructor(db: Kysely<DatabaseSchema>) {
    this.db = db;
  }

  async loadPolicy(model: Model): Promise<void> {
    const rows = await this.db
      .selectFrom("casbin_rule")
      .selectAll()
      .execute();
    
    for (const r of rows) {
      const rule = trimRightNulls([r.v0, r.v1, r.v2, r.v3, r.v4, r.v5]);
      if (!r.ptype) continue;
      const sec = secFromPtype(r.ptype);
      // Model has addPolicy(sec, ptype, rule[])
      model.addPolicy(sec, r.ptype, rule);
    }
  }

  async savePolicy(model: Model): Promise<boolean> {
    // Simple & reliable: clear and reinsert.
    await this.db.deleteFrom("casbin_rule").execute();

    const inserts: Array<{
      ptype: string;
      v0: string | null;
      v1: string | null;
      v2: string | null;
      v3: string | null;
      v4: string | null;
      v5: string | null;
    }> = [];

    const pushRules = (ptype: string, rules: string[][]) => {
      for (const rule of rules) {
        inserts.push({
          ptype,
          v0: rule[0] ?? null,
          v1: rule[1] ?? null,
          v2: rule[2] ?? null,
          v3: rule[3] ?? null,
          v4: rule[4] ?? null,
          v5: rule[5] ?? null,
        });
      }
    };

    // Common defaults:
    pushRules("p", model.getPolicy("p", "p"));
    pushRules("g", model.getPolicy("g", "g"));

    if (inserts.length) {
      await this.db.insertInto("casbin_rule").values(inserts).execute();
    }
    return true;
  }

  async addPolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    await this.db
      .insertInto("casbin_rule")
      .values({
        ptype,
        v0: rule[0] ?? null,
        v1: rule[1] ?? null,
        v2: rule[2] ?? null,
        v3: rule[3] ?? null,
        v4: rule[4] ?? null,
        v5: rule[5] ?? null,
      })
      .execute();
  }

  async removePolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    let q = this.db.deleteFrom("casbin_rule").where("ptype", "=", ptype);
    const cols = ["v0", "v1", "v2", "v3", "v4", "v5"] as const;
    cols.forEach((c, i) => {
      const v = rule[i];
      q = v == null ? q.where(c, "is", null) : q.where(c, "=", v);
    });
    await q.execute();
  }

  async removeFilteredPolicy(
    _sec: string,
    ptype: string,
    fieldIndex: number,
    ...fieldValues: string[]
  ): Promise<void> {
    let q = this.db.deleteFrom("casbin_rule").where("ptype", "=", ptype);

    const cols = ["v0", "v1", "v2", "v3", "v4", "v5"] as const;
    for (let i = 0; i < fieldValues.length; i++) {
      const col = cols[fieldIndex + i];
      if (!col) break;
      const val = fieldValues[i];
      if (val && val.length) q = q.where(col, "=", val);
    }
    await q.execute();
  }
}
