export type MudValue =
  | string
  | number
  | boolean
  | null
  | MudValue[]
  | {
      [key: string]: MudValue
    }

export type GraphicMapSpecialExit = 'u' | 'd' | 'i' | 'o'

export type GraphicMapRoom = {
  x?: number
  y?: number
  v?: number
  s?: number
  i?: number
  sp?: string
  c?: number
}

export type GraphicMapData = {
  ver?: number
  radius?: number
  rooms?: GraphicMapRoom[]
}

export const WILDERNESS_ROOM_VNUM_START = 1000000
export const WILDERNESS_ROOM_VNUM_END = 1009999

export function isWildernessRoomVnum(roomVnum?: number) {
  return (
    typeof roomVnum === 'number' &&
    Number.isFinite(roomVnum) &&
    roomVnum >= WILDERNESS_ROOM_VNUM_START &&
    roomVnum <= WILDERNESS_ROOM_VNUM_END
  )
}

export interface MudState {
  characterName?: string
  title?: string
  serverId?: string
  serverTime?: number
  snippetVersion?: number
  level?: number
  race?: string
  className?: string
  health?: number
  healthMax?: number
  psp?: number
  pspMax?: number
  movement?: number
  movementMax?: number
  experience?: number
  experienceMax?: number
  experienceTnl?: number
  attackBonus?: number
  damageBonus?: number
  strength?: number
  dexterity?: number
  constitution?: number
  intelligence?: number
  wisdom?: number
  charisma?: number
  fortitude?: number
  reflex?: number
  willpower?: number
  armorClass?: number
  alignment?: string
  practice?: number
  money?: number
  bank?: number
  position?: string
  room?: MudValue
  roomName?: string
  areaName?: string
  roomVnum?: number
  roomExits?: string[]
  roomCoords?: {
    x?: number
    y?: number
    z?: number
  }
  roomTerrain?: string
  roomEnvironment?: string
  automap?: string
  minimap?: string
  graphicMap?: GraphicMapData
  wildernessGraphicMap?: GraphicMapData
  worldTime?: string
  actions?: MudValue
  affects?: MudValue
  cooldowns?: MudValue
  group?: MudValue
  questInfo?: MudValue
  opponentName?: string
  opponentHealth?: number
  opponentHealthMax?: number
  tankName?: string
  tankHealth?: number
  tankHealthMax?: number
  bacta?: number
  powerCells?: number
  ammoMain?: number
  ammoMainMax?: number
  ammoMainType?: string
  ammoOffhand?: number
  ammoOffhandMax?: number
  ammoOffhandType?: string
  actionStandard?: number
  actionMove?: number
  actionQuick?: number
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export const defaultMsdpVariables = {
  characterName: 'CHARACTER_NAME',
  title: 'TITLE',
  level: 'LEVEL',
  race: 'RACE',
  className: 'CLASS',
  health: 'HEALTH',
  healthMax: 'HEALTH_MAX',
  psp: 'PSP',
  pspMax: 'PSP_MAX',
  movement: 'MOVEMENT',
  movementMax: 'MOVEMENT_MAX',
  experience: 'EXPERIENCE',
  experienceMax: 'EXPERIENCE_MAX',
  experienceTnl: 'EXPERIENCE_TNL',
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
  fortitude: 'FORTITUDE',
  reflex: 'REFLEX',
  willpower: 'WILLPOWER',
  position: 'POSITION',
  attackBonus: 'ATTACK_BONUS',
  armorClass: 'AC',
  alignment: 'ALIGNMENT',
  money: 'MONEY',
  bank: 'BANK',
  minimap: 'MINIMAP',
  graphicMap: 'GRAPHIC_MAP',
  wildernessGraphicMap: 'WILDERNESS_GRAPHIC_MAP',
  affects: 'AFFECTS',
  cooldowns: 'COOLDOWNS',
  group: 'GROUP',
  questInfo: 'QUEST_INFO',
  opponentName: 'OPPONENT_NAME',
  opponentHealth: 'OPPONENT_HEALTH',
  opponentHealthMax: 'OPPONENT_HEALTH_MAX',
  tankName: 'TANK_NAME',
  tankHealth: 'TANK_HEALTH',
  tankHealthMax: 'TANK_HEALTH_MAX',
  bacta: 'BACTA',
  powerCells: 'POWER_CELLS',
  ammoMain: 'AMMO_MAIN',
  ammoMainMax: 'AMMO_MAIN_MAX',
  ammoMainType: 'AMMO_MAIN_TYPE',
  ammoOffhand: 'AMMO_OFFHAND',
  ammoOffhandMax: 'AMMO_OFFHAND_MAX',
  ammoOffhandType: 'AMMO_OFFHAND_TYPE',
  actionStandard: 'ACTION_STANDARD',
  actionMove: 'ACTION_MOVE',
  actionQuick: 'ACTION_QUICK',
} as const

export const starWarsMsdpVariableKeys = [
  'cooldowns',
  'bacta',
  'powerCells',
  'ammoMain',
  'ammoMainMax',
  'ammoMainType',
  'ammoOffhand',
  'ammoOffhandMax',
  'ammoOffhandType',
  'actionStandard',
  'actionMove',
  'actionQuick',
] as const

type MovementCommandDefinition = {
  command: string
  aliases: string[]
  minPrefixLength: number
}

const MOVEMENT_COMMANDS: MovementCommandDefinition[] = [
  { command: 'north', aliases: ['n'], minPrefixLength: 1 },
  { command: 'east', aliases: ['e'], minPrefixLength: 1 },
  { command: 'south', aliases: ['s'], minPrefixLength: 1 },
  { command: 'west', aliases: ['w'], minPrefixLength: 1 },
  { command: 'up', aliases: ['u'], minPrefixLength: 1 },
  { command: 'down', aliases: ['d'], minPrefixLength: 1 },
  { command: 'northeast', aliases: ['ne'], minPrefixLength: 6 },
  { command: 'southeast', aliases: ['se'], minPrefixLength: 6 },
  { command: 'southwest', aliases: ['sw'], minPrefixLength: 6 },
  { command: 'northwest', aliases: ['nw'], minPrefixLength: 6 },
  { command: 'inside', aliases: ['in'], minPrefixLength: 2 },
  { command: 'outside', aliases: ['out'], minPrefixLength: 3 },
]

const MOVEMENT_COMMAND_INPUTS = new Set(
  MOVEMENT_COMMANDS.flatMap(({ command, aliases, minPrefixLength }) => [
    ...aliases,
    ...buildCommandPrefixes(command, minPrefixLength),
  ]),
)

export type MsdpVariableKey = keyof typeof defaultMsdpVariables
export type MsdpVariableMap = Record<MsdpVariableKey, string>

export function isMovementCommandInput(text: string) {
  return MOVEMENT_COMMAND_INPUTS.has(text.trim().toLowerCase())
}

export function normalizeMsdpVariableMap(value: unknown): MsdpVariableMap {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

  return {
    characterName: normalizeMsdpVariableValue(raw.characterName, defaultMsdpVariables.characterName),
    title: normalizeMsdpVariableValue(raw.title, defaultMsdpVariables.title),
    level: normalizeMsdpVariableValue(raw.level, defaultMsdpVariables.level),
    race: normalizeMsdpVariableValue(raw.race, defaultMsdpVariables.race),
    className: normalizeMsdpVariableValue(raw.className, defaultMsdpVariables.className),
    health: normalizeMsdpVariableValue(raw.health, defaultMsdpVariables.health),
    healthMax: normalizeMsdpVariableValue(raw.healthMax, defaultMsdpVariables.healthMax),
    psp: normalizeMsdpVariableValue(raw.psp, defaultMsdpVariables.psp),
    pspMax: normalizeMsdpVariableValue(raw.pspMax, defaultMsdpVariables.pspMax),
    movement: normalizeMsdpVariableValue(raw.movement, defaultMsdpVariables.movement),
    movementMax: normalizeMsdpVariableValue(raw.movementMax, defaultMsdpVariables.movementMax),
    experience: normalizeMsdpVariableValue(raw.experience, defaultMsdpVariables.experience),
    experienceMax: normalizeMsdpVariableValue(raw.experienceMax, defaultMsdpVariables.experienceMax),
    experienceTnl: normalizeMsdpVariableValue(raw.experienceTnl, defaultMsdpVariables.experienceTnl),
    strength: normalizeMsdpVariableValue(raw.strength, defaultMsdpVariables.strength),
    dexterity: normalizeMsdpVariableValue(raw.dexterity, defaultMsdpVariables.dexterity),
    constitution: normalizeMsdpVariableValue(raw.constitution, defaultMsdpVariables.constitution),
    intelligence: normalizeMsdpVariableValue(raw.intelligence, defaultMsdpVariables.intelligence),
    wisdom: normalizeMsdpVariableValue(raw.wisdom, defaultMsdpVariables.wisdom),
    charisma: normalizeMsdpVariableValue(raw.charisma, defaultMsdpVariables.charisma),
    fortitude: normalizeMsdpVariableValue(raw.fortitude, defaultMsdpVariables.fortitude),
    reflex: normalizeMsdpVariableValue(raw.reflex, defaultMsdpVariables.reflex),
    willpower: normalizeMsdpVariableValue(raw.willpower, defaultMsdpVariables.willpower),
    position: normalizeMsdpVariableValue(raw.position, defaultMsdpVariables.position),
    attackBonus: normalizeMsdpVariableValue(raw.attackBonus, defaultMsdpVariables.attackBonus),
    armorClass: normalizeMsdpVariableValue(raw.armorClass, defaultMsdpVariables.armorClass),
    alignment: normalizeMsdpVariableValue(raw.alignment, defaultMsdpVariables.alignment),
    money: normalizeMsdpVariableValue(raw.money, defaultMsdpVariables.money),
    bank: normalizeMsdpVariableValue(raw.bank, defaultMsdpVariables.bank),
    minimap: normalizeMsdpVariableValue(raw.minimap, defaultMsdpVariables.minimap),
    graphicMap: normalizeMsdpVariableValue(raw.graphicMap, defaultMsdpVariables.graphicMap),
    wildernessGraphicMap: normalizeMsdpVariableValue(
      raw.wildernessGraphicMap,
      defaultMsdpVariables.wildernessGraphicMap,
    ),
    affects: normalizeMsdpVariableValue(raw.affects, defaultMsdpVariables.affects),
    cooldowns: normalizeMsdpVariableValue(raw.cooldowns, defaultMsdpVariables.cooldowns),
    group: normalizeMsdpVariableValue(raw.group, defaultMsdpVariables.group),
    questInfo: normalizeMsdpVariableValue(raw.questInfo, defaultMsdpVariables.questInfo),
    opponentName: normalizeMsdpVariableValue(raw.opponentName, defaultMsdpVariables.opponentName),
    opponentHealth: normalizeMsdpVariableValue(raw.opponentHealth, defaultMsdpVariables.opponentHealth),
    opponentHealthMax: normalizeMsdpVariableValue(raw.opponentHealthMax, defaultMsdpVariables.opponentHealthMax),
    tankName: normalizeMsdpVariableValue(raw.tankName, defaultMsdpVariables.tankName),
    tankHealth: normalizeMsdpVariableValue(raw.tankHealth, defaultMsdpVariables.tankHealth),
    tankHealthMax: normalizeMsdpVariableValue(raw.tankHealthMax, defaultMsdpVariables.tankHealthMax),
    bacta: normalizeMsdpVariableValue(raw.bacta, defaultMsdpVariables.bacta),
    powerCells: normalizeMsdpVariableValue(raw.powerCells, defaultMsdpVariables.powerCells),
    ammoMain: normalizeMsdpVariableValue(raw.ammoMain, defaultMsdpVariables.ammoMain),
    ammoMainMax: normalizeMsdpVariableValue(raw.ammoMainMax, defaultMsdpVariables.ammoMainMax),
    ammoMainType: normalizeMsdpVariableValue(raw.ammoMainType, defaultMsdpVariables.ammoMainType),
    ammoOffhand: normalizeMsdpVariableValue(raw.ammoOffhand, defaultMsdpVariables.ammoOffhand),
    ammoOffhandMax: normalizeMsdpVariableValue(raw.ammoOffhandMax, defaultMsdpVariables.ammoOffhandMax),
    ammoOffhandType: normalizeMsdpVariableValue(raw.ammoOffhandType, defaultMsdpVariables.ammoOffhandType),
    actionStandard: normalizeMsdpVariableValue(raw.actionStandard, defaultMsdpVariables.actionStandard),
    actionMove: normalizeMsdpVariableValue(raw.actionMove, defaultMsdpVariables.actionMove),
    actionQuick: normalizeMsdpVariableValue(raw.actionQuick, defaultMsdpVariables.actionQuick),
  }
}

function buildCommandPrefixes(command: string, minPrefixLength: number) {
  const prefixes: string[] = []
  const start = Math.min(Math.max(1, minPrefixLength), command.length)

  for (let length = start; length <= command.length; length += 1) {
    prefixes.push(command.slice(0, length))
  }

  return prefixes
}

function normalizeMsdpVariableValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export type ClientMessage =
  | {
      type: 'connect'
      host: string
      port: number
      msdpVariables: MsdpVariableMap
      starWarsMode: boolean
    }
  | {
      type: 'disconnect'
    }
  | {
      type: 'input'
      text: string
    }
  | {
      type: 'msdp-config'
      msdpVariables: MsdpVariableMap
      starWarsMode: boolean
    }

export type ServerMessage =
  | {
      type: 'connection-status'
      status: ConnectionStatus
      detail: string
    }
  | {
      type: 'terminal'
      text: string
    }
  | {
      type: 'state'
      state: Partial<MudState>
    }
