import { newEnforcer, newModel } from 'casbin';
import { Subject } from 'typeorm/persistence/Subject.js';

// Wire custom helpers
function anyLoginFact(sub: Subject,
  provider?: string,
  idType?: string,
  match?: string,
  value?: string,
  has?: boolean): boolean {

  const facts = (sub as any)?.loginFacts ?? [];
  return facts.some(f => {
    // provider undefined in policy means "must be missing"
    const providerOK = (provider === undefined || provider === '' )
      ? (f.provider === undefined)
      : (f.provider === (provider as any));

    const typeOK = idType ? f.type === (idType as any) : true;
    const hasOK = (has === undefined) ? true : f.has === has;

    const valueOK = (() => {
      if (!value) return true;
      const v = f.value ?? '';
      switch (match) {
        case 'plaintext': return v === value;
        case 'domain':    return v.split('@')[1] === value;
        case 'subdomain': return v.endsWith(`.${value}`) || v === value;
        case 'prefix':    return v.startsWith(value);
        case 'suffix':    return v.endsWith(value);
        case 'HASH':      return f.match === 'HASH' && v === value;
        case 'HASH_DENY': return f.match === 'HASH_DENY' && v === value;
        default:          return v === value; // safe default
      }
    })();

    return providerOK && typeOK && hasOK && valueOK;
  });
}

function clearanceOK(sub: Subject,
  requiredLabel: number,
  compareMode: 'EQUAL' | 'DOMINATE' | 'STRICT' = 'DOMINATE',
  act?: string): boolean {

  // Optionally look up an action-specific pseudoClearance on the subject:
  const pseudo = (sub as any)?.action?.find((a: any) => a.type === act)?.pseudoClearance;
  const label = (pseudo ?? (sub as any).clearance ?? 0) as number;

  switch (compareMode) {
    case 'EQUAL':    return label === requiredLabel;
    case 'STRICT':   return label > requiredLabel;
    case 'DOMINATE':
    default:         return label >= requiredLabel;
  }
}

async function buildEnforcer() {
  const m = newModel();
  m.addDef('r', 'r', 'sub, obj, act');
  m.addDef('p', 'p', 'project, subProject, task, subTask, requiredLabel, compareMode, provider, idType, match, value, has, eft, priority');
  m.addDef('e', 'e', 'priority(p_eft)');
  m.addDef('m', 'm',
    'keyMatch2(r.obj.project, p.project) && ' +
    'keyMatch2(r.obj.subProject, p.subProject) && ' +
    'keyMatch2(r.obj.task, p.task) && ' +
    'keyMatch2(r.obj.subTask, p.subTask) && ' +
    'anyLoginFact(r.sub, p.provider, p.idType, p.match, p.value, p.has) && ' +
    'clearanceOK(r.sub, p.requiredLabel, p.compareMode, r.act)'
  );

  const e = await newEnforcer(m);
  // Register custom funcs
  e.addFunction('anyLoginFact', anyLoginFact as any);
  e.addFunction('clearanceOK', clearanceOK as any);

  return e;
}
