import { useState } from 'react'
import { clanServiceCommand, type ClanContent, type ClanServiceAction, type ClanServiceSection } from '../shared/clan-content'
import { clanPlainText } from '../shared/clan-progress'
const date = (n: number) => new Date(n * 1000).toLocaleString()
function Actions({ actions, fresh, onAction }: { actions: ClanServiceAction[]; fresh: boolean; onAction: (command: string) => void }) {
  const [review, setReview] = useState<string | null>(null)
  return <div className="clan-service-actions">{actions.map((a) => {
    const command = clanServiceCommand(a), confirmation = ['delivery_confirm', 'quartermaster_confirm', 'expedition_claim'].includes(a.kind)
    const enabled = fresh && a.enabled && !!command
    return <div key={`${a.kind}:${a.id}`}><button disabled={!enabled} onClick={() => { if (!enabled || !command) return; if (confirmation && review !== command) { setReview(command); return } setReview(null); onAction(command) }}>{confirmation && review === command ? `Confirm: ${clanPlainText(a.label)}` : clanPlainText(a.label)}</button>{a.reasons.map((r, i) => <small key={i}> {clanPlainText(r)}</small>)}</div>
  })}</div>
}
function Service({ title, section: s, fresh, serverTime, onAction }: { title: string; section?: ClanServiceSection; fresh: boolean; serverTime: number; onAction: (command: string) => void }) {
  if (!s) return null
  const props = { fresh: fresh && s.ready, onAction }
  return <details className="clan-service"><summary>{title}</summary>
    {s.reasons.map((r, i) => <p key={i}>{clanPlainText(r)}</p>)}
    {s.active && <article><h5>{clanPlainText(s.active.name)}</h5><p>{clanPlainText(s.active.state)} · Deadline {date(s.active.expires_at)}</p>
      {s.active.progress !== undefined && <p>{clanPlainText(s.active.progress_label ?? 'Progress')}: {s.active.progress}/{s.active.required}</p>}
      {s.active.roster_count !== undefined && <p>Enrolled: {s.active.roster_count}. Your credited events: {s.active.personal_credit}/{s.active.personal_required} required, plus final-event participation.</p>}
      {s.active.objectives?.map((o, i) => <p key={i}>Objective {i + 1}: {o.progress}/{o.required} · {o.targets.map(clanPlainText).join(', ')}</p>)}
    </article>}
    <Actions actions={s.actions} {...props} />
    {s.preview && <article><p>{clanPlainText(s.preview.summary)} Expires {date(s.preview.expires_at)}.</p><Actions actions={s.preview.actions} fresh={props.fresh && s.preview.expires_at > serverTime} onAction={onAction} /></article>}
    {s.choices.map((c) => <article key={c.id}><h5>{clanPlainText(c.name)}</h5><p>{clanPlainText(c.details)}</p><Actions actions={c.actions} {...props} /></article>)}
    {s.claims?.map((c) => <article key={c.uid}><p>Expedition reward: {clanPlainText(c.state)} · Deadline {date(c.expires_at)}</p><Actions actions={c.actions} {...props} /></article>)}
    {s.notes.map((n, i) => <p key={i}>{clanPlainText(n)}</p>)}
  </details>
}
export function ClanServices({ content, fresh, serverTime = 0, onAction }: { content?: ClanContent; fresh: boolean; serverTime?: number; onAction: (command: string) => void }) {
  if (!content?.context_ready) return <p>{clanPlainText(content?.reason ?? 'Service details are unavailable; use clan commands in text.')}</p>
  return <section aria-label="Clan services"><h4>Contracts, expeditions and quartermaster</h4>
    {content.contracts.map((s) => <Service key={s.family} title={s.family === 'delivery' ? 'Deliveries' : s.family === 'gathering' ? 'Gathering contracts' : 'Bounty contracts'} section={s} fresh={fresh} serverTime={serverTime} onAction={onAction} />)}
    <Service title="Expeditions" section={content.expedition} fresh={fresh} serverTime={serverTime} onAction={onAction} />
    <Service title="Quartermaster" section={content.quartermaster} fresh={fresh} serverTime={serverTime} onAction={onAction} />
    {content.notes.map((n, i) => <p key={i}>{clanPlainText(n)}</p>)}
  </section>
}
