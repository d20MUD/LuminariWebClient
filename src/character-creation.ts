import type { MudValue } from '../shared/mud.ts'

export type CreationChoice = { value: string; label: string; description: string }
export type CreationStep = {
  id: string; active: boolean; canBack: boolean; step: string; state: number; title: string; name: string;
  body: string; truncated: boolean; choices: CreationChoice[]
}

export function parseCreationStep(value: MudValue | undefined): CreationStep | null {
  let parsed: unknown = value
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { return null } }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.active !== 'boolean' || typeof record.body !== 'string' || typeof record.step !== 'string' || !Array.isArray(record.choices)) return null
  const choices = record.choices.flatMap((choice): CreationChoice[] => {
    if (!choice || typeof choice !== 'object') return []
    const item = choice as Record<string, unknown>
    if (typeof item.value !== 'string' || /[\r\n]/.test(item.value) || typeof item.label !== 'string') return []
    return [{ value: item.value, label: item.label, description: typeof item.description === 'string' ? item.description : '' }]
  })
  return { id: record.id, active: record.active, canBack: record.canBack === true, step: record.step, state: typeof record.state === 'number' ? record.state : -1,
    title: typeof record.title === 'string' ? record.title : 'Character creation', name: typeof record.name === 'string' ? record.name : '',
    body: record.body, truncated: record.truncated === true, choices }
}

const PORTRAIT_ALIASES: Record<string, string> = {
  warrior: 'fighter', berserker: 'barbarian', dragonrider: 'dragon-rider', gnome: 'gnomes', 'gully-dwarf': 'gully-dwarf-v5',
  hobgoblin: 'hobgoblin-v2', kender: 'kender-v4', 'weapon-master': 'weapon-master-v2',
  baaz: 'baaz-draconian', aurak: 'aurak-draconian', bozak: 'bozak-draconian', kapak: 'kapak-draconian', sivak: 'sivak-draconian',
}
export function creationPortrait(step: string, label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `/creation/${step === 'race' ? 'races' : 'classes'}/${PORTRAIT_ALIASES[slug] ?? slug}.webp`
}

export function creationPromptChoices(body: string): CreationChoice[] {
  const clean = body.replace(new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, 'g'), '').replace(/(?:\\t|\t|\^)[A-Za-z()+_=*-]/g, '')
  const seen = new Set<string>()
  return clean.split(/\r?\n/).flatMap((line): CreationChoice[] => {
    const match = /^\s*(?:\[([0-9]+|[A-Za-z])\]|\(([0-9]+|[A-Za-z])\)|([0-9]+|[A-Za-z])[).:-])\s*(\S.{0,160})$/.exec(line)
    if (!match) return []
    const value = match[1] ?? match[2] ?? match[3]
    if (seen.has(value)) return []
    seen.add(value)
    return [{ value, label: match[4], description: '' }]
  })
}


export function creationNameGuidance(body: string): { before: string; criteria: string[]; after: string } {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const numbered = lines.map((line, index) => ({ index, match: /^\s*\d+[.)]\s*(\S.*)$/.exec(line) })).filter((entry) => entry.match !== null)
  if (!numbered.length) return { before: body, criteria: [], after: '' }
  return {
    before: lines.slice(0, numbered[0].index).join('\n'),
    criteria: numbered.map((entry) => entry.match![1]),
    after: lines.slice(numbered.at(-1)!.index + 1).join('\n'),
  }
}
