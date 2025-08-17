import { newEnforcer, Util, Model, type Enforcer } from "casbin";
import SequelizeAdapter from "casbin-sequelize-adapter";
import psl from "psl";
import { IdentifierType, MATCH, ProviderType } from "./types.js";

const MODEL_TEXT = `
[request_definition]
 r = sub, obj, act, env

[policy_definition]
 p = priority, provider, id_type, id_value, match, min_clearance, http_method, http_pattern, lbac_op, start_ts, end_ts, eft

[role_definition]
 g = _, _

[policy_effect]
 e = priority(p_eft) || deny

[matchers]
 m =
  providerMatch(r.sub, p.provider) &&
  loginFactMatch(r.sub, p.id_type, p.id_value, p.match) &&
  cmp(r.sub.clearance, p.lbac_op, p.min_clearance) &&
  (
    (p.match == "keyMatch"   && keyMatch(r.obj, p.http_pattern)   && (!p.http_method || r.act == p.http_method)) ||
    (p.match == "keyMatch2"  && keyMatch2(r.obj, p.http_pattern)  && (!p.http_method || r.act == p.http_method)) ||
    (p.match == "keyMatch3"  && keyMatch3(r.obj, p.http_pattern)  && (!p.http_method || r.act == p.http_method)) ||
    (p.match == "regexMatch" && regexMatch(r.obj, p.http_pattern) && (!p.http_method || r.act == p.http_method))
  ) &&
  within(r.env.now, p.start_ts, p.end_ts)
`;

let enforcerPromise: Promise<Enforcer> | null = null;

function createModel(modelText: string): Model {
  const m = new Model();
  m.loadModelFromText(modelText);
  return m;
}

async function createAdapter() {
  return SequelizeAdapter.newAdapter({
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
  } as any);
}

const s = (v: unknown) => (v == null ? "" : String(v));

function getBaseDomain(host: string): string {
  const parsed = psl.parse(host);
  return typeof parsed === "object" && "domain" in parsed && (parsed as any).domain ? (parsed as any).domain : host;
}

function isSubdomain(base: string, candidate: string): boolean {
  const baseHost = s(base).toLowerCase();
  const candidateHost = s(candidate).toLowerCase();
  return candidateHost !== baseHost && candidateHost.endsWith("." + baseHost);
}

function cmp(left: number, op: string, right: number): boolean {
  switch (op) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "==":
      return left === right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
}



function valueByIdentifier(sub: any, idType?: IdentifierType): string {
  if (idType == null) return "";
  if (sub?.identifiers && typeof sub.identifiers === "object") {
    const k = String(idType);
    if (k in sub.identifiers) return s(sub.identifiers[k]);
  }
  const k = String(idType).toLowerCase();
  return s(sub?.[k]);
}

function loginFactMatch(sub: any, idType?: IdentifierType, idValue?: unknown, match?: MATCH): boolean {
  if (idType == null || match == null) return true;
  const rv = s(valueByIdentifier(sub, idType));
  const pv = s(idValue);
  switch (match) {
    case MATCH.HASH:
      return pv.length > 0 && rv.length > 0 && pv === rv;
    case MATCH.DOMAIN:
      return getBaseDomain(pv) === getBaseDomain(rv);
    case MATCH.SUBDOMAIN:
      return isSubdomain(pv, rv);
    case MATCH.SUFFIX:
      return rv.endsWith(pv);
    case MATCH.PREFIX:
      return rv.startsWith(pv);
    case MATCH.EXACT:
      return pv === rv;
    case MATCH.INCLUDE:
      return rv.includes(pv);
    case MATCH.EXCLUDE:
      return !rv.includes(pv);
    default:
      return true;
  }
}

export async function getEnforcer(): Promise<Enforcer> {
  if (!enforcerPromise) {
    enforcerPromise = (async () => {
      const model = createModel(MODEL_TEXT);
      const adapter = await createAdapter();
      const e = await newEnforcer(model, adapter);
      e.addFunction("cmp", cmp);
      return e;
    })();
  }
  return enforcerPromise;
}

export type { Enforcer } from "casbin";
