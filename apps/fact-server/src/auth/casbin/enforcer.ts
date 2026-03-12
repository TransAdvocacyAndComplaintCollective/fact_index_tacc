/**
 * Casbin Enforcer initialization with domain RBAC + REST route matching.
 * 
 * Domain RBAC allows the same user to have different roles in different guilds.
 * Example: User 123 is "admin" in guild A but "member" in guild B.
 * 
 * Uses keyMatch2 for route pattern matching (e.g., /api/guilds/:guildId/*) and 
 * regexMatch for HTTP method matching (GET, POST, DELETE, etc.).
 */

import { newEnforcer, newModelFromString, type Enforcer } from "casbin";
import { getDb } from "../../../../../libs/db-core/src/dbClient.ts";
import { KyselyCasbinAdapter } from "./kyselyCasbinAdapter.ts";

/**
 * Domain RBAC Model with REST route matching
 * 
 * [request_definition]
 * r = sub, dom, obj, act
 *   sub: subject (user ID or Discord role, e.g., "user:123456" or "role:discord:987654321")
 *   dom: domain (guild ID, e.g., "987654321")
 *   obj: object/resource (REST path, e.g., "/api/guilds/:guildId/posts")
 *   act: action (HTTP method, e.g., "GET", or regex like "(GET)|(POST)")
 * 
 * [role_definition]
 * g = _, _, _
 *   Format: g, user:{discordUserId}, role:discord:{discordRoleId}, global
 *   Example: g, user:123456, role:discord:987654321, global
 */
const MODEL = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
// Allow either direct subject policies (r.sub == p.sub) OR role/group policies via g().
m = (r.sub == p.sub || g(r.sub, p.sub, r.dom)) && keyMatch2(r.obj, p.obj) && (p.act == "superuser" || regexMatch(r.act, p.act))
`.trim();

let _enforcerPromise: Promise<Enforcer> | null = null;

export async function getCasbinEnforcer(): Promise<Enforcer> {
  if (!_enforcerPromise) {
    _enforcerPromise = (async () => {
      const db = getDb();
      const adapter = new KyselyCasbinAdapter(db);
      const model = newModelFromString(MODEL);
      const e = await newEnforcer(model, adapter);

      console.log("[casbin] Enforcer initialized with domain RBAC model");
      return e;
    })();
  }
  return _enforcerPromise;
}
