import type { MudValue } from '../shared/mud.ts'

export type CreationChoice = { value: string; label: string; description: string; blockedReason?: string; alignment?: string; alignmentGroup?: 'good' | 'neutral' | 'evil'; adjustments?: { ability: string; modifier: number }[] }
export type CreationBackground = { name: string; description: string; ability: string; skills: { name: string; bonus: number }[] }
export type CreationStep = {
  id: string; active: boolean; canBack: boolean; step: string; state: number; title: string; name: string;
  deity?: { name: string; pantheon: string; alignment: string; portfolio: string; description: string }; homeland?: { name: string; description: string; language: string }; guidance?: { description: string; examples: string[] }; background?: CreationBackground; body: string; truncated: boolean; choices: CreationChoice[]; descriptionPreview?: string; editorText?: string; editorMaxBytes?: number; editorBusy?: boolean; editorError?: boolean
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
    return [{ value: item.value, label: item.label, description: typeof item.description === 'string' ? item.description : '', alignment: typeof item.alignment === 'string' ? item.alignment : undefined, alignmentGroup: item.alignmentGroup === 'good' || item.alignmentGroup === 'neutral' || item.alignmentGroup === 'evil' ? item.alignmentGroup : undefined, blockedReason: typeof item.blockedReason === 'string' && item.blockedReason.trim() ? item.blockedReason : undefined, adjustments: Array.isArray(item.adjustments) ? item.adjustments.flatMap((value) => {
      if (!value || typeof value !== 'object') return []
      const adjustment = value as Record<string, unknown>
      return typeof adjustment.ability === 'string' && typeof adjustment.modifier === 'number' && Number.isFinite(adjustment.modifier) ? [{ ability: adjustment.ability, modifier: adjustment.modifier }] : []
    }) : undefined }]
  })
  return { id: record.id, active: record.active, canBack: record.canBack === true, step: record.step, state: typeof record.state === 'number' ? record.state : -1,
    title: typeof record.title === 'string' ? record.title : 'Character creation', name: typeof record.name === 'string' ? record.name : '',
    editorText: typeof record.editorText === 'string' ? record.editorText : undefined,
    editorMaxBytes: typeof record.editorMaxBytes === 'number' ? record.editorMaxBytes : undefined,
    editorBusy: record.editorBusy === true, editorError: record.editorError === true,
    descriptionPreview: typeof record.descriptionPreview === 'string' ? record.descriptionPreview : undefined,
    deity: parseCreationDeity(record.deity),
    homeland: parseCreationHomeland(record.homeland),
    guidance: parseCreationGuidance(record.guidance),
    background: parseCreationBackground(record.background),
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

function parseCreationBackground(value: unknown): CreationBackground | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const details = value as Record<string, unknown>
  if (typeof details.name !== 'string' || typeof details.description !== 'string' || typeof details.ability !== 'string' || !Array.isArray(details.skills) || details.skills.length !== 2) return undefined
  const skills: CreationBackground['skills'] = []
  for (const value of details.skills) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const skill = value as Record<string, unknown>
    if (typeof skill.name !== 'string' || typeof skill.bonus !== 'number' || !Number.isSafeInteger(skill.bonus)) return undefined
    skills.push({ name: skill.name, bonus: skill.bonus })
  }
  return { name: details.name, description: details.description, ability: details.ability, skills }
}

function parseCreationGuidance(value: unknown): CreationStep['guidance'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const guidance = value as Record<string, unknown>
  if (typeof guidance.description !== 'string' || !Array.isArray(guidance.examples) || !guidance.examples.every((item) => typeof item === 'string')) return undefined
  return { description: guidance.description, examples: guidance.examples }
}

function parseCreationHomeland(value: unknown): CreationStep['homeland'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const homeland = value as Record<string, unknown>
  if (typeof homeland.name !== 'string' || typeof homeland.description !== 'string' || typeof homeland.language !== 'string') return undefined
  return { name: homeland.name, description: homeland.description, language: homeland.language }
}

function parseCreationDeity(value: unknown): CreationStep['deity'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const deity = value as Record<string, unknown>
  if (typeof deity.name !== 'string' || typeof deity.pantheon !== 'string' || typeof deity.alignment !== 'string' || typeof deity.portfolio !== 'string' || typeof deity.description !== 'string') return undefined
  return { name: deity.name, pantheon: deity.pantheon, alignment: deity.alignment, portfolio: deity.portfolio, description: deity.description }
}
