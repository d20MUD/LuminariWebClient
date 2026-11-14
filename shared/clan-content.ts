/** Optional, bounded read-only extension to CLAN_PROGRESS v1. */
export type ClanServiceAction = { kind: string; id: string; token?: string; label: string; enabled: boolean; reasons: string[] }
export type ClanServiceRow = { id: string; name: string; details: string; actions: ClanServiceAction[] }
export type ClanServiceActive = { name: string; state: string; expires_at: number; progress?: number; required?: number; progress_label?: string; roster_count?: number; personal_credit?: number; personal_required?: number; objectives?: { progress: number; required: number; targets: string[] }[] }
export type ClanServiceSection = { family?: string; ready: boolean; reasons: string[]; notes: string[]; actions: ClanServiceAction[]; choices: ClanServiceRow[]; active?: ClanServiceActive; preview?: { summary: string; expires_at: number; actions: ClanServiceAction[] }; claims?: { uid: string; state: string; expires_at: number; actions: ClanServiceAction[] }[] }
export type ClanContent = { context_ready: boolean; reason?: string; contracts: ClanServiceSection[]; expedition?: ClanServiceSection; quartermaster?: ClanServiceSection; notes: string[] }
const serviceUid = /^(?!0{32}$)[0-9a-f]{32}$/
const slug = /^[a-z0-9][a-z0-9-]{0,31}$/
/** Every command verb is fixed here; labels, amounts and report text cannot become commands. */
export function clanServiceCommand(a: ClanServiceAction): string | null {
  const simple: Record<string, string> = { delivery_list: 'clan deliveries list', delivery_active: 'clan deliveries active', delivery_retry: 'clan deliveries retry', delivery_turnin: 'clan deliveries turnin', expedition_list: 'clan expeditions list', expedition_active: 'clan expeditions active', expedition_claims: 'clan expeditions claims', quartermaster_list: 'clan quartermaster list', clan_status: 'clan progress' }
  if (Object.hasOwn(simple, a.kind)) return a.id === '' ? simple[a.kind] : null
  for (const family of ['gathering', 'bounty']) {
    for (const verb of ['list', 'active', 'retry']) if (a.kind === `${family}_${verb}`) return a.id === '' ? `clan contracts ${family} ${verb}` : null
    if (a.kind === `${family}_accept`) return slug.test(a.id) ? `clan contracts ${family} accept ${a.id}` : null
  }
  if (a.kind === 'delivery_accept') return slug.test(a.id) ? `clan deliveries accept ${a.id}` : null
  if (a.kind === 'delivery_confirm') return serviceUid.test(a.id) ? `clan deliveries confirm ${a.id}` : null
  if (a.kind === 'expedition_create') return slug.test(a.id) ? `clan expeditions create ${a.id}` : null
  for (const verb of ['join', 'claim']) if (a.kind === `expedition_${verb}`) return serviceUid.test(a.id) ? `clan expeditions ${verb} ${a.id}` : null
  if (a.kind === 'quartermaster_buy') return slug.test(a.id) ? `clan quartermaster buy ${a.id}` : null
  if (a.kind === 'quartermaster_confirm') return slug.test(a.id) && serviceUid.test(a.token ?? '') ? `clan quartermaster confirm ${a.id} ${a.token}` : null
  return null
}
function obj(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(); return v as Record<string, unknown> }
function txt(v: unknown, max = 480): string { if (typeof v !== 'string' || v.length > max) throw Error(); return v }
function num(v: unknown): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw Error(); return v }
function bool(v: unknown): boolean { if (typeof v !== 'boolean') throw Error(); return v }
function arr<T>(v: unknown, max: number, f: (v: unknown) => T): T[] { if (!Array.isArray(v) || v.length > max) throw Error(); return v.map(f) }
const strings = (v: unknown) => arr(v, 16, (s) => txt(s))
function actions(v: unknown): ClanServiceAction[] { return arr(v, 8, (v) => { const o = obj(v); const a = { kind: txt(o.kind, 40), id: txt(o.id, 32), token: o.token === undefined ? undefined : txt(o.token, 32), label: txt(o.label, 120), enabled: bool(o.enabled), reasons: strings(o.reasons) }; if (!clanServiceCommand(a) || a.enabled && a.reasons.length) throw Error(); return a }) }
function section(v: unknown): ClanServiceSection {
  const o = obj(v), s: ClanServiceSection = { ready: bool(o.ready), family: o.family === undefined ? undefined : txt(o.family, 16), reasons: strings(o.reasons), notes: strings(o.notes), actions: actions(o.actions), choices: arr(o.choices, 32, (v) => { const c = obj(v); return { id: txt(c.id, 32), name: txt(c.name, 120), details: txt(c.details), actions: actions(c.actions) } }) }
  if (o.active && s.ready) { const a = obj(o.active); s.active = { name: txt(a.name, 120), state: txt(a.state, 32), expires_at: num(a.expires_at) }; for (const key of ['progress', 'required', 'roster_count', 'personal_credit', 'personal_required'] as const) if (a[key] !== undefined) s.active[key] = num(a[key]); if (a.progress_label !== undefined) s.active.progress_label = txt(a.progress_label); if (a.objectives !== undefined) s.active.objectives = arr(a.objectives, 3, (v) => { const q = obj(v); return { progress: num(q.progress), required: num(q.required), targets: arr(q.targets, 8, (s) => txt(s)) } }) }
  if (o.preview && s.ready) { const p = obj(o.preview); s.preview = { summary: txt(p.summary), expires_at: num(p.expires_at), actions: actions(p.actions) } }
  if (o.claims && s.ready) s.claims = arr(o.claims, 16, (v) => { const c = obj(v); const id = txt(c.uid, 32); if (!serviceUid.test(id)) throw Error(); return { uid: id, state: txt(c.state, 32), expires_at: num(c.expires_at), actions: actions(c.actions) } })
  return s
}
export function parseClanContent(v: unknown): ClanContent | undefined {
  try { const o = obj(v); if (o.version !== 1) return; const context_ready = bool(o.context_ready); if (!context_ready) return { context_ready, reason: o.reason === undefined ? 'Waiting for current character context.' : txt(o.reason), contracts: [], notes: [] }; const contracts = arr(o.contracts, 3, section); if (contracts.length !== 3 || contracts.map((s) => s.family).join(',') !== 'delivery,gathering,bounty') return; return { context_ready, contracts, expedition: section(o.expedition), quartermaster: section(o.quartermaster), notes: strings(o.notes) } } catch { return }
}
