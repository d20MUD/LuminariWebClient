import { ClanServices } from './ClanServices'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buffIntentCommand, clanPlainText, clanPoints, newBuffIntent, parseClanProgress } from '../shared/clan-progress.ts'
import type { BuffIntent, ClanBuff, ClanReady } from '../shared/clan-progress.ts'

function deadline(value: number) { return value ? new Date(value * 1000).toLocaleString() : 'Available' }
function readPending(key: string): BuffIntent | null {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null'); return buffIntentCommand(value) ? value as BuffIntent : null } catch { return null }
}
function writePending(key: string, value: BuffIntent | null) {
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); return true } catch { return false }
}
function operationId() { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('') }

export function ClanPanel({ value, connected, receivedAt = 0, onAction }: { value: unknown; connected: boolean; receivedAt?: number; onAction: (command: string) => void }) {
  const view = useMemo(() => parseClanProgress(value), [value])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  if (!connected) return <p className="clan-status">Connect to view current clan progression.</p>
  if (!view) return <p className="clan-status">Waiting for a supported clan report.</p>
  if (view.status !== 'ready') return <p className="clan-status" role="status">{clanPlainText(view.reason)}</p>
  return <ClanDetails key={`${view.character_id}:${view.clan.uid}`} view={view} fresh={now - receivedAt < 10000 && now >= receivedAt} onAction={onAction} />
}

