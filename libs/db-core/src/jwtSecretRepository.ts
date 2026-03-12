import crypto from "node:crypto";
import { getDb } from "./dbClient.ts";

export type JwtSecretSlot = "old" | "current" | "next";

export type JwtSecretRow = {
  slot: JwtSecretSlot;
  secret: string;
  iatMs: number;
  expMs: number | null;
};

const ROTATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;

function generateSecret(): string {
  return crypto.randomBytes(48).toString("hex");
}

function rowToModel(row: any): JwtSecretRow {
  return {
    slot: row.slot as JwtSecretSlot,
    secret: String(row.secret),
    iatMs: Number(row.iat_ms),
    expMs: row.exp_ms == null ? null : Number(row.exp_ms),
  };
}

export async function ensureJwtSecrets(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  await db.transaction().execute(async (trx) => {
    const existing = await trx.selectFrom("jwt_hmac_secrets").selectAll().execute();
    const bySlot = new Map<JwtSecretSlot, JwtSecretRow>();
    for (const row of existing) {
      const slot = String((row as any).slot) as JwtSecretSlot;
      if (slot !== "old" && slot !== "current" && slot !== "next") continue;
      bySlot.set(slot, rowToModel(row));
    }

    const upsert = async (slot: JwtSecretSlot, secret: string, iatMs: number, expMs: number | null) => {
      await trx
        .insertInto("jwt_hmac_secrets")
        .values({
          slot,
          secret,
          iat_ms: iatMs,
          exp_ms: expMs,
        } as any)
        .onConflict((oc) => oc.column("slot").doUpdateSet({ secret, iat_ms: iatMs, exp_ms: expMs } as any))
        .execute();
    };

    if (!bySlot.has("current")) {
      await upsert("current", generateSecret(), now, null);
    }
    if (!bySlot.has("next")) {
      await upsert("next", generateSecret(), now, null);
    }
    if (!bySlot.has("old")) {
      await upsert("old", generateSecret(), now, now); // expired immediately
    }

    const current = bySlot.get("current") ?? (await trx.selectFrom("jwt_hmac_secrets").selectAll().where("slot", "=", "current").executeTakeFirstOrThrow().then(rowToModel));
    if (now - current.iatMs >= ROTATION_INTERVAL_MS) {
      const next = await trx.selectFrom("jwt_hmac_secrets").selectAll().where("slot", "=", "next").executeTakeFirstOrThrow();
      const nextModel = rowToModel(next);

      await upsert("old", current.secret, current.iatMs, now + OVERLAP_MS);
      await upsert("current", nextModel.secret, nextModel.iatMs, null);
      await upsert("next", generateSecret(), now, null);
    }

    // Clean up an expired old secret by replacing it (keeps three slots stable)
    const old = await trx.selectFrom("jwt_hmac_secrets").selectAll().where("slot", "=", "old").executeTakeFirst();
    if (old) {
      const oldModel = rowToModel(old);
      if (oldModel.expMs != null && oldModel.expMs <= now) {
        await upsert("old", generateSecret(), now, now); // keep expired placeholder
      }
    }
  });
}

export async function getJwtSecrets(): Promise<{
  current: JwtSecretRow;
  validForVerify: JwtSecretRow[];
}> {
  const db = getDb();
  const now = Date.now();

  await ensureJwtSecrets();

  const rows = await db.selectFrom("jwt_hmac_secrets").selectAll().execute();
  const parsed = rows
    .map(rowToModel)
    .filter((r) => r.slot === "old" || r.slot === "current" || r.slot === "next");

  const current = parsed.find((r) => r.slot === "current");
  if (!current) {
    throw new Error("jwt_secret_missing_current");
  }

  const validForVerify = parsed.filter((r) => {
    if (r.slot === "current") return true;
    if (r.slot === "old") return r.expMs != null && r.expMs > now;
    return false;
  });

  return { current, validForVerify };
}

