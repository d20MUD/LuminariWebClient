import { parseClanContent, type ClanContent } from './clan-content.js'
export type ClanSlot = { slot: number; enabled: boolean; replace_activation_uid: string; reasons: string[] }
export type ClanTier = { tier: number; unlock_level: number; cost_eighths: string; slots: ClanSlot[] }
export type ClanBuff = { family: number; name: string; category: string; active: boolean; cooling_down: boolean; tier: number; slot: number; activation_uid: string; expires_at: number; next_available_at: number; cancel: { enabled: boolean; reasons: string[] }; tiers: ClanTier[] }
export type ClanReady = {
  content?: ClanContent; version: 1; status: 'ready'; server_time: number; reason: string; character_id: string; buff_state_available: boolean; may_manage: boolean
  clan: { uid: string; name: string; level: number; xp_eighths: string; influence_eighths: string; revision: string; next_level_xp_eighths: string | null }
  favor: { eighths: string; standing: string; next_standing_eighths: string | null }
  slots_total: number; slots_used: number; combat_used: number
  next_unlocks: { level: number; name: string }[]; buffs: ClanBuff[]
  contribution: { week_ends_at: number; base_xp_eighths: string; full_xp_eighths: string; half_xp_eighths: string; favor_eighths: string; favor_cap_eighths: string; sources: { id: number; name: string; used: string; limit: number }[] }
}
export type ClanProgress = ClanReady | { version: 1; status: 'disabled' | 'non_member' | 'unavailable'; server_time: number; reason: string }
const uidPattern = /^(?!0{32}$)[0-9a-f]{32}$/
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('object'); return value as Record<string, unknown> }
function text(value: unknown, maximum = 240): string { if (typeof value !== 'string' || value.length > maximum) throw Error('text'); return value }
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw Error('number'); return value }
function decimal(value: unknown): string { if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > 9223372036854775807n) throw Error('decimal'); return value }
function nullableDecimal(value: unknown): string | null { return value === null ? null : decimal(value) }
function flag(value: unknown): boolean { if (typeof value !== 'boolean') throw Error('boolean'); return value }
function uid(value: unknown, empty = false): string { if (empty && value === '') return ''; const result = text(value, 32); if (!uidPattern.test(result)) throw Error('uid'); return result }
function list<T>(value: unknown, maximum: number, parse: (value: unknown) => T): T[] { if (!Array.isArray(value) || value.length > maximum) throw Error('array'); return value.map(parse) }
function lockReasons(value: unknown): string[] { return list(value, 16, (item) => text(item)) }
function choice(value: unknown): ClanSlot {
  const s = record(value), reasons = lockReasons(s.reasons), enabled = flag(s.enabled)
  if (enabled && reasons.length) throw Error('inconsistent permission')
  return { slot: integer(s.slot, 1, 3), enabled, replace_activation_uid: uid(s.replace_activation_uid, true), reasons }
}
function buff(value: unknown): ClanBuff {
  const b = record(value), cancel = record(b.cancel)
  const tiers = list(b.tiers, 3, (value) => { const t = record(value), slots = list(t.slots, 3, choice); if (slots.length !== 3 || new Set(slots.map((s) => s.slot)).size !== 3) throw Error('slots'); return { tier: integer(t.tier, 1, 3), unlock_level: integer(t.unlock_level, 1, 20), cost_eighths: decimal(t.cost_eighths), slots } })
  if (tiers.length !== 3 || new Set(tiers.map((t) => t.tier)).size !== 3) throw Error('tiers')
  const result = { family: integer(b.family, 1, 5), name: text(b.name, 120), category: text(b.category, 16), active: flag(b.active), cooling_down: flag(b.cooling_down), tier: integer(b.tier, 0, 3), slot: integer(b.slot, 0, 3), activation_uid: uid(b.activation_uid, true), expires_at: integer(b.expires_at), next_available_at: integer(b.next_available_at), cancel: { enabled: flag(cancel.enabled), reasons: lockReasons(cancel.reasons) }, tiers }
  if (!['combat', 'utility', 'growth', 'recovery', 'craft'].includes(result.category) || (result.active && (!result.activation_uid || !result.slot || !result.tier)) || (result.cancel.enabled && (!result.active || result.cancel.reasons.length))) throw Error('buff')
  return result
}
/** Unknown versions, malformed or oversized reports clear the view and actions. */
export function parseClanProgress(input: unknown): ClanProgress | null {
  try {
    if (typeof input === 'string') { if (input.length > 49152) return null; input = JSON.parse(input) }
    if (JSON.stringify(input)?.length > 49152) return null
    const o = record(input)
    if (o.version !== 1) return null
    const common = { version: 1 as const, server_time: integer(o.server_time), reason: text(o.reason) }
    if (o.status === 'disabled' || o.status === 'unavailable' || o.status === 'non_member') return { ...common, status: o.status }
    if (o.status !== 'ready') return null
    const c = record(o.clan), f = record(o.favor), q = record(o.contribution)
    const buffs = list(o.buffs, 5, buff)
    if (buffs.length !== 5 || new Set(buffs.map((b) => b.family)).size !== 5) return null
    const result: ClanReady = { ...common, status: 'ready', content: parseClanContent(o.content), character_id: decimal(o.character_id), buff_state_available: flag(o.buff_state_available), may_manage: flag(o.may_manage),
      clan: { uid: uid(c.uid), name: text(c.name, 120), level: integer(c.level, 1, 20), xp_eighths: decimal(c.xp_eighths), influence_eighths: decimal(c.influence_eighths), revision: decimal(c.revision), next_level_xp_eighths: nullableDecimal(c.next_level_xp_eighths) },
      favor: { eighths: decimal(f.eighths), standing: text(f.standing, 40), next_standing_eighths: nullableDecimal(f.next_standing_eighths) },
      slots_total: integer(o.slots_total, 0, 3), slots_used: integer(o.slots_used, 0, 3), combat_used: integer(o.combat_used, 0, 1), buffs,
      next_unlocks: list(o.next_unlocks, 6, (item) => { const u = record(item); return { level: integer(u.level, 1, 20), name: text(u.name, 160) } }),
      contribution: { week_ends_at: integer(q.week_ends_at), base_xp_eighths: decimal(q.base_xp_eighths), full_xp_eighths: decimal(q.full_xp_eighths), half_xp_eighths: decimal(q.half_xp_eighths), favor_eighths: decimal(q.favor_eighths), favor_cap_eighths: decimal(q.favor_cap_eighths), sources: list(q.sources, 6, (item) => { const s = record(item); return { id: integer(s.id, 1, 6), name: text(s.name, 80), used: decimal(s.used), limit: integer(s.limit, 0, 100000) } }) },
    }
    if (result.character_id === '0' || result.slots_used > result.slots_total || (!result.may_manage || !result.buff_state_available) && buffs.some((b) => b.cancel.enabled || b.tiers.some((t) => t.slots.some((s) => s.enabled)))) return null
    return result
  } catch { return null }
}
export function clanPoints(eighths: string): string { const n = BigInt(eighths); return `${n / 8n}${['', '.125', '.25', '.375', '.5', '.625', '.75', '.875'][Number(n % 8n)]}` }
// Strip server color/control sequences; React escapes the remaining plain text.
// eslint-disable-next-line no-control-regex
export function clanPlainText(value: string): string { return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/(?:\t|@)(?:\[[^\]]{0,30}\]|.)/g, '').replace(/[\x00-\x1f\x7f]/g, '') }
export type BuffIntent = { operation: string; clan: string; character: string; kind: 'activate' | 'cancel'; family: number; tier: number; slot: number; activation: string }
/** Build only fixed clan commands; server text never becomes command input. */
export function buffIntentCommand(input: unknown): string | null {
  try {
    const o = record(input), operation = uid(o.operation), clan = uid(o.clan)
    decimal(o.character)
    if (o.kind === 'cancel') return `clan buffs cancel ${uid(o.activation)} ${operation} ${clan}`
    if (o.kind !== 'activate') return null
    const family = integer(o.family, 1, 5), tier = integer(o.tier, 1, 3), slot = integer(o.slot, 1, 3), expected = uid(o.activation, true)
    return `clan buffs activate ${family} ${tier} ${slot} ${operation} ${clan}${expected ? ` ${expected}` : ''}`
  } catch { return null }
}
export function newBuffIntent(view: ClanReady, family: number, tier: number, slot: number, kind: 'activate' | 'cancel', operation: string): BuffIntent | null {
  const b = view.buffs.find((b) => b.family === family), choice = b?.tiers.find((t) => t.tier === tier)?.slots.find((s) => s.slot === slot)
  if (!view.may_manage || !view.buff_state_available || !b || (kind === 'cancel' ? !b.cancel.enabled : !choice?.enabled)) return null
  const intent: BuffIntent = { operation, clan: view.clan.uid, character: view.character_id, kind, family, tier, slot, activation: kind === 'cancel' ? b.activation_uid : choice!.replace_activation_uid }
  return buffIntentCommand(intent) ? intent : null
}