function ClanDetails({ view, fresh, onAction }: { view: ClanReady; fresh: boolean; onAction: (command: string) => void }) {
  const storageKey = `clan-buff:${view.character_id}:${view.clan.uid}`
  const [pending, setPending] = useState(() => { const p = readPending(storageKey); return p?.clan === view.clan.uid && p.character === view.character_id ? p : null })
  const pendingRef = useRef(pending)
  const [review, setReview] = useState<BuffIntent | null>(null)
  const [error, setError] = useState('')
  const recorded = pending?.kind === 'activate' && view.buffs.some((b) => b.activation_uid === pending.operation)
  function choose(family: number, tier: number, slot: number, kind: 'activate' | 'cancel') {
    if (!fresh || pendingRef.current) return
    try { setReview(newBuffIntent(view, family, tier, slot, kind, operationId())); setError('') } catch { setError('A safe operation identity could not be created.') }
  }
  function confirm() {
    if (!review || !fresh || pendingRef.current) return
    // Revalidate against the newest report after the review dialog was opened.
    const current = newBuffIntent(view, review.family, review.tier, review.slot, review.kind, review.operation)
    if (!current || current.activation !== review.activation) { setReview(null); setError('The buff changed. Review the current choices again.'); return }
    const command = buffIntentCommand(current)
    if (!command || !writePending(storageKey, current)) { setError('Safe retry storage is unavailable; nothing was sent.'); return }
    pendingRef.current = current; setPending(current); setReview(null); onAction(command)
  }
  const reviewedBuff = review && view.buffs.find((b) => b.family === review.family)
  const price = reviewedBuff?.tiers.find((t) => t.tier === review?.tier)?.cost_eighths ?? '0'
  const nextUnlocks = [...view.next_unlocks].sort((a, b) => a.level - b.level)
  return <div className="clan-panel">
    <h3>{clanPlainText(view.clan.name)}</h3>
    <dl className="clan-balances">
      <dt>Clan level</dt><dd>{view.clan.level}</dd>
      <dt>Lifetime Influence</dt><dd>{clanPoints(view.clan.xp_eighths)}{view.clan.next_level_xp_eighths !== null ? ` / ${clanPoints(view.clan.next_level_xp_eighths)}` : ' (maximum)'}</dd>
      <dt>Spendable Influence</dt><dd>{clanPoints(view.clan.influence_eighths)}</dd>
      <dt>Your Favor</dt><dd>{clanPoints(view.favor.eighths)} · {clanPlainText(view.favor.standing)}</dd>
    </dl>
    <p className="clan-note">Favor is cumulative and is never spent.</p>
    {view.favor.next_standing_eighths !== null ? <p>Next standing at {clanPoints(view.favor.next_standing_eighths)} Favor.</p> : null}
    {nextUnlocks.length ? <details><summary>Next unlocks</summary><ul>{nextUnlocks.map((u) => <li key={u.name}>Level {u.level}: {clanPlainText(u.name)}</li>)}</ul></details> : <p>All initial buff tiers are unlocked.</p>}
    <details><summary>Your account this week</summary>
      <p>Base contribution: {clanPoints(view.contribution.base_xp_eighths)}. Full credit through {clanPoints(view.contribution.full_xp_eighths)}; half credit through {clanPoints(view.contribution.half_xp_eighths)}.</p>
      <p>Favor earned: {clanPoints(view.contribution.favor_eighths)} / {clanPoints(view.contribution.favor_cap_eighths)}. Resets {deadline(view.contribution.week_ends_at)}.</p>
      <ul>{view.contribution.sources.map((s) => <li key={s.id}>{clanPlainText(s.name)}: {s.used} / {s.limit}</li>)}</ul>
    </details>
    <ClanServices content={view.content} serverTime={view.server_time} fresh={fresh} onAction={onAction} />
    <h4>Buffs · {view.slots_used}/{view.slots_total} slots · {view.combat_used}/1 combat</h4>
    {!fresh ? <p role="status">Waiting for a fresh clan report. Actions are paused.</p> : null}
    {!view.buff_state_available ? <p role="status">Buff storage is unavailable; saved effects and timers cannot be displayed safely.</p> : null}
    {!view.may_manage ? <p className="clan-note">Only the clan leader or a delegated rank can manage buffs.</p> : null}
    {pending ? <div className="clan-pending" role="status">
      <p>{recorded ? 'The operation is recorded.' : 'Operation submitted. Check the command result; retries reuse the same receipt.'}</p>
      <button type="button" onClick={() => { const command = buffIntentCommand(pending); if (command) onAction(command) }}>Retry same operation</button>
      <button type="button" onClick={() => { if (writePending(storageKey, null)) { pendingRef.current = null; setPending(null) } }}>Clear after checking result</button>
    </div> : null}
    {view.buff_state_available ? view.buffs.map((b) => <BuffCard key={b.family} buff={b} fresh={fresh} busy={!!pending} onChoose={choose} />) : null}
    {review && reviewedBuff ? <section className="clan-review" aria-label="Confirm buff change">
      <p>{review.kind === 'cancel' ? `Cancel ${clanPlainText(reviewedBuff.name)}? There is no refund and its cooldown remains.` : `${review.activation ? 'Replace the selected slot with' : 'Activate'} ${clanPlainText(reviewedBuff.name)} tier ${review.tier} in slot ${review.slot} for ${clanPoints(price)} Influence?${review.activation ? ' The replaced buff is canceled without refund.' : ''}`}</p>
      <button type="button" disabled={!fresh || !!pending} onClick={confirm}>Confirm {review.kind === 'cancel' ? 'cancellation' : 'activation'}</button>
      <button type="button" onClick={() => setReview(null)}>Back</button>
    </section> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>
}

function BuffCard({ buff, fresh, busy, onChoose }: { buff: ClanBuff; fresh: boolean; busy: boolean; onChoose: (family: number, tier: number, slot: number, kind: 'activate' | 'cancel') => void }) {
  const [tierNumber, setTier] = useState(1), [slotNumber, setSlot] = useState(1)
  const tier = buff.tiers.find((t) => t.tier === tierNumber)!, slot = tier.slots.find((s) => s.slot === slotNumber)!
  return <article className="clan-buff">
    <h5>{clanPlainText(buff.name)} <small>{buff.category}</small></h5>
    <p>{buff.active ? `Tier ${buff.tier} · slot ${buff.slot} · active until ${deadline(buff.expires_at)}` : 'Inactive'}{buff.cooling_down ? ` · next use ${deadline(buff.next_available_at)}` : ''}</p>
    <div className="clan-choices">
      <label>Tier<select value={tierNumber} onChange={(e) => setTier(Number(e.target.value))}>{buff.tiers.map((t) => <option key={t.tier} value={t.tier}>{t.tier} · level {t.unlock_level} · {clanPoints(t.cost_eighths)} Influence</option>)}</select></label>
      <label>Slot<select value={slotNumber} onChange={(e) => setSlot(Number(e.target.value))}>{tier.slots.map((s) => <option key={s.slot} value={s.slot}>{s.slot}{s.replace_activation_uid ? ' (occupied)' : ''}</option>)}</select></label>
    </div>
    <p className="clan-lock" id={`clan-lock-${buff.family}`}>{slot.reasons.map(clanPlainText).join(' ')}</p>
    <button type="button" disabled={!fresh || busy || !slot.enabled} aria-describedby={`clan-lock-${buff.family}`} onClick={() => onChoose(buff.family, tierNumber, slotNumber, 'activate')}>{slot.replace_activation_uid ? 'Review replacement' : 'Review activation'}</button>
    {buff.active ? <><button type="button" disabled={!fresh || busy || !buff.cancel.enabled} onClick={() => onChoose(buff.family, buff.tier, buff.slot, 'cancel')}>Review cancellation</button><p className="clan-lock">{buff.cancel.reasons.map(clanPlainText).join(' ')}</p></> : null}
  </article>
}
