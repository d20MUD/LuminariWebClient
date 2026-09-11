import AnsiToHtml from 'ansi-to-html'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { ReactNode } from 'react'
import { appSettings } from '../shared/app-settings.ts'
import type { AppSettings } from '../shared/app-settings.ts'
import {
  defaultMsdpVariables,
  isWildernessRoomVnum,
  isMovementCommandInput,
  normalizeMsdpVariableMap,
} from '../shared/mud.ts'
import type {
  ClientMessage,
  ConnectionStatus,
  GraphicMapData,
  GraphicMapRoom,
  MsdpVariableKey,
  MsdpVariableMap,
  MudState,
  MudValue,
  ServerMessage,
} from '../shared/mud.ts'
import './App.css'

const DEFAULT_HOST = appSettings.connection.defaultHost
const DEFAULT_PORT = appSettings.connection.defaultPort
const CUSTOM_MUD_VALUE = '__custom__'
const DEFAULT_TERMINAL_HISTORY_LINES = 200
const MAX_TERMINAL_HISTORY_LINES = 2000
const COMMAND_HISTORY_LIMIT = 100
const TERMINAL_BOTTOM_SCROLL_TOLERANCE = 24
const AUTOMATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const AUTOMATION_COOKIE_CHUNK_SIZE = 3000
const AUTOMATION_RECURSION_LIMIT = 10
const CLIENT_CONFIG_EXPORT_VERSION = 1
const WEBSOCKET_RECONNECT_INITIAL_DELAY_MS = 1000
const WEBSOCKET_RECONNECT_MAX_DELAY_MS = 30_000
const ALIASES_COOKIE_NAME = 'lwc.aliases'
const TRIGGERS_COOKIE_NAME = 'lwc.triggers'
const CLIENT_SETTINGS_COOKIE_NAME = 'lwc.settings'
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, 'g')
const LUMINARI_COLOR_CHAR = '^'
const KRYNN_COLOR_CHAR = '\t'
const LUMINARI_COLOR_CODES: Record<string, string> = {
  n: '\u001b[0;00m',
  k: luminariRgbToAnsi('F000'),
  d: luminariRgbToAnsi('F000'),
  K: luminariRgbToAnsi('F111'),
  D: luminariRgbToAnsi('F111'),
  '1': luminariRgbToAnsi('F022'),
  '2': luminariRgbToAnsi('F055'),
  '3': luminariRgbToAnsi('F555'),
  r: luminariRgbToAnsi('F200'),
  R: luminariRgbToAnsi('F500'),
  g: luminariRgbToAnsi('F020'),
  G: luminariRgbToAnsi('F050'),
  y: luminariRgbToAnsi('F220'),
  Y: luminariRgbToAnsi('F550'),
  b: luminariRgbToAnsi('F002'),
  B: luminariRgbToAnsi('F005'),
  m: luminariRgbToAnsi('F202'),
  M: luminariRgbToAnsi('F505'),
  c: luminariRgbToAnsi('F022'),
  C: luminariRgbToAnsi('F055'),
  w: luminariRgbToAnsi('F222'),
  W: luminariRgbToAnsi('F555'),
  a: luminariRgbToAnsi('F014'),
  A: luminariRgbToAnsi('F025'),
  j: luminariRgbToAnsi('F031'),
  J: luminariRgbToAnsi('F142'),
  l: luminariRgbToAnsi('F140'),
  L: luminariRgbToAnsi('F250'),
  o: luminariRgbToAnsi('F520'),
  O: luminariRgbToAnsi('F530'),
  p: luminariRgbToAnsi('F301'),
  P: luminariRgbToAnsi('F413'),
  s: luminariRgbToAnsi('F300'),
  S: luminariRgbToAnsi('F411'),
  t: luminariRgbToAnsi('F320'),
  T: luminariRgbToAnsi('F431'),
  v: luminariRgbToAnsi('F104'),
  V: luminariRgbToAnsi('F215'),
  _: '\u001b[4m',
  '+': '\u001b[1m',
  '-': '\u001b[5m',
  '=': '\u001b[7m',
  '*': '@',
}
type KeyBindingDefinition = {
  id: string
  code: string
  key: string
  command: string
  enabled: boolean
}

const DEFAULT_KEY_BINDINGS: KeyBindingDefinition[] = [
  { id: 'keybind-numpad-1', code: 'Numpad1', key: '1', command: 'sw', enabled: true },
  { id: 'keybind-numpad-2', code: 'Numpad2', key: '2', command: 's', enabled: true },
  { id: 'keybind-numpad-3', code: 'Numpad3', key: '3', command: 'se', enabled: true },
  { id: 'keybind-numpad-4', code: 'Numpad4', key: '4', command: 'w', enabled: true },
  { id: 'keybind-numpad-5', code: 'Numpad5', key: '5', command: 'look', enabled: true },
  { id: 'keybind-numpad-6', code: 'Numpad6', key: '6', command: 'e', enabled: true },
  { id: 'keybind-numpad-7', code: 'Numpad7', key: '7', command: 'nw', enabled: true },
  { id: 'keybind-numpad-8', code: 'Numpad8', key: '8', command: 'n', enabled: true },
  { id: 'keybind-numpad-9', code: 'Numpad9', key: '9', command: 'ne', enabled: true },
  { id: 'keybind-numpad-add', code: 'NumpadAdd', key: '+', command: 'down', enabled: true },
  { id: 'keybind-numpad-subtract', code: 'NumpadSubtract', key: '-', command: 'up', enabled: true },
  { id: 'keybind-numpad-0', code: 'Numpad0', key: '0', command: 'in', enabled: true },
  { id: 'keybind-numpad-decimal', code: 'NumpadDecimal', key: '.', command: 'out', enabled: true },
]

const KEY_CODE_LABELS: Record<string, string> = {
  Numpad0: 'Numpad 0',
  Numpad1: 'Numpad 1',
  Numpad2: 'Numpad 2',
  Numpad3: 'Numpad 3',
  Numpad4: 'Numpad 4',
  Numpad5: 'Numpad 5',
  Numpad6: 'Numpad 6',
  Numpad7: 'Numpad 7',
  Numpad8: 'Numpad 8',
  Numpad9: 'Numpad 9',
  NumpadAdd: 'Numpad +',
  NumpadSubtract: 'Numpad -',
  NumpadDecimal: 'Numpad .',
}

type BarConfig = {
  id: string
  label: string
  valueText: string
  percentage: number
  ariaLabel: string
  availabilityKind: 'present' | 'loading' | 'offline' | 'error' | 'unavailable'
  accentClass: string
  widthValue: string
}

type SidebarTabId = 'character' | 'quests' | 'group' | 'affects'

type MapPanelTabId = 'graphic' | 'graphicLegend' | 'ascii' | 'asciiLegend'

type SidebarWidthUnit = 'percent' | 'pixels'

type GaugeId = 'health' | 'psp' | 'movement' | 'experience' | 'opponent' | 'tank'

type StandardGaugeId = 'health' | 'psp' | 'movement' | 'experience'

type CombatGaugeId = 'opponent' | 'tank'

type GaugeVisibilityMode = 'never' | 'combat' | 'always'

type GaugeSizeSettings = {
  widthUnit: SidebarWidthUnit
  widthPercent: number
  widthPixels: number
}

type StandardGaugeSettings = GaugeSizeSettings & {
  visible: boolean
}

type CombatGaugeSettings = GaugeSizeSettings & {
  visibilityMode: GaugeVisibilityMode
}

type LayoutGaugeSettings = {
  health: StandardGaugeSettings
  psp: StandardGaugeSettings
  movement: StandardGaugeSettings
  experience: StandardGaugeSettings
  opponent: CombatGaugeSettings
  tank: CombatGaugeSettings
}

type PlayerInfoSectionId =
  | 'characterName'
  | 'race'
  | 'className'
  | 'abilityScores'
  | 'savingThrows'
  | 'position'
  | 'attack'
  | 'armorClass'
  | 'alignment'
  | 'money'

type DefaultMapType = 'graphic' | 'ascii'

type SidebarTab = {
  id: SidebarTabId
  label: string
}

type MapPanelTab = {
  id: MapPanelTabId
  label: string
  panelLabel: string
}

type MapLegendItem = {
  id: string
  label: string
  detail: string
  sample?: string
  sector?: number
}

type AliasDefinition = {
  id: string
  pattern: string
  expansion: string
  enabled: boolean
}

type TriggerDefinition = {
  id: string
  pattern: string
  action: string
  enabled: boolean
}

type SidebarFontFamily = 'sans' | 'mono' | 'serif'

type ClientSettings = {
  connection: {
    defaultMudId: string
    customMudName: string
    customHost: string
    customPort: number
  }
  layout: {
    minimalistMode: boolean
    sidebarWidthUnit: SidebarWidthUnit
    sidebarWidthPercent: number
    sidebarWidthPixels: number
    gauges: LayoutGaugeSettings
    mapPanels: Record<MapPanelTabId, boolean>
    sidebarTabs: Record<SidebarTabId, boolean>
    playerInfoSections: Record<PlayerInfoSectionId, boolean>
  }
  terminal: {
    fontSize: number
    lineHeight: number
    maxHistoryLines: number
    autoScroll: boolean
    wrapLines: boolean
  }
  minimap: {
    fontSize: number
    paneHeight: number
    defaultMapType: DefaultMapType
  }
  sidebar: {
    fontFamily: SidebarFontFamily
    fontSize: number
  }
  keyBindings: KeyBindingDefinition[]
  msdp: MsdpVariableMap
}

type AutomationNotice = {
  kind: 'success' | 'error'
  text: string
}

type AutomationMenuId = 'aliases' | 'triggers' | 'keyBindings' | 'msdpVars' | 'layout' | 'settings'

const DEFAULT_LAYOUT_MAP_PANELS: Record<MapPanelTabId, boolean> = {
  graphic: true,
  graphicLegend: true,
  ascii: true,
  asciiLegend: true,
}

const DEFAULT_LAYOUT_SIDEBAR_TABS: Record<SidebarTabId, boolean> = {
  character: true,
  quests: true,
  group: true,
  affects: true,
}

const DEFAULT_LAYOUT_PLAYER_INFO_SECTIONS: Record<PlayerInfoSectionId, boolean> = {
  characterName: true,
  race: true,
  className: true,
  abilityScores: true,
  savingThrows: true,
  position: true,
  attack: true,
  armorClass: true,
  alignment: true,
  money: true,
}

const DEFAULT_LAYOUT_GAUGES: LayoutGaugeSettings = {
  health: { visible: true, widthUnit: 'percent', widthPercent: 24, widthPixels: 220 },
  psp: { visible: true, widthUnit: 'percent', widthPercent: 24, widthPixels: 220 },
  movement: { visible: true, widthUnit: 'percent', widthPercent: 24, widthPixels: 220 },
  experience: { visible: true, widthUnit: 'percent', widthPercent: 24, widthPixels: 220 },
  opponent: { visibilityMode: 'combat', widthUnit: 'percent', widthPercent: 24, widthPixels: 220 },
  tank: { visibilityMode: 'combat', widthUnit: 'percent', widthPercent: 24, widthPixels: 220 },
}

const SIDEBAR_WIDTH_UNIT_OPTIONS: Array<{ value: SidebarWidthUnit; label: string }> = [
  { value: 'percent', label: 'Percentage' },
  { value: 'pixels', label: 'Pixels' },
]

const STANDARD_GAUGE_OPTIONS: Array<{ id: StandardGaugeId; label: string }> = [
  { id: 'health', label: 'Health gauge' },
  { id: 'psp', label: 'PSP gauge' },
  { id: 'movement', label: 'Movement gauge' },
  { id: 'experience', label: 'Experience gauge' },
]

const COMBAT_GAUGE_OPTIONS: Array<{ id: CombatGaugeId; label: string }> = [
  { id: 'opponent', label: 'Opponent health gauge' },
  { id: 'tank', label: 'Tank health gauge' },
]

const GAUGE_VISIBILITY_MODE_OPTIONS: Array<{ value: GaugeVisibilityMode; label: string }> = [
  { value: 'never', label: 'Never show' },
  { value: 'combat', label: 'Show only in combat' },
  { value: 'always', label: 'Show always' },
]

const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  connection: {
    defaultMudId: findMatchingMudPresetId(appSettings.connection.muds, DEFAULT_HOST, DEFAULT_PORT) ?? CUSTOM_MUD_VALUE,
    customMudName: '',
    customHost: DEFAULT_HOST,
    customPort: DEFAULT_PORT,
  },
  layout: {
    minimalistMode: false,
    sidebarWidthUnit: 'pixels',
    sidebarWidthPercent: 30,
    sidebarWidthPixels: 416,
    gauges: {
      health: { ...DEFAULT_LAYOUT_GAUGES.health },
      psp: { ...DEFAULT_LAYOUT_GAUGES.psp },
      movement: { ...DEFAULT_LAYOUT_GAUGES.movement },
      experience: { ...DEFAULT_LAYOUT_GAUGES.experience },
      opponent: { ...DEFAULT_LAYOUT_GAUGES.opponent },
      tank: { ...DEFAULT_LAYOUT_GAUGES.tank },
    },
    mapPanels: { ...DEFAULT_LAYOUT_MAP_PANELS },
    sidebarTabs: { ...DEFAULT_LAYOUT_SIDEBAR_TABS },
    playerInfoSections: { ...DEFAULT_LAYOUT_PLAYER_INFO_SECTIONS },
  },
  terminal: {
    fontSize: 14,
    lineHeight: 1.55,
    maxHistoryLines: DEFAULT_TERMINAL_HISTORY_LINES,
    autoScroll: true,
    wrapLines: true,
  },
  minimap: {
    fontSize: 14,
    paneHeight: 16,
    defaultMapType: 'graphic',
  },
  sidebar: {
    fontFamily: 'mono',
    fontSize: 13,
  },
  keyBindings: getDefaultKeyBindings(),
  msdp: normalizeMsdpVariableMap(defaultMsdpVariables),
}

const OUTPUT_FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24]
const OUTPUT_LINE_HEIGHT_OPTIONS = [
  { value: 1.35, label: 'Compact' },
  { value: 1.55, label: 'Normal' },
  { value: 1.75, label: 'Relaxed' },
]
const SIDEBAR_FONT_OPTIONS: Array<{ value: SidebarFontFamily; label: string }> = [
  { value: 'sans', label: 'Sans serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'serif', label: 'Serif' },
]
const DEFAULT_MAP_TYPE_OPTIONS: Array<{ value: DefaultMapType; label: string }> = [
  { value: 'graphic', label: 'Graphical' },
  { value: 'ascii', label: 'ASCII' },
]
const SIDEBAR_FONT_FAMILIES: Record<SidebarFontFamily, string> = {
  sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'var(--mono)',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
}
const MSDP_VARIABLE_GROUPS: Array<{
  title: string
  description: string
  fields: Array<{ key: MsdpVariableKey; label: string }>
}> = [
  {
    title: 'Character',
    description: 'Profile and core stat variables used in the character panel.',
    fields: [
      { key: 'characterName', label: 'Character name' },
      { key: 'title', label: 'Title' },
      { key: 'level', label: 'Level' },
      { key: 'race', label: 'Race' },
      { key: 'className', label: 'Class' },
      { key: 'position', label: 'Position' },
      { key: 'alignment', label: 'Alignment' },
      { key: 'money', label: 'Money' },
      { key: 'bank', label: 'Bank balance' },
    ],
  },
  {
    title: 'Status and attributes',
    description: 'Values that drive the bars and ability score sections.',
    fields: [
      { key: 'health', label: 'Health' },
      { key: 'healthMax', label: 'Health max' },
      { key: 'psp', label: 'PSP' },
      { key: 'pspMax', label: 'PSP max' },
      { key: 'movement', label: 'Movement' },
      { key: 'movementMax', label: 'Movement max' },
      { key: 'experience', label: 'Experience' },
      { key: 'experienceMax', label: 'Experience max' },
      { key: 'experienceTnl', label: 'Experience to next level' },
      { key: 'strength', label: 'Strength' },
      { key: 'dexterity', label: 'Dexterity' },
      { key: 'constitution', label: 'Constitution' },
      { key: 'intelligence', label: 'Intelligence' },
      { key: 'wisdom', label: 'Wisdom' },
      { key: 'charisma', label: 'Charisma' },
      { key: 'fortitude', label: 'Fortitude' },
      { key: 'reflex', label: 'Reflex' },
      { key: 'willpower', label: 'Willpower' },
      { key: 'attackBonus', label: 'Attack bonus' },
      { key: 'armorClass', label: 'Armor class' },
    ],
  },
  {
    title: 'Panels and map',
    description: 'Variables that populate the minimap, quest, group, and affects panels.',
    fields: [
      { key: 'minimap', label: 'Minimap' },
      { key: 'graphicMap', label: 'Graphic map' },
      { key: 'wildernessGraphicMap', label: 'Wilderness graphic map' },
      { key: 'affects', label: 'Affects' },
      { key: 'cooldowns', label: 'Cooldowns (Star Wars)' },
      { key: 'group', label: 'Group' },
      { key: 'questInfo', label: 'Quest info' },
      { key: 'bacta', label: 'Bacta (Star Wars)' },
      { key: 'powerCells', label: 'Power cells (Star Wars)' },
    ],
  },
  {
    title: 'Combat targets',
    description: 'Opponent and tank data shown in the status bars.',
    fields: [
      { key: 'opponentName', label: 'Opponent name' },
      { key: 'opponentHealth', label: 'Opponent health' },
      { key: 'opponentHealthMax', label: 'Opponent health max' },
      { key: 'tankName', label: 'Tank name' },
      { key: 'tankHealth', label: 'Tank health' },
      { key: 'tankHealthMax', label: 'Tank health max' },
    ],
  },
]

const SIDEBAR_TABS: SidebarTab[] = [
  { id: 'character', label: 'Player info' },
  { id: 'quests', label: 'Quests' },
  { id: 'group', label: 'Group' },
  { id: 'affects', label: 'Affects' },
]

const LAYOUT_MAP_TOGGLE_OPTIONS: Array<{ id: MapPanelTabId; label: string }> = [
  { id: 'graphic', label: 'Graphic map' },
  { id: 'graphicLegend', label: 'Graphic legend' },
  { id: 'ascii', label: 'ASCII map' },
  { id: 'asciiLegend', label: 'ASCII legend' },
]

const LAYOUT_SIDEBAR_TOGGLE_OPTIONS: Array<{ id: SidebarTabId; label: string }> = [
  { id: 'character', label: 'Player info tab' },
  { id: 'group', label: 'Group tab' },
  { id: 'affects', label: 'Affects tab' },
  { id: 'quests', label: 'Quest tab' },
]

const PLAYER_INFO_SECTION_TOGGLE_OPTIONS: Array<{ id: PlayerInfoSectionId; label: string }> = [
  { id: 'characterName', label: 'Character name' },
  { id: 'race', label: 'Race' },
  { id: 'className', label: 'Class' },
  { id: 'abilityScores', label: 'Ability scores' },
  { id: 'savingThrows', label: 'Saving throws' },
  { id: 'position', label: 'Position' },
  { id: 'attack', label: 'Attack' },
  { id: 'armorClass', label: 'Armor class' },
  { id: 'alignment', label: 'Alignment' },
  { id: 'money', label: 'Money' },
]

const MAP_PANEL_TABS: MapPanelTab[] = [
  { id: 'graphic', label: 'Graphic', panelLabel: 'Graphic map' },
  { id: 'graphicLegend', label: 'Legend', panelLabel: 'Graphic map legend' },
  { id: 'ascii', label: 'ASCII', panelLabel: 'ASCII map' },
  { id: 'asciiLegend', label: 'Legend', panelLabel: 'ASCII map legend' },
]

const GRAPHIC_MAP_LEGEND_ITEMS: MapLegendItem[] = [
  { id: 'inside', sector: 0, label: 'Inside', detail: 'Standard indoor room sector.', sample: '\\tn.\\tn' },
  { id: 'city', sector: 1, label: 'City', detail: 'City streets and plazas.', sample: '\\twC\\tn' },
  { id: 'field', sector: 2, label: 'Field', detail: 'Open plains and fields.', sample: '\\tg,\\tn' },
  { id: 'forest', sector: 3, label: 'Forest', detail: 'Wooded terrain.', sample: '\\tG\\t=Y\\tn' },
  { id: 'hills', sector: 4, label: 'Hills', detail: 'Rolling hills.', sample: '\\ty^\\tn' },
  { id: 'mountain', sector: 5, label: 'Mountain', detail: 'Mountain terrain.', sample: '\\trm\\tn' },
  { id: 'water-swim', sector: 6, label: 'Water', detail: 'Swimmable water.', sample: '\\tc\\t=~\\tn' },
  { id: 'water-noswim', sector: 7, label: 'Deep water', detail: 'Water that cannot be crossed normally.', sample: '\\tb\\t==\\tn' },
  { id: 'flying', sector: 8, label: 'Air', detail: 'Open air or flying terrain.', sample: '\\tC^\\tn' },
  { id: 'underwater', sector: 9, label: 'Underwater', detail: 'Submerged rooms.', sample: '\\tbU\\tn' },
  { id: 'roads', sector: 11, label: 'Road', detail: 'Road segments and intersections.', sample: '\\tD+\\tn' },
  { id: 'desert', sector: 14, label: 'Desert', detail: 'Dry desert terrain.', sample: '\\tY.\\tn' },
  { id: 'ocean', sector: 15, label: 'Ocean', detail: 'Open ocean water.', sample: '\\tB\\t=o\\tn' },
  { id: 'marsh', sector: 16, label: 'Marsh', detail: 'Wetlands and bogs.', sample: '\\tM,\\tn' },
  { id: 'high-mountain', sector: 17, label: 'High mountain', detail: 'High, difficult peaks.', sample: '\\tRM\\tn' },
  { id: 'planes', sector: 18, label: 'Planes', detail: 'Extraplanar terrain.', sample: '\\tM.\\tn' },
  { id: 'underdark', sector: 19, label: 'Underdark wilds', detail: 'Underground wilderness.', sample: '\\tM\\t=Y\\tn' },
  { id: 'ud-city', sector: 20, label: 'Underdark city', detail: 'Underground settlements.', sample: '\\tmC\\tn' },
  { id: 'ud-inside', sector: 21, label: 'Underdark inside', detail: 'Underground interior rooms.', sample: '\\tm.\\tn' },
  { id: 'ud-water', sector: 22, label: 'Underdark water', detail: 'Underground swimmable water.', sample: '\\tm\\t=~\\tn' },
  { id: 'lava', sector: 25, label: 'Lava', detail: 'Hazardous lava terrain.', sample: '\\tR.\\tn' },
  { id: 'cave', sector: 29, label: 'Cave', detail: 'Natural cave rooms.', sample: '\\tMC\\tn' },
  { id: 'jungle', sector: 30, label: 'Jungle', detail: 'Dense jungle terrain.', sample: '\\tg&\\tn' },
  { id: 'tundra', sector: 31, label: 'Tundra', detail: 'Frozen plains.', sample: '\\tW.\\tn' },
  { id: 'taiga', sector: 32, label: 'Taiga', detail: 'Cold evergreen forest.', sample: '\\tgA\\tn' },
  { id: 'beach', sector: 33, label: 'Beach', detail: 'Coastal shorelines.', sample: '\\ty:\\tn' },
  { id: 'seaport', sector: 34, label: 'Seaport', detail: 'Harbor or port room.', sample: '\\tRS\\tn' },
  { id: 'inside-room', sector: 35, label: 'Inside room', detail: 'Special indoor-room sector.', sample: '\\ty*\\tn' },
  { id: 'river', sector: 36, label: 'River', detail: 'Flowing river water.', sample: '\\tc\\t=~\\tn' },
]

const GRAPHIC_MAP_SPECIAL_LEGEND_ITEMS: MapLegendItem[] = [
  { id: 'marker-up', label: 'Up exit', detail: 'Visible upward exit from the room.', sample: '↑' },
  { id: 'marker-down', label: 'Down exit', detail: 'Visible downward exit from the room.', sample: '↓' },
  { id: 'marker-in', label: 'Inside exit', detail: 'Visible inside exit.', sample: '🚪↘' },
  { id: 'marker-out', label: 'Outside exit', detail: 'Visible outside exit.', sample: '🚪↗' },
]

const ASCII_MAP_LEGEND_ITEMS: MapLegendItem[] = [
  { id: 'ascii-player', label: 'Player', detail: 'Current room marker from asciimap.c (SECT_HERE).', sample: '\\tW&\\tn' },
  { id: 'ascii-strange', label: 'Strange link', detail: 'One-way or unusual connection.', sample: '\\tR?\\tn' },
  { id: 'ascii-door-ns', label: 'North-south exit', detail: 'Compact door glyph for N/S exits.', sample: '|' },
  { id: 'ascii-door-ew', label: 'East-west exit', detail: 'Compact door glyph for E/W exits.', sample: '-' },
  { id: 'ascii-door-ne', label: 'Diagonal exit', detail: 'Compact diagonal exit glyph.', sample: '/' },
  { id: 'ascii-door-nw', label: 'Diagonal exit', detail: 'Compact diagonal exit glyph.', sample: '\\\\' },
  { id: 'ascii-door-up', label: 'Up exit', detail: 'Compact upward exit glyph.', sample: '\\tr+\\tn' },
  { id: 'ascii-door-down', label: 'Down exit', detail: 'Compact downward exit glyph.', sample: '\\tr-\\tn' },
  { id: 'ascii-inside', label: 'Inside', detail: 'Standard indoor room.', sample: '\\tn.\\tn' },
  { id: 'ascii-city', label: 'City', detail: 'City streets and plazas.', sample: '\\twC\\tn' },
  { id: 'ascii-field', label: 'Field', detail: 'Plains and fields.', sample: '\\tg,\\tn' },
  { id: 'ascii-forest', label: 'Forest', detail: 'Wooded terrain.', sample: '\\tG\\t=Y\\tn' },
  { id: 'ascii-hills', label: 'Hills', detail: 'Rolling hills.', sample: '\\ty^\\tn' },
  { id: 'ascii-mountain', label: 'Mountain', detail: 'Mountain terrain.', sample: '\\trm\\tn' },
  { id: 'ascii-water', label: 'Water', detail: 'Swimmable water.', sample: '\\tc\\t=~\\tn' },
  { id: 'ascii-water-deep', label: 'Deep water', detail: 'No-swim water.', sample: '\\tb\\t==\\tn' },
  { id: 'ascii-underwater', label: 'Underwater', detail: 'Underwater room.', sample: '\\tbU\\tn' },
  { id: 'ascii-road', label: 'Road', detail: 'Roads and intersections.', sample: '\\tD+\\tn' },
  { id: 'ascii-desert', label: 'Desert', detail: 'Dry desert terrain.', sample: '\\tY.\\tn' },
  { id: 'ascii-ocean', label: 'Ocean', detail: 'Open ocean.', sample: '\\tB\\t=o\\tn' },
  { id: 'ascii-marsh', label: 'Marsh', detail: 'Wetlands and marshes.', sample: '\\tM,\\tn' },
  { id: 'ascii-cave', label: 'Cave', detail: 'Cave terrain.', sample: '\\tMC\\tn' },
  { id: 'ascii-jungle', label: 'Jungle', detail: 'Jungle terrain.', sample: '\\tg&\\tn' },
  { id: 'ascii-tundra', label: 'Tundra', detail: 'Frozen plains.', sample: '\\tW.\\tn' },
  { id: 'ascii-taiga', label: 'Taiga', detail: 'Cold evergreen forest.', sample: '\\tgA\\tn' },
  { id: 'ascii-beach', label: 'Beach', detail: 'Coastline and shore.', sample: '\\ty:\\tn' },
  { id: 'ascii-seaport', label: 'Seaport', detail: 'Harbor room.', sample: '\\tRS\\tn' },
  { id: 'ascii-river', label: 'River', detail: 'River terrain.', sample: '\\tc\\t=~\\tn' },
]

function App() {
  const initialClientSettings = loadClientSettingsFromCookies()
  const initialConnectionDefaults = resolveConnectionDefaults(appSettings, initialClientSettings)
  const [uiSettings, setUiSettings] = useState<AppSettings>(appSettings)
  const [mudState, setMudState] = useState<MudState>({})
  const [host, setHost] = useState(initialConnectionDefaults.host)
  const [port, setPort] = useState(initialConnectionDefaults.port)
  const [selectedMudId, setSelectedMudId] = useState(initialConnectionDefaults.selectedMudId)
  const isStarWarsConnection = selectedMudId === 'starwars'
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [historyDraft, setHistoryDraft] = useState('')
  const [aliases, setAliases] = useState<AliasDefinition[]>(() => loadAliasesFromCookies())
  const [triggers, setTriggers] = useState<TriggerDefinition[]>(() => loadTriggersFromCookies())
  const [clientSettings, setClientSettings] = useState<ClientSettings>(initialClientSettings)
  const [automationNotice, setAutomationNotice] = useState<AutomationNotice | null>(null)
  const [terminalOutput, setTerminalOutput] = useState('Connect to a LuminariMUD-compatible server to begin.')
  const [hasUnreadTerminalOutput, setHasUnreadTerminalOutput] = useState(false)
  const [proxyReady, setProxyReady] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('Awaiting connection.')
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [openAutomationMenu, setOpenAutomationMenu] = useState<AutomationMenuId | null>(null)
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabId>(() => getDefaultSidebarTab(initialClientSettings))
  const [activeMapTab, setActiveMapTab] = useState<MapPanelTabId>(() => getDefaultMapPanelTab(initialClientSettings))
  const socketRef = useRef<WebSocket | null>(null)
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const commandInputRef = useRef<HTMLInputElement | null>(null)
  const configFileInputRef = useRef<HTMLInputElement | null>(null)
  const menuBarRef = useRef<HTMLDivElement | null>(null)
  const triggerBufferRef = useRef('')
  const statusRef = useRef<ConnectionStatus>('idle')
  const aliasesRef = useRef<AliasDefinition[]>(aliases)
  const triggersRef = useRef<TriggerDefinition[]>(triggers)
  const clientSettingsRef = useRef(clientSettings)
  const terminalHistoryLineLimitRef = useRef(clientSettings.terminal.maxHistoryLines)
  const terminalShouldFollowOutputRef = useRef(true)
  const visibleMapTabs = useMemo(() => getVisibleMapPanelTabs(clientSettings.layout), [clientSettings.layout])
  const visibleSidebarTabs = useMemo(() => getVisibleSidebarTabs(clientSettings.layout), [clientSettings.layout])

  useEffect(() => {
    document.title = uiSettings.personalization.browserTitle
  }, [uiSettings.personalization.browserTitle])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    aliasesRef.current = aliases
    saveAliasesToCookies(aliases)
  }, [aliases])

  useEffect(() => {
    triggersRef.current = triggers
    saveTriggersToCookies(triggers)
  }, [triggers])

  useEffect(() => {
    clientSettingsRef.current = clientSettings
  }, [clientSettings])

  useEffect(() => {
    saveClientSettingsToCookies(normalizeClientSettings(clientSettings))
  }, [clientSettings])

  useEffect(() => {
    terminalHistoryLineLimitRef.current = clientSettings.terminal.maxHistoryLines
  }, [clientSettings.terminal.maxHistoryLines])

  useEffect(() => {
    if (!openAutomationMenu) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuBarRef.current?.contains(event.target)) {
        return
      }

      setOpenAutomationMenu(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenAutomationMenu(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openAutomationMenu])

  useEffect(() => {
    let active = true

    async function loadSettings() {
      try {
        const response = await fetch(getSettingsUrl())
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const settings = (await response.json()) as AppSettings
        if (!active) {
          return
        }

        setUiSettings(settings)
        const connectionDefaults = resolveConnectionDefaults(settings, clientSettingsRef.current)
        setHost(connectionDefaults.host)
        setPort(connectionDefaults.port)
        setSelectedMudId(connectionDefaults.selectedMudId)
      } catch (error) {
        console.error('Failed to load app settings from /api/settings', error)
      }
    }

    void loadSettings()

    return () => {
      active = false
    }
  }, [])

  const sendMessage = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      statusRef.current = 'error'
      setStatus('error')
      setStatusDetail('The local WebSocket proxy is unavailable. Please refresh the page.')
      setIsHeaderVisible(true)
      return
    }

    socket.send(JSON.stringify(message))
  }, [])

  const sendInputLine = useCallback(
    (text: string) => {
      if (statusRef.current !== 'connected') {
        return
      }

      sendMessage({ type: 'input', text })
    },
    [sendMessage],
  )

  const rememberCommand = useCallback((text: string) => {
    if (!text.trim() || isMovementCommandInput(text)) {
      return
    }

    setCommandHistory((current) => [...current, text].slice(-COMMAND_HISTORY_LIMIT))
  }, [])

  const dispatchInputText = useCallback(
    (text: string, options?: { rememberInHistory?: boolean }) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }

      if (options?.rememberInHistory ?? true) {
        rememberCommand(trimmed)
      }

      const expandedCommands = expandAliasCommands(trimmed, aliasesRef.current)
      for (const expandedCommand of expandedCommands) {
        sendInputLine(expandedCommand)
      }
    },
    [rememberCommand, sendInputLine],
  )

  useEffect(() => {
    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0

    function connectWebSocket() {
      const socket = new WebSocket(getWebSocketUrl())
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (disposed || socketRef.current !== socket) {
          return
        }

        const reconnected = reconnectAttempt > 0
        reconnectAttempt = 0
        setProxyReady(true)
        if (reconnected) {
          statusRef.current = 'disconnected'
          setStatus('disconnected')
          setStatusDetail('Web connection restored. Reconnect to the MUD to resume playing.')
          setIsHeaderVisible(true)
          return
        }

        setStatusDetail((current) =>
          current === 'Awaiting connection.' ? 'Proxy ready. Connect to start playing.' : current,
        )
      })

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) {
          socketRef.current = null
        }
        if (disposed) {
          return
        }

        const lostMudConnection = statusRef.current === 'connected' || statusRef.current === 'connecting'
        setProxyReady(false)
        statusRef.current = lostMudConnection ? 'disconnected' : 'error'
        setStatus(lostMudConnection ? 'disconnected' : 'error')
        setStatusDetail('Web connection lost. Reconnecting…')
        setIsHeaderVisible(true)
        triggerBufferRef.current = ''

        const delay = Math.min(
          WEBSOCKET_RECONNECT_INITIAL_DELAY_MS * 2 ** reconnectAttempt,
          WEBSOCKET_RECONNECT_MAX_DELAY_MS,
        )
        reconnectAttempt += 1
        reconnectTimer = setTimeout(connectWebSocket, delay)
      })

      socket.addEventListener('message', (event) => {
        const message = parseServerMessage(event.data)
        if (!message) {
          return
        }

        if (message.type === 'terminal') {
          const shouldFollowOutput =
            clientSettingsRef.current.terminal.autoScroll && isTerminalScrolledToBottom(terminalRef.current)
          terminalShouldFollowOutputRef.current = shouldFollowOutput
          if (!shouldFollowOutput) {
            setHasUnreadTerminalOutput(true)
          }

          const triggerResult = consumeTriggerText(message.text, triggerBufferRef.current, triggersRef.current)
          triggerBufferRef.current = triggerResult.buffer
          for (const triggerCommand of triggerResult.commands) {
            dispatchInputText(triggerCommand, { rememberInHistory: false })
          }

          setTerminalOutput((current) =>
            trimTerminalOutputLines(`${current}${normalizeTerminalText(message.text)}`, terminalHistoryLineLimitRef.current),
          )
          return
        }

        if (message.type === 'connection-status') {
          statusRef.current = message.status
          setStatus(message.status)
          setStatusDetail(message.detail)
          setIsHeaderVisible(message.status !== 'connected')

          if (message.status === 'connecting' || message.status === 'disconnected') {
            setMudState({})
          }

          if (message.status === 'connected') {
            triggerBufferRef.current = ''
            terminalShouldFollowOutputRef.current = true
            setHasUnreadTerminalOutput(false)
            setTerminalOutput('Connected. Waiting for room text and MSDP updates...')
          } else {
            triggerBufferRef.current = ''
          }

          return
        }

        setMudState((current) => ({ ...current, ...message.state }))
      })
    }

    connectWebSocket()

    return () => {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [dispatchInputText])

  useLayoutEffect(() => {
    if (!terminalShouldFollowOutputRef.current) {
      return
    }

    scrollTerminalElementToBottom(terminalRef.current)
    setHasUnreadTerminalOutput(false)
  }, [terminalOutput])

  const bars = useMemo<BarConfig[]>(
    () => {
      const nextBars: BarConfig[] = []
      const opponentGaugeDataAvailable = hasCompleteCombatGaugeData(
        mudState.opponentHealth,
        mudState.opponentHealthMax,
      )
      const tankGaugeDataAvailable = hasCompleteCombatGaugeData(
        mudState.tankHealth,
        mudState.tankHealthMax,
      )

      if (clientSettings.layout.gauges.health.visible) {
        nextBars.push(
          buildHudBar({
          id: 'health',
          status,
          label: 'HP',
          value: mudState.health,
          max: mudState.healthMax,
          accentClass: 'bar-health',
            widthValue: getGaugeWidthValue(clientSettings.layout.gauges.health),
          }),
        )
      }

      if (clientSettings.layout.gauges.psp.visible) {
        nextBars.push(
          buildHudBar({
          id: 'psp',
          status,
          label: isStarWarsConnection ? 'Force Points' : 'PSP',
          value: mudState.psp,
          max: mudState.pspMax,
          accentClass: 'bar-psp',
            widthValue: getGaugeWidthValue(clientSettings.layout.gauges.psp),
          }),
        )
      }

      if (clientSettings.layout.gauges.movement.visible) {
        nextBars.push(
          buildHudBar({
          id: 'movement',
          status,
          label: 'Move',
          value: mudState.movement,
          max: mudState.movementMax,
          accentClass: 'bar-movement',
            widthValue: getGaugeWidthValue(clientSettings.layout.gauges.movement),
          }),
        )
      }

      if (clientSettings.layout.gauges.experience.visible) {
        nextBars.push(
          buildHudBar({
          id: 'experience',
          status,
          label: 'EXP',
          value: getExperienceProgress(mudState, isStarWarsConnection),
          max: mudState.experienceMax,
          accentClass: 'bar-exp',
            widthValue: getGaugeWidthValue(clientSettings.layout.gauges.experience),
          }),
        )
      }

      if (shouldRenderCombatGauge(clientSettings.layout.gauges.opponent.visibilityMode, opponentGaugeDataAvailable)) {
        nextBars.push(
          buildHudBar({
          id: 'opponent',
          status,
          label: mudState.opponentName?.trim() || 'Opp',
          value: mudState.opponentHealth,
          max: mudState.opponentHealthMax,
          accentClass: 'bar-opponent',
            widthValue: getGaugeWidthValue(clientSettings.layout.gauges.opponent),
          }),
        )
      }

      if (shouldRenderCombatGauge(clientSettings.layout.gauges.tank.visibilityMode, tankGaugeDataAvailable)) {
        nextBars.push(
          buildHudBar({
          id: 'tank',
          status,
          label: mudState.tankName?.trim() || 'Tank',
          value: mudState.tankHealth,
          max: mudState.tankHealthMax,
          accentClass: 'bar-tank',
            widthValue: getGaugeWidthValue(clientSettings.layout.gauges.tank),
          }),
        )
      }

      return nextBars
    },
    [clientSettings.layout.gauges, isStarWarsConnection, mudState, status],
  )

  const canConnect = proxyReady && status !== 'connecting'
  const connected = status === 'connected'
  const activeMsdpVariables = useMemo(() => normalizeMsdpVariableMap(clientSettings.msdp), [clientSettings.msdp])
  const terminalOutputStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${clientSettings.terminal.fontSize}px`,
      lineHeight: clientSettings.terminal.lineHeight,
      whiteSpace: clientSettings.terminal.wrapLines ? 'pre-wrap' : 'pre',
      wordBreak: clientSettings.terminal.wrapLines ? 'break-word' : 'normal',
    }),
    [clientSettings.terminal.fontSize, clientSettings.terminal.lineHeight, clientSettings.terminal.wrapLines],
  )
  const terminalOutputHtml = useMemo(() => createAnsiConverter().toHtml(terminalOutput), [terminalOutput])
  const minimapStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${clientSettings.minimap.fontSize}px`,
      height: `${clientSettings.minimap.paneHeight}rem`,
      minHeight: `${clientSettings.minimap.paneHeight}rem`,
    }),
    [clientSettings.minimap.fontSize, clientSettings.minimap.paneHeight],
  )
  const sidebarPanelStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily: SIDEBAR_FONT_FAMILIES[clientSettings.sidebar.fontFamily],
      fontSize: `${clientSettings.sidebar.fontSize}px`,
    }),
    [clientSettings.sidebar.fontFamily, clientSettings.sidebar.fontSize],
  )
  const layoutStyle = useMemo<CSSProperties & { '--layout-sidebar-width': string }>(
    () => ({
      '--layout-sidebar-width':
        clientSettings.layout.sidebarWidthUnit === 'percent'
          ? `${clientSettings.layout.sidebarWidthPercent}%`
          : `${clientSettings.layout.sidebarWidthPixels}px`,
    }),
    [
      clientSettings.layout.sidebarWidthPercent,
      clientSettings.layout.sidebarWidthPixels,
      clientSettings.layout.sidebarWidthUnit,
    ],
  )

  const asciiMapOutput = useMemo(() => buildAsciiMapOutput(mudState.minimap), [mudState.minimap])
  const isWildernessRoom = useMemo(() => isWildernessRoomVnum(mudState.roomVnum), [mudState.roomVnum])
  const activeGraphicMapData = useMemo(
    () => (isWildernessRoom ? mudState.wildernessGraphicMap ?? mudState.graphicMap : mudState.graphicMap),
    [isWildernessRoom, mudState.graphicMap, mudState.wildernessGraphicMap],
  )
  const graphicMap = useMemo(
    () => buildGraphicMap(activeGraphicMapData, isWildernessRoom ? undefined : mudState.minimap, isWildernessRoom),
    [activeGraphicMapData, isWildernessRoom, mudState.minimap],
  )
  const resolvedActiveMapTab = useMemo<MapPanelTabId>(
    () => visibleMapTabs.find((tab) => tab.id === activeMapTab)?.id ?? visibleMapTabs[0]?.id ?? activeMapTab,
    [activeMapTab, visibleMapTabs],
  )
  const resolvedActiveSidebarTab = useMemo<SidebarTabId>(
    () => visibleSidebarTabs.find((tab) => tab.id === activeSidebarTab)?.id ?? visibleSidebarTabs[0]?.id ?? activeSidebarTab,
    [activeSidebarTab, visibleSidebarTabs],
  )
  const activeMapPanel = useMemo(
    () => MAP_PANEL_TABS.find((tab) => tab.id === resolvedActiveMapTab) ?? MAP_PANEL_TABS[0],
    [resolvedActiveMapTab],
  )
  const selectedMudPreset = useMemo(
    () => uiSettings.connection.muds.find((mud) => mud.id === selectedMudId),
    [selectedMudId, uiSettings.connection.muds],
  )
  const isMinimalistMode = clientSettings.layout.minimalistMode
  const showMapPanel = visibleMapTabs.length > 0
  const showSidebarPanel = visibleSidebarTabs.length > 0
  const showMinimalistConnectionBar = isMinimalistMode && !connected
  const showHeader = showMinimalistConnectionBar || (!isMinimalistMode && isHeaderVisible)
  const showBranding = !isMinimalistMode && isHeaderVisible
  const showAbilityScores = clientSettings.layout.playerInfoSections.abilityScores
  const showSavingThrows = clientSettings.layout.playerInfoSections.savingThrows
  const showCharacterName = clientSettings.layout.playerInfoSections.characterName
  const showRace = clientSettings.layout.playerInfoSections.race
  const showClassName = clientSettings.layout.playerInfoSections.className
  const showPosition = clientSettings.layout.playerInfoSections.position
  const showAttack = clientSettings.layout.playerInfoSections.attack
  const showArmorClass = clientSettings.layout.playerInfoSections.armorClass
  const showAlignment = clientSettings.layout.playerInfoSections.alignment
  const showMoney = clientSettings.layout.playerInfoSections.money
  const showPlayerInfoStats = showPosition || showAttack || showArmorClass || showAlignment || showMoney
  const abilityScores = useMemo(
    () => [
      { label: 'STR', value: mudState.strength },
      { label: 'DEX', value: mudState.dexterity },
      { label: 'CON', value: mudState.constitution },
      { label: 'INT', value: mudState.intelligence },
      { label: 'WIS', value: mudState.wisdom },
      { label: 'CHA', value: mudState.charisma },
    ],
    [mudState.charisma, mudState.constitution, mudState.dexterity, mudState.intelligence, mudState.strength, mudState.wisdom],
  )
  const savingThrows = useMemo(
    () => [
      { label: 'Fort', value: mudState.fortitude },
      { label: 'Refl', value: mudState.reflex },
      { label: 'Will', value: mudState.willpower },
    ],
    [mudState.fortitude, mudState.reflex, mudState.willpower],
  )
  const characterHeading = useMemo(
    () => formatCharacterHeading(showCharacterName ? mudState.characterName : undefined, mudState.title),
    [mudState.characterName, mudState.title, showCharacterName],
  )
  const playerInfoSummary = useMemo(() => {
    const summaryParts = [
      mudState.level ? `Level ${mudState.level}` : undefined,
      showRace ? mudState.race : undefined,
      showClassName ? mudState.className : undefined,
    ].filter(Boolean)

    return summaryParts.join(' · ')
  }, [mudState.className, mudState.level, mudState.race, showClassName, showRace])
  const showCharacterHeading = showCharacterName || Boolean(mudState.title?.trim())

  useEffect(() => {
    if (!proxyReady) {
      return
    }

    focusCommandInput(commandInputRef.current)
  }, [connected, proxyReady])

  useEffect(() => {
    if (!connected) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target === commandInputRef.current || shouldPreservePointerFocus(event.target)) {
        return
      }

      focusCommandInput(commandInputRef.current)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [connected])

  useEffect(() => {
    if (!connected) {
      return
    }

    sendMessage({ type: 'msdp-config', msdpVariables: activeMsdpVariables, starWarsMode: isStarWarsConnection })
  }, [activeMsdpVariables, connected, isStarWarsConnection, sendMessage])

  useEffect(() => {
    if (!connected) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      if (shouldIgnoreKeyBindingTarget(event.target, commandInputRef.current)) {
        return
      }

      const keyBinding = clientSettings.keyBindings.find(
        (binding) => binding.enabled && binding.code === event.code && binding.command.trim(),
      )
      if (!keyBinding) {
        return
      }

      event.preventDefault()
      setHistoryIndex(null)
      setHistoryDraft('')
      setCommand('')
      dispatchInputText(keyBinding.command)
      focusCommandInput(commandInputRef.current)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [clientSettings.keyBindings, connected, dispatchInputText])

  function handleConnectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (connected) {
      sendMessage({ type: 'disconnect' })
      return
    }

    statusRef.current = 'connecting'
    setStatus('connecting')
    setStatusDetail(`Connecting to ${host}:${port}...`)
    sendMessage({ type: 'connect', host, port, msdpVariables: activeMsdpVariables, starWarsMode: isStarWarsConnection })
  }

  function handleMudPresetChange(mudId: string) {
    setSelectedMudId(mudId)
    if (mudId === CUSTOM_MUD_VALUE) {
      return
    }

    const preset = uiSettings.connection.muds.find((mud) => mud.id === mudId)
    if (!preset) {
      return
    }

    setHost(preset.host)
    setPort(preset.port)
  }

  function handleHostChange(nextHost: string) {
    setHost(nextHost)
    setSelectedMudId(
      findMatchingMudPresetId(uiSettings.connection.muds, nextHost, port) ?? CUSTOM_MUD_VALUE,
    )
  }

  function handlePortChange(nextPort: number) {
    setPort(nextPort)
    setSelectedMudId(
      findMatchingMudPresetId(uiSettings.connection.muds, host, nextPort) ?? CUSTOM_MUD_VALUE,
    )
  }

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!connected) {
      return
    }

    const trimmedCommand = command.trim()

    setHistoryIndex(null)
    setHistoryDraft('')

    if (!trimmedCommand) {
      sendInputLine('')
    } else {
      dispatchInputText(command)
    }

    setCommand('')
    focusCommandInput(commandInputRef.current)
  }

  function handleCommandKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }

    if (event.key === 'Tab') {
      const prefix = command.trim().toLowerCase()
      if (!prefix) {
        return
      }

      const matchingCommands = commandHistory.filter((entry) =>
        entry.trim().toLowerCase().startsWith(prefix),
      )
      if (matchingCommands.length === 0) {
        return
      }

      event.preventDefault()
      const completedCommand = matchingCommands[matchingCommands.length - 1]
      setCommand(completedCommand)
      setHistoryIndex(null)
      setHistoryDraft(completedCommand)
      return
    }

    if (event.key === 'ArrowUp') {
      if (commandHistory.length === 0) {
        return
      }

      event.preventDefault()

      if (historyIndex === null) {
        setHistoryDraft(command)
        setHistoryIndex(commandHistory.length - 1)
        setCommand(commandHistory[commandHistory.length - 1])
        return
      }

      if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1)
        setCommand(commandHistory[historyIndex - 1])
      }

      return
    }

    if (event.key !== 'ArrowDown' || historyIndex === null) {
      return
    }

    event.preventDefault()

    if (historyIndex < commandHistory.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setCommand(commandHistory[historyIndex + 1])
      return
    }

    setHistoryIndex(null)
    setCommand(historyDraft)
  }

  function updateAlias(aliasId: string, updates: Partial<AliasDefinition>) {
    setAliases((current) => current.map((alias) => (alias.id === aliasId ? { ...alias, ...updates } : alias)))
  }

  function updateTrigger(triggerId: string, updates: Partial<TriggerDefinition>) {
    setTriggers((current) =>
      current.map((trigger) => (trigger.id === triggerId ? { ...trigger, ...updates } : trigger)),
    )
  }

  function updateKeyBinding(keyBindingId: string, updates: Partial<KeyBindingDefinition>) {
    setClientSettings((current) => ({
      ...current,
      keyBindings: current.keyBindings.map((binding) =>
        binding.id === keyBindingId
          ? {
              ...binding,
              ...updates,
              command: updates.command !== undefined ? updates.command : binding.command,
            }
          : binding,
      ),
    }))
    setAutomationNotice(null)
  }

  function toggleAutomationMenu(menuId: AutomationMenuId) {
    setOpenAutomationMenu((current) => (current === menuId ? null : menuId))
  }

  function handleAddAlias() {
    setAliases((current) => [createEmptyAlias(), ...current])
    setAutomationNotice(null)
  }

  function handleAddTrigger() {
    setTriggers((current) => [createEmptyTrigger(), ...current])
    setAutomationNotice(null)
  }

  function handleAddKeyBinding() {
    setClientSettings((current) => ({
      ...current,
      keyBindings: [createEmptyKeyBinding(), ...current.keyBindings],
    }))
    setAutomationNotice(null)
  }

  function handleResetKeyBindings() {
    setClientSettings((current) => ({
      ...current,
      keyBindings: getDefaultKeyBindings(),
    }))
    setAutomationNotice({
      kind: 'success',
      text: 'Restored the default numpad movement and look key bindings.',
    })
  }

  function handleKeyBindingCapture(event: ReactKeyboardEvent<HTMLInputElement>, keyBindingId: string) {
    if (event.key === 'Tab') {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      updateKeyBinding(keyBindingId, { code: '', key: '' })
      return
    }

    const nextCode = event.code
    if (!nextCode) {
      return
    }

    setClientSettings((current) => ({
      ...current,
      keyBindings: current.keyBindings.map((binding) => {
        if (binding.id === keyBindingId) {
          return {
            ...binding,
            code: nextCode,
            key: event.key,
          }
        }

        if (binding.code === nextCode) {
          return {
            ...binding,
            code: '',
            key: '',
          }
        }

        return binding
      }),
    }))
    setAutomationNotice(null)
  }

  function updateTerminalSettings(updates: Partial<ClientSettings['terminal']>) {
    const normalizedUpdates = {
      ...updates,
      ...(updates.maxHistoryLines !== undefined
        ? { maxHistoryLines: clampTerminalHistoryLines(updates.maxHistoryLines) }
        : {}),
    }

    setClientSettings((current) => ({
      ...current,
      terminal: {
        ...current.terminal,
        ...normalizedUpdates,
      },
    }))

    if (normalizedUpdates.maxHistoryLines !== undefined) {
      const maxHistoryLines = normalizedUpdates.maxHistoryLines
      terminalHistoryLineLimitRef.current = maxHistoryLines
      setTerminalOutput((current) => trimTerminalOutputLines(current, maxHistoryLines))
    }

    setAutomationNotice(null)
  }

  function updateMinimapSettings(updates: Partial<ClientSettings['minimap']>) {
    let nextMapTab: MapPanelTabId | null = null

    setClientSettings((current) => {
      const nextSettings = normalizeClientSettings({
        ...current,
        minimap: {
          ...current.minimap,
          ...updates,
        },
      })

      if (updates.defaultMapType !== undefined) {
        nextMapTab = getDefaultMapPanelTab(nextSettings)
      }

      return nextSettings
    })

    if (nextMapTab) {
      setActiveMapTab(nextMapTab)
    }

    setAutomationNotice(null)
  }

  function updateSidebarSettings(updates: Partial<ClientSettings['sidebar']>) {
    setClientSettings((current) => ({
      ...current,
      sidebar: {
        ...current.sidebar,
        ...updates,
      },
    }))
    setAutomationNotice(null)
  }

  function updateConnectionSettings(updates: Partial<ClientSettings['connection']>) {
    setClientSettings((current) => {
      const nextSettings = normalizeClientSettings({
        ...current,
        connection: {
          ...current.connection,
          ...updates,
        },
      })
      const connectionDefaults = resolveConnectionDefaults(uiSettings, nextSettings)
      setHost(connectionDefaults.host)
      setPort(connectionDefaults.port)
      setSelectedMudId(connectionDefaults.selectedMudId)
      return nextSettings
    })
    setAutomationNotice(null)
  }

  function updateLayoutSettings(updates: Partial<ClientSettings['layout']>) {
    setClientSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        ...updates,
      },
    }))
    setAutomationNotice(null)
  }

  function updateSidebarWidthUnit(sidebarWidthUnit: SidebarWidthUnit) {
    updateLayoutSettings({ sidebarWidthUnit })
  }

  function updateSidebarWidthPercent(sidebarWidthPercent: number) {
    updateLayoutSettings({ sidebarWidthPercent: clampSidebarWidthPercent(sidebarWidthPercent) })
  }

  function updateSidebarWidthPixels(sidebarWidthPixels: number) {
    updateLayoutSettings({ sidebarWidthPixels: clampSidebarWidthPixels(sidebarWidthPixels) })
  }

  function updateLayoutGaugeSettings(
    gaugeId: GaugeId,
    updates: Partial<StandardGaugeSettings & CombatGaugeSettings>,
  ) {
    setClientSettings((current) =>
      normalizeClientSettings({
        ...current,
        layout: {
          ...current.layout,
          gauges: {
            ...current.layout.gauges,
            [gaugeId]: {
              ...current.layout.gauges[gaugeId],
              ...updates,
            },
          },
        },
      }),
    )
    setAutomationNotice(null)
  }

  function updateGaugeVisibility(gaugeId: StandardGaugeId, visible: boolean) {
    updateLayoutGaugeSettings(gaugeId, { visible })
  }

  function updateCombatGaugeVisibilityMode(gaugeId: CombatGaugeId, visibilityMode: GaugeVisibilityMode) {
    updateLayoutGaugeSettings(gaugeId, { visibilityMode })
  }

  function updateGaugeWidthUnit(gaugeId: GaugeId, widthUnit: SidebarWidthUnit) {
    updateLayoutGaugeSettings(gaugeId, { widthUnit })
  }

  function updateGaugeWidthPercent(gaugeId: GaugeId, widthPercent: number) {
    updateLayoutGaugeSettings(gaugeId, { widthPercent: clampGaugeWidthPercent(widthPercent) })
  }

  function updateGaugeWidthPixels(gaugeId: GaugeId, widthPixels: number) {
    updateLayoutGaugeSettings(gaugeId, { widthPixels: clampGaugeWidthPixels(widthPixels) })
  }

  function updateLayoutMapPanelVisibility(panelId: MapPanelTabId, visible: boolean) {
    setClientSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        mapPanels: {
          ...current.layout.mapPanels,
          [panelId]: visible,
        },
      },
    }))
    setAutomationNotice(null)
  }

  function updateLayoutSidebarTabVisibility(tabId: SidebarTabId, visible: boolean) {
    setClientSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        sidebarTabs: {
          ...current.layout.sidebarTabs,
          [tabId]: visible,
        },
      },
    }))
    setAutomationNotice(null)
  }

  function updateLayoutPlayerInfoSectionVisibility(sectionId: PlayerInfoSectionId, visible: boolean) {
    setClientSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        playerInfoSections: {
          ...current.layout.playerInfoSections,
          [sectionId]: visible,
        },
      },
    }))
    setAutomationNotice(null)
  }

  function setAllLayoutVisibility(visible: boolean) {
    setClientSettings((current) => ({
      ...current,
      layout: {
        ...current.layout,
        gauges: {
          health: { ...current.layout.gauges.health, visible },
          psp: { ...current.layout.gauges.psp, visible },
          movement: { ...current.layout.gauges.movement, visible },
          experience: { ...current.layout.gauges.experience, visible },
          opponent: {
            ...current.layout.gauges.opponent,
            visibilityMode: visible ? 'combat' : 'never',
          },
          tank: {
            ...current.layout.gauges.tank,
            visibilityMode: visible ? 'combat' : 'never',
          },
        },
        mapPanels: {
          graphic: visible,
          graphicLegend: visible,
          ascii: visible,
          asciiLegend: visible,
        },
        sidebarTabs: {
          character: visible,
          quests: visible,
          group: visible,
          affects: visible,
        },
        playerInfoSections: {
          characterName: visible,
          race: visible,
          className: visible,
          abilityScores: visible,
          savingThrows: visible,
          position: visible,
          attack: visible,
          armorClass: visible,
          alignment: visible,
          money: visible,
        },
      },
    }))
    setAutomationNotice(null)
  }

  function updateMsdpVariable(key: MsdpVariableKey, nextValue: string) {
    setClientSettings((current) => ({
      ...current,
      msdp: {
        ...current.msdp,
        [key]: nextValue,
      },
    }))
    setAutomationNotice(null)
  }

  function handleConfigExport() {
    downloadJsonFile('luminari-web-client-config.json', {
      type: 'luminari-web-client-config',
      version: CLIENT_CONFIG_EXPORT_VERSION,
      settings: normalizeClientSettings(clientSettings),
      aliases,
      triggers,
    })
    setOpenAutomationMenu(null)
    setAutomationNotice({
      kind: 'success',
      text: `Saved settings, ${aliases.length} alias${pluralize(aliases.length)}, and ${triggers.length} trigger${pluralize(triggers.length)} to file.`,
    })
  }

  async function handleConfigImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    try {
      const importedConfig = parseClientConfigImport(await file.text(), clientSettings, aliases, triggers)
      setClientSettings(importedConfig.settings)
      const connectionDefaults = resolveConnectionDefaults(uiSettings, importedConfig.settings)
      setHost(connectionDefaults.host)
      setPort(connectionDefaults.port)
      setSelectedMudId(connectionDefaults.selectedMudId)
      terminalHistoryLineLimitRef.current = importedConfig.settings.terminal.maxHistoryLines
      setTerminalOutput((current) => trimTerminalOutputLines(current, importedConfig.settings.terminal.maxHistoryLines))
      setActiveSidebarTab(getDefaultSidebarTab(importedConfig.settings))
      setActiveMapTab(getDefaultMapPanelTab(importedConfig.settings))
      setAliases(importedConfig.aliases)
      setTriggers(importedConfig.triggers)
      setOpenAutomationMenu(null)
      setAutomationNotice({
        kind: 'success',
        text: `Loaded settings, ${importedConfig.aliases.length} alias${pluralize(importedConfig.aliases.length)}, and ${importedConfig.triggers.length} trigger${pluralize(importedConfig.triggers.length)} from ${file.name}.`,
      })
    } catch (error) {
      setAutomationNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Failed to load configuration.',
      })
    }
  }

  function handleTerminalScroll() {
    const isAtBottom = isTerminalScrolledToBottom(terminalRef.current)
    terminalShouldFollowOutputRef.current = isAtBottom

    if (isAtBottom) {
      setHasUnreadTerminalOutput(false)
    }
  }

  function handleTerminalClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!connected || event.button !== 0 || hasExpandedSelection()) {
      return
    }

    focusCommandInput(commandInputRef.current)
  }

  function handleUnreadTerminalOutputClick() {
    terminalShouldFollowOutputRef.current = true
    scrollTerminalElementToBottom(terminalRef.current)
    setHasUnreadTerminalOutput(false)
    focusCommandInput(commandInputRef.current)
  }

  return (
    <div className={`app-shell${isMinimalistMode ? ' app-shell-minimalist' : ''}`}>
      <div ref={menuBarRef} className="window-menu-bar panel" data-prevent-command-focus>
        <div className="window-menu-links" role="menubar" aria-label="Window menu">
          {connected && !isMinimalistMode ? (
            <button type="button" className="window-menu-link" onClick={() => setIsHeaderVisible((current) => !current)}>
              {isHeaderVisible ? 'Hide Header' : 'Show Header'}
            </button>
          ) : null}

          <div className="window-menu-item">
            <button
              type="button"
              className={`window-menu-link${openAutomationMenu === 'aliases' ? ' window-menu-link-open' : ''}`}
              aria-expanded={openAutomationMenu === 'aliases'}
              onClick={() => toggleAutomationMenu('aliases')}
            >
              Aliases
            </button>

            {openAutomationMenu === 'aliases' ? (
              <div className="window-menu-dropdown">
                <div className="automation-menu-content">
                  <div className="automation-section-header">
                    <div>
                      <h3>Aliases</h3>
                      <p>Literal aliases match the command name and put remaining text into %1.</p>
                    </div>

                    <div className="automation-actions">
                      <button type="button" onClick={handleAddAlias}>
                        Add
                      </button>
                    </div>
                  </div>

                  <p className="automation-menu-help">
                    Use <code>*</code> as a wildcard and <code>%1</code> through <code>%9</code> in expansions.
                  </p>

                  {aliases.length === 0 ? (
                    <p className="automation-empty">No aliases saved yet.</p>
                  ) : (
                    <div className="automation-list">
                      {aliases.map((alias) => (
                        <div key={alias.id} className="automation-item">
                          <div className="automation-item-header">
                            <label className="automation-toggle">
                              <input
                                type="checkbox"
                                checked={alias.enabled}
                                onChange={(event) => updateAlias(alias.id, { enabled: event.target.checked })}
                              />
                              <span>{alias.enabled ? 'Enabled' : 'Disabled'}</span>
                            </label>

                            <button
                              type="button"
                              className="automation-delete"
                              onClick={() => setAliases((current) => current.filter((entry) => entry.id !== alias.id))}
                            >
                              Delete
                            </button>
                          </div>

                          <div className="automation-fields">
                            <label>
                              <span>Pattern</span>
                              <input
                                value={alias.pattern}
                                onChange={(event) => updateAlias(alias.id, { pattern: event.target.value })}
                                placeholder="k *"
                              />
                            </label>

                            <label>
                              <span>Expansion</span>
                              <textarea
                                rows={2}
                                value={alias.expansion}
                                onChange={(event) => updateAlias(alias.id, { expansion: event.target.value })}
                                placeholder="kill %1"
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="window-menu-item">
            <button
              type="button"
              className={`window-menu-link${openAutomationMenu === 'triggers' ? ' window-menu-link-open' : ''}`}
              aria-expanded={openAutomationMenu === 'triggers'}
              onClick={() => toggleAutomationMenu('triggers')}
            >
              Triggers
            </button>

            {openAutomationMenu === 'triggers' ? (
              <div className="window-menu-dropdown">
                <div className="automation-menu-content">
                  <div className="automation-section-header">
                    <div>
                      <h3>Triggers</h3>
                      <p>Literal trigger patterns match anywhere in a line; wildcards let you capture text.</p>
                    </div>

                    <div className="automation-actions">
                      <button type="button" onClick={handleAddTrigger}>
                        Add
                      </button>
                    </div>
                  </div>

                  <p className="automation-menu-help">
                    Use <code>*</code> as a wildcard and <code>%1</code> through <code>%9</code> in actions.
                  </p>

                  {triggers.length === 0 ? (
                    <p className="automation-empty">No triggers saved yet.</p>
                  ) : (
                    <div className="automation-list">
                      {triggers.map((trigger) => (
                        <div key={trigger.id} className="automation-item">
                          <div className="automation-item-header">
                            <label className="automation-toggle">
                              <input
                                type="checkbox"
                                checked={trigger.enabled}
                                onChange={(event) => updateTrigger(trigger.id, { enabled: event.target.checked })}
                              />
                              <span>{trigger.enabled ? 'Enabled' : 'Disabled'}</span>
                            </label>

                            <button
                              type="button"
                              className="automation-delete"
                              onClick={() => setTriggers((current) => current.filter((entry) => entry.id !== trigger.id))}
                            >
                              Delete
                            </button>
                          </div>

                          <div className="automation-fields">
                            <label>
                              <span>Pattern</span>
                              <input
                                value={trigger.pattern}
                                onChange={(event) => updateTrigger(trigger.id, { pattern: event.target.value })}
                                placeholder="* tells you '*'"
                              />
                            </label>

                            <label>
                              <span>Action</span>
                              <textarea
                                rows={2}
                                value={trigger.action}
                                onChange={(event) => updateTrigger(trigger.id, { action: event.target.value })}
                                placeholder="tell %1 Thanks for the message."
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="window-menu-item">
            <button
              type="button"
              className={`window-menu-link${openAutomationMenu === 'keyBindings' ? ' window-menu-link-open' : ''}`}
              aria-expanded={openAutomationMenu === 'keyBindings'}
              onClick={() => toggleAutomationMenu('keyBindings')}
            >
              Key Bindings
            </button>

            {openAutomationMenu === 'keyBindings' ? (
              <div className="window-menu-dropdown">
                <div className="automation-menu-content">
                  <div className="automation-section-header">
                    <div>
                      <h3>Key Bindings</h3>
                      <p>Map keys to commands that are sent while you are connected.</p>
                    </div>

                    <div className="automation-actions">
                      <button type="button" onClick={handleAddKeyBinding}>
                        Add
                      </button>
                      <button type="button" onClick={handleResetKeyBindings}>
                        Reset
                      </button>
                    </div>
                  </div>

                  <p className="automation-menu-help">
                    Click a key field and press a key to capture it. Backspace or Delete clears a key.
                  </p>

                  {clientSettings.keyBindings.length === 0 ? (
                    <p className="automation-empty">No key bindings saved yet.</p>
                  ) : (
                    <div className="automation-list">
                      {clientSettings.keyBindings.map((binding) => (
                        <div key={binding.id} className="automation-item">
                          <div className="automation-item-header">
                            <label className="automation-toggle">
                              <input
                                type="checkbox"
                                checked={binding.enabled}
                                onChange={(event) => updateKeyBinding(binding.id, { enabled: event.target.checked })}
                              />
                              <span>{binding.enabled ? 'Enabled' : 'Disabled'}</span>
                            </label>

                            <button
                              type="button"
                              className="automation-delete"
                              onClick={() =>
                                setClientSettings((current) => ({
                                  ...current,
                                  keyBindings: current.keyBindings.filter((entry) => entry.id !== binding.id),
                                }))
                              }
                            >
                              Delete
                            </button>
                          </div>

                          <div className="key-binding-fields">
                            <label>
                              <span>Key</span>
                              <input
                                className="key-binding-key-input"
                                value={formatKeyBindingLabel(binding)}
                                onKeyDown={(event) => handleKeyBindingCapture(event, binding.id)}
                                onFocus={(event) => event.currentTarget.select()}
                                readOnly
                                aria-label={`Key for command ${binding.command || 'without command'}`}
                              />
                            </label>

                            <label>
                              <span>Command</span>
                              <input
                                value={binding.command}
                                onChange={(event) => updateKeyBinding(binding.id, { command: event.target.value })}
                                placeholder="look"
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="window-menu-item">
            <button
              type="button"
              className={`window-menu-link${openAutomationMenu === 'msdpVars' ? ' window-menu-link-open' : ''}`}
              aria-expanded={openAutomationMenu === 'msdpVars'}
              onClick={() => toggleAutomationMenu('msdpVars')}
            >
              MSDP Vars
            </button>

            {openAutomationMenu === 'msdpVars' ? (
              <div className="window-menu-dropdown">
                <div className="automation-menu-content">
                  <div className="automation-section-header">
                    <div>
                      <h3>MSDP Vars</h3>
                      <p>Rename the MSDP variable names this client requests and parses.</p>
                    </div>
                  </div>

                  <p className="automation-menu-help">
                    These mappings are saved with your client settings and sent to the proxy when you connect.
                  </p>

                  <div className="settings-list">
                    {MSDP_VARIABLE_GROUPS.map((group) => (
                      <section key={group.title} className="settings-group">
                        <div className="settings-group-header">
                          <h4>{group.title}</h4>
                          <p>{group.description}</p>
                        </div>

                        <div className="msdp-vars-grid">
                          {group.fields.map((field) => (
                            <label key={field.key}>
                              <span>{field.label}</span>
                              <input
                                value={clientSettings.msdp[field.key]}
                                onChange={(event) => updateMsdpVariable(field.key, event.target.value)}
                                placeholder={defaultMsdpVariables[field.key]}
                              />
                            </label>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="window-menu-item">
            <button
              type="button"
              className={`window-menu-link${openAutomationMenu === 'layout' ? ' window-menu-link-open' : ''}`}
              aria-expanded={openAutomationMenu === 'layout'}
              onClick={() => toggleAutomationMenu('layout')}
            >
              Layout
            </button>

            {openAutomationMenu === 'layout' ? (
              <div className="window-menu-dropdown">
                <div className="automation-menu-content">
                  <div className="automation-section-header">
                    <div>
                      <h3>Layout</h3>
                      <p>Choose which map views, sidebar tabs, and player info details remain visible in the client.</p>
                    </div>

                    <div className="automation-actions">
                      <button type="button" onClick={() => setAllLayoutVisibility(true)}>
                        All on
                      </button>
                      <button type="button" onClick={() => setAllLayoutVisibility(false)}>
                        All off
                      </button>
                    </div>
                  </div>

                  <div className="settings-list">
                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Screen layout</h4>
                        <p>Hide the header, sidebar panels, and gauges so small screens can focus on the main output.</p>
                      </div>

                      <div className="settings-toggle-list">
                        <label className="automation-toggle">
                          <input
                            type="checkbox"
                            checked={clientSettings.layout.minimalistMode}
                            onChange={(event) => updateLayoutSettings({ minimalistMode: event.target.checked })}
                          />
                          <span>Minimalist mode</span>
                        </label>
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Sidebar width</h4>
                        <p>Choose whether the sidebar width uses a percentage of the layout or a fixed pixel width.</p>
                      </div>

                      <div className="settings-fields">
                        <label>
                          <span>Width mode</span>
                          <select
                            value={clientSettings.layout.sidebarWidthUnit}
                            onChange={(event) => {
                              if (isSidebarWidthUnit(event.target.value)) {
                                updateSidebarWidthUnit(event.target.value)
                              }
                            }}
                          >
                            {SIDEBAR_WIDTH_UNIT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Percent width</span>
                          <input
                            type="number"
                            min={15}
                            max={50}
                            step={1}
                            inputMode="numeric"
                            value={clientSettings.layout.sidebarWidthPercent}
                            onChange={(event) => {
                              const nextValue = parsePositiveIntegerInput(event.target.value)
                              if (nextValue !== null) {
                                updateSidebarWidthPercent(nextValue)
                              }
                            }}
                          />
                        </label>

                        <label>
                          <span>Pixel width</span>
                          <input
                            type="number"
                            min={240}
                            max={960}
                            step={1}
                            inputMode="numeric"
                            value={clientSettings.layout.sidebarWidthPixels}
                            onChange={(event) => {
                              const nextValue = parsePositiveIntegerInput(event.target.value)
                              if (nextValue !== null) {
                                updateSidebarWidthPixels(nextValue)
                              }
                            }}
                          />
                        </label>
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>HUD gauges</h4>
                        <p>Show or hide each gauge, control opponent and tank visibility rules, and size each bar in percent or pixels.</p>
                      </div>

                      <div className="automation-list">
                        {STANDARD_GAUGE_OPTIONS.map((option) => {
                          const gaugeSettings = clientSettings.layout.gauges[option.id]

                          return (
                            <div key={option.id} className="automation-item">
                              <div className="automation-item-header">
                                <strong>{option.label}</strong>

                                <label className="automation-toggle">
                                  <input
                                    type="checkbox"
                                    checked={gaugeSettings.visible}
                                    onChange={(event) => updateGaugeVisibility(option.id, event.target.checked)}
                                  />
                                  <span>{gaugeSettings.visible ? 'Shown' : 'Hidden'}</span>
                                </label>
                              </div>

                              <div className="settings-fields">
                                <label>
                                  <span>Width mode</span>
                                  <select
                                    value={gaugeSettings.widthUnit}
                                    onChange={(event) => {
                                      if (isSidebarWidthUnit(event.target.value)) {
                                        updateGaugeWidthUnit(option.id, event.target.value)
                                      }
                                    }}
                                  >
                                    {SIDEBAR_WIDTH_UNIT_OPTIONS.map((widthOption) => (
                                      <option key={widthOption.value} value={widthOption.value}>
                                        {widthOption.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  <span>Percent width</span>
                                  <input
                                    type="number"
                                    min={15}
                                    max={100}
                                    step={1}
                                    inputMode="numeric"
                                    value={gaugeSettings.widthPercent}
                                    onChange={(event) => {
                                      const nextValue = parsePositiveIntegerInput(event.target.value)
                                      if (nextValue !== null) {
                                        updateGaugeWidthPercent(option.id, nextValue)
                                      }
                                    }}
                                  />
                                </label>

                                <label>
                                  <span>Pixel width</span>
                                  <input
                                    type="number"
                                    min={120}
                                    max={960}
                                    step={1}
                                    inputMode="numeric"
                                    value={gaugeSettings.widthPixels}
                                    onChange={(event) => {
                                      const nextValue = parsePositiveIntegerInput(event.target.value)
                                      if (nextValue !== null) {
                                        updateGaugeWidthPixels(option.id, nextValue)
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )
                        })}

                        {COMBAT_GAUGE_OPTIONS.map((option) => {
                          const gaugeSettings = clientSettings.layout.gauges[option.id]

                          return (
                            <div key={option.id} className="automation-item">
                              <div className="automation-item-header">
                                <div>
                                  <strong>{option.label}</strong>
                                  <p className="automation-menu-help">
                                    Choose whether this bar stays hidden, appears only in combat, or stays visible all the time.
                                  </p>
                                </div>
                              </div>

                              <div className="settings-fields">
                                <label>
                                  <span>Visibility</span>
                                  <select
                                    value={gaugeSettings.visibilityMode}
                                    onChange={(event) => {
                                      if (isGaugeVisibilityMode(event.target.value)) {
                                        updateCombatGaugeVisibilityMode(option.id, event.target.value)
                                      }
                                    }}
                                  >
                                    {GAUGE_VISIBILITY_MODE_OPTIONS.map((visibilityOption) => (
                                      <option key={visibilityOption.value} value={visibilityOption.value}>
                                        {visibilityOption.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  <span>Width mode</span>
                                  <select
                                    value={gaugeSettings.widthUnit}
                                    onChange={(event) => {
                                      if (isSidebarWidthUnit(event.target.value)) {
                                        updateGaugeWidthUnit(option.id, event.target.value)
                                      }
                                    }}
                                  >
                                    {SIDEBAR_WIDTH_UNIT_OPTIONS.map((widthOption) => (
                                      <option key={widthOption.value} value={widthOption.value}>
                                        {widthOption.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  <span>Percent width</span>
                                  <input
                                    type="number"
                                    min={15}
                                    max={100}
                                    step={1}
                                    inputMode="numeric"
                                    value={gaugeSettings.widthPercent}
                                    onChange={(event) => {
                                      const nextValue = parsePositiveIntegerInput(event.target.value)
                                      if (nextValue !== null) {
                                        updateGaugeWidthPercent(option.id, nextValue)
                                      }
                                    }}
                                  />
                                </label>

                                <label>
                                  <span>Pixel width</span>
                                  <input
                                    type="number"
                                    min={120}
                                    max={960}
                                    step={1}
                                    inputMode="numeric"
                                    value={gaugeSettings.widthPixels}
                                    onChange={(event) => {
                                      const nextValue = parsePositiveIntegerInput(event.target.value)
                                      if (nextValue !== null) {
                                        updateGaugeWidthPixels(option.id, nextValue)
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Map tabs</h4>
                        <p>Toggle the graphic and ASCII map tabs and their legends on or off.</p>
                      </div>

                      <div className="settings-toggle-list">
                        {LAYOUT_MAP_TOGGLE_OPTIONS.map((option) => (
                          <label key={option.id} className="automation-toggle">
                            <input
                              type="checkbox"
                              checked={clientSettings.layout.mapPanels[option.id]}
                              onChange={(event) => updateLayoutMapPanelVisibility(option.id, event.target.checked)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Sidebar tabs</h4>
                        <p>Show or hide the Player info, Group, Affects, and Quest tabs.</p>
                      </div>

                      <div className="settings-toggle-list">
                        {LAYOUT_SIDEBAR_TOGGLE_OPTIONS.map((option) => (
                          <label key={option.id} className="automation-toggle">
                            <input
                              type="checkbox"
                              checked={clientSettings.layout.sidebarTabs[option.id]}
                              onChange={(event) => updateLayoutSidebarTabVisibility(option.id, event.target.checked)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Player info details</h4>
                        <p>Choose which sections remain visible inside the Player info tab.</p>
                      </div>

                      {!clientSettings.layout.sidebarTabs.character ? (
                        <p className="automation-menu-help">Turn the Player info tab back on to show these details.</p>
                      ) : null}

                      <div className="settings-toggle-list">
                        {PLAYER_INFO_SECTION_TOGGLE_OPTIONS.map((option) => (
                          <label key={option.id} className="automation-toggle">
                            <input
                              type="checkbox"
                              checked={clientSettings.layout.playerInfoSections[option.id]}
                              disabled={!clientSettings.layout.sidebarTabs.character}
                              onChange={(event) => updateLayoutPlayerInfoSectionVisibility(option.id, event.target.checked)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="window-menu-item">
            <button
              type="button"
              className={`window-menu-link${openAutomationMenu === 'settings' ? ' window-menu-link-open' : ''}`}
              aria-expanded={openAutomationMenu === 'settings'}
              onClick={() => toggleAutomationMenu('settings')}
            >
              Settings
            </button>

            {openAutomationMenu === 'settings' ? (
              <div className="window-menu-dropdown">
                <div className="automation-menu-content">
                  <div className="automation-section-header">
                    <div>
                      <h3>Settings</h3>
                      <p>Adjust output behavior and save or load your full client configuration.</p>
                    </div>

                    <div className="automation-actions">
                      <button type="button" onClick={() => configFileInputRef.current?.click()}>
                        Load
                      </button>
                      <button type="button" onClick={handleConfigExport}>
                        Save
                      </button>
                    </div>
                  </div>

                  <p className="automation-menu-help">
                    Saved config files include display settings, key bindings, MSDP variable mappings, aliases, and triggers.
                  </p>

                  <div className="settings-list">
                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Connection defaults</h4>
                        <p>Choose the MUD selected on load, or save a named custom host and port.</p>
                      </div>

                      <div className="settings-fields">
                        <label>
                          <span>Default MUD</span>
                          <select
                            value={clientSettings.connection.defaultMudId}
                            onChange={(event) => updateConnectionSettings({ defaultMudId: event.target.value })}
                          >
                            {uiSettings.connection.muds.map((mud) => (
                              <option key={mud.id} value={mud.id}>
                                {mud.name}
                              </option>
                            ))}
                            <option value={CUSTOM_MUD_VALUE}>{getCustomMudOptionLabel(clientSettings)}</option>
                          </select>
                        </label>
                      </div>

                      {clientSettings.connection.defaultMudId === CUSTOM_MUD_VALUE ? (
                        <div className="settings-fields">
                          <label>
                            <span>Custom MUD name</span>
                            <input
                              value={clientSettings.connection.customMudName}
                              onChange={(event) => updateConnectionSettings({ customMudName: event.target.value })}
                              placeholder="My MUD"
                            />
                          </label>

                          <label>
                            <span>Custom host</span>
                            <input
                              value={clientSettings.connection.customHost}
                              onChange={(event) => updateConnectionSettings({ customHost: event.target.value })}
                              placeholder={DEFAULT_HOST}
                            />
                          </label>

                          <label>
                            <span>Custom port</span>
                            <input
                              type="number"
                              min={1}
                              max={65535}
                              step={1}
                              inputMode="numeric"
                              value={clientSettings.connection.customPort}
                              onChange={(event) => {
                                const nextValue = parsePositiveIntegerInput(event.target.value)
                                if (nextValue !== null) {
                                  updateConnectionSettings({ customPort: nextValue })
                                }
                              }}
                            />
                          </label>
                        </div>
                      ) : null}
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Output window</h4>
                        <p>Fine-tune readability and scrolling in the main MUD output pane.</p>
                      </div>

                      <div className="settings-fields">
                        <label>
                          <span>Font size</span>
                          <select
                            value={String(clientSettings.terminal.fontSize)}
                            onChange={(event) =>
                              updateTerminalSettings({ fontSize: Number.parseInt(event.target.value, 10) })
                            }
                          >
                            {OUTPUT_FONT_SIZE_OPTIONS.map((fontSize) => (
                              <option key={fontSize} value={fontSize}>
                                {fontSize}px
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>History lines</span>
                          <input
                            type="number"
                            min={1}
                            max={MAX_TERMINAL_HISTORY_LINES}
                            step={1}
                            inputMode="numeric"
                            value={clientSettings.terminal.maxHistoryLines}
                            onChange={(event) => {
                              const nextValue = parsePositiveIntegerInput(event.target.value)
                              if (nextValue !== null) {
                                updateTerminalSettings({ maxHistoryLines: clampTerminalHistoryLines(nextValue) })
                              }
                            }}
                          />
                        </label>

                        <label>
                          <span>Line spacing</span>
                          <select
                            value={String(clientSettings.terminal.lineHeight)}
                            onChange={(event) =>
                              updateTerminalSettings({ lineHeight: Number.parseFloat(event.target.value) })
                            }
                          >
                            {OUTPUT_LINE_HEIGHT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="settings-toggle-list">
                        <label className="automation-toggle">
                          <input
                            type="checkbox"
                            checked={clientSettings.terminal.autoScroll}
                            onChange={(event) => updateTerminalSettings({ autoScroll: event.target.checked })}
                          />
                          <span>Follow new output when at bottom</span>
                        </label>

                        <label className="automation-toggle">
                          <input
                            type="checkbox"
                            checked={clientSettings.terminal.wrapLines}
                            onChange={(event) => updateTerminalSettings({ wrapLines: event.target.checked })}
                          />
                          <span>Wrap long lines in the output window</span>
                        </label>
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Minimap</h4>
                        <p>Control the map text size, pane height, and which map view opens by default.</p>
                      </div>

                      <div className="settings-fields">
                        <label>
                          <span>Default map</span>
                          <select
                            value={clientSettings.minimap.defaultMapType}
                            onChange={(event) => {
                              if (isDefaultMapType(event.target.value)) {
                                updateMinimapSettings({ defaultMapType: event.target.value })
                              }
                            }}
                          >
                            {DEFAULT_MAP_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Font size</span>
                          <input
                            type="number"
                            min={8}
                            max={48}
                            step={1}
                            inputMode="numeric"
                            value={clientSettings.minimap.fontSize}
                            onChange={(event) => {
                              const nextValue = parsePositiveIntegerInput(event.target.value)
                              if (nextValue !== null) {
                                updateMinimapSettings({ fontSize: nextValue })
                              }
                            }}
                          />
                        </label>

                        <label>
                          <span>Pane height</span>
                          <input
                            type="number"
                            min={6}
                            max={48}
                            step={1}
                            inputMode="numeric"
                            value={clientSettings.minimap.paneHeight}
                            onChange={(event) => {
                              const nextValue = parsePositiveIntegerInput(event.target.value)
                              if (nextValue !== null) {
                                updateMinimapSettings({ paneHeight: nextValue })
                              }
                            }}
                          />
                        </label>
                      </div>
                    </section>

                    <section className="settings-group">
                      <div className="settings-group-header">
                        <h4>Sidebar panels</h4>
                        <p>Use one shared font for character info, quests, group, and affects.</p>
                      </div>

                      <div className="settings-fields">
                        <label>
                          <span>Panel font</span>
                          <select
                            value={clientSettings.sidebar.fontFamily}
                            onChange={(event) => {
                              if (isSidebarFontFamily(event.target.value)) {
                                updateSidebarSettings({ fontFamily: event.target.value })
                              }
                            }}
                          >
                            {SIDEBAR_FONT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Panel font size</span>
                          <input
                            type="number"
                            min={8}
                            max={32}
                            step={1}
                            inputMode="numeric"
                            value={clientSettings.sidebar.fontSize}
                            onChange={(event) => {
                              const nextValue = parsePositiveIntegerInput(event.target.value)
                              if (nextValue !== null) {
                                updateSidebarSettings({ fontSize: nextValue })
                              }
                            }}
                          />
                        </label>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {automationNotice ? (
          <p className={`window-menu-status window-menu-status-${automationNotice.kind}`}>{automationNotice.text}</p>
        ) : null}

        <input
          ref={configFileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={handleConfigImport}
        />
      </div>

      {showHeader ? (
        <div className="app-header" data-prevent-command-focus>
          <header className="topbar">
            {showBranding ? (
              <div>
                <p className="eyebrow">{uiSettings.personalization.eyebrow}</p>
                <h1>{uiSettings.personalization.title}</h1>
                <p className="subtitle">{uiSettings.personalization.subtitle}</p>
              </div>
            ) : null}

            <form className="connection-form panel" onSubmit={handleConnectionSubmit}>
              {uiSettings.connection.muds.length > 0 ? (
                <label>
                  <span>MUD</span>
                  <select value={selectedMudId} onChange={(event) => handleMudPresetChange(event.target.value)}>
                    {uiSettings.connection.muds.map((mud) => (
                      <option key={mud.id} value={mud.id}>
                        {mud.name}
                      </option>
                    ))}
                    <option value={CUSTOM_MUD_VALUE}>{getCustomMudOptionLabel(clientSettings)}</option>
                  </select>
                  {selectedMudPreset?.description ? (
                    <small className="connection-form-help">{selectedMudPreset.description}</small>
                  ) : null}
                </label>
              ) : null}

              <label>
                <span>Host</span>
                <input value={host} onChange={(event) => handleHostChange(event.target.value)} />
              </label>

              <label>
                <span>Port</span>
                <input
                  inputMode="numeric"
                  value={port}
                  onChange={(event) => handlePortChange(Number(event.target.value) || DEFAULT_PORT)}
                />
              </label>

              <button type="submit" disabled={!canConnect}>
                {connected ? 'Disconnect' : status === 'connecting' ? 'Connecting…' : 'Connect'}
              </button>
            </form>
          </header>

          <section className="status-row">
            <div className={`status-pill status-${status}`}>{status}</div>
            <p>{statusDetail}</p>
          </section>
        </div>
      ) : null}

      <main className={`layout${isMinimalistMode ? ' layout-minimalist' : ''}`} style={layoutStyle}>
        <section className="terminal-column panel">
          <div className="terminal-output-shell">
            <div
              ref={terminalRef}
              className="terminal-output"
              data-prevent-command-focus
              onClick={handleTerminalClick}
              onScroll={handleTerminalScroll}
              style={terminalOutputStyle}
              dangerouslySetInnerHTML={{ __html: terminalOutputHtml }}
            />

            {hasUnreadTerminalOutput ? (
              <button
                type="button"
                className="terminal-new-output-button"
                data-prevent-command-focus
                aria-label="New output available. Jump to latest output."
                onClick={handleUnreadTerminalOutputClick}
              >
                New output
              </button>
            ) : null}
          </div>

          {isMinimalistMode || bars.length === 0 ? null : (
            <>
              {isStarWarsConnection ? <StarWarsResourceInfo mudState={mudState} /> : null}
              <div className="bars">
                {bars.map((bar) => (
                  <StatusBar key={bar.id} bar={bar} />
                ))}
              </div>
            </>
          )}

          <form className="command-form" onSubmit={handleCommandSubmit}>
            <input
              ref={commandInputRef}
              value={command}
              onChange={(event) => {
                setCommand(event.target.value)
                setHistoryIndex(null)
                setHistoryDraft(event.target.value)
              }}
              onKeyDown={handleCommandKeyDown}
              placeholder={connected ? 'Type a command…' : 'Connect before sending commands.'}
              readOnly={!connected}
            />
            <button type="submit" disabled={!connected}>
              Send
            </button>
          </form>
        </section>

        {isMinimalistMode || (!showMapPanel && !showSidebarPanel) ? null : (
          <aside className="sidebar">
            {showMapPanel ? (
              <section className="panel map-panel">
                <div className="panel-header">
                  <div>
                    <h2>Map</h2>
                  </div>
                </div>

                <div className="map-tab-strip" role="tablist" aria-label="Map views">
                  {visibleMapTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={resolvedActiveMapTab === tab.id}
                      className={`map-tab-button${resolvedActiveMapTab === tab.id ? ' map-tab-button-active' : ''}`}
                      onClick={() => setActiveMapTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="map-tab-panel" role="tabpanel" aria-label={activeMapPanel.panelLabel}>
                  {resolvedActiveMapTab === 'graphic' ? (
                    graphicMap ? (
                      <div className="minimap minimap-graphic" style={minimapStyle}>
                        <div
                          className="graphic-map"
                          style={{
                            gridTemplateColumns: `repeat(${graphicMap.width}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${graphicMap.height}, minmax(0, 1fr))`,
                            aspectRatio: `${graphicMap.width} / ${graphicMap.height}`,
                            width: '100%',
                            maxWidth: `${clientSettings.minimap.paneHeight}rem`,
                            maxHeight: `${clientSettings.minimap.paneHeight}rem`,
                          }}
                        >
                          {graphicMap.cells.map((cell) => (
                            <div
                              key={cell.key}
                              className={[
                                'graphic-map-cell',
                                cell.kind === 'room'
                                  ? `graphic-map-tile${cell.isCurrent ? ' graphic-map-tile-current' : ''}`
                                  : cell.kind === 'connector'
                                    ? `graphic-map-connector graphic-map-connector-${cell.orientation}`
                                    : 'graphic-map-empty',
                              ].join(' ')}
                              style={cell.color ? { color: cell.color, background: cell.kind === 'room' ? cell.color : undefined } : undefined}
                              title={cell.title}
                            >
                              {cell.kind === 'room' && cell.markers.length > 0 ? (
                                <div className="graphic-map-markers" aria-hidden="true">
                                  {cell.markers.map((marker) => (
                                    <span
                                      key={marker.id}
                                      className={marker.className ? `graphic-map-marker ${marker.className}` : 'graphic-map-marker'}
                                      title={marker.label}
                                    >
                                      {marker.icon}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="minimap" style={minimapStyle}>
                        Waiting for GRAPHIC_MAP MSDP data.
                      </div>
                    )
                  ) : resolvedActiveMapTab === 'graphicLegend' ? (
                    <div className="map-legend-pane" style={minimapStyle}>
                      <section className="map-legend-section">
                        <p className="map-legend-note">
                          Sector names cross-reference Krynn&apos;s ASCII map tables; swatches match this client&apos;s graphic-map colors.
                        </p>
                        <div className="map-legend-grid">
                          {GRAPHIC_MAP_LEGEND_ITEMS.map((item) => (
                            <div key={item.id} className="map-legend-item">
                              <span
                                className="map-legend-swatch"
                                style={{ background: getGraphicMapSectorColor(item.sector ?? 0, false) }}
                                aria-hidden="true"
                              />
                              <div className="map-legend-copy">
                                <strong>{item.label}</strong>
                                <span>{item.detail}</span>
                                {item.sample ? (
                                  <span
                                    className="map-legend-sample"
                                    dangerouslySetInnerHTML={{ __html: renderMudHtml(item.sample) }}
                                  />
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="map-legend-section">
                        <h3>Special exits</h3>
                        <p className="map-legend-note">
                          `GRAPHIC_MAP.sp` markers from Krynn&apos;s `build_graphic_map_specials()` output.
                        </p>
                        <div className="map-legend-grid map-legend-grid-compact">
                          {GRAPHIC_MAP_SPECIAL_LEGEND_ITEMS.map((item) => (
                            <div key={item.id} className="map-legend-item">
                              <span className="map-legend-symbol map-legend-symbol-large" aria-hidden="true">
                                {item.sample}
                              </span>
                              <div className="map-legend-copy">
                                <strong>{item.label}</strong>
                                <span>{item.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : resolvedActiveMapTab === 'ascii' ? (
                    <pre className="minimap map-ascii-pane" style={minimapStyle} dangerouslySetInnerHTML={{ __html: renderMudHtml(asciiMapOutput) }} />
                  ) : (
                    <div className="map-legend-pane" style={minimapStyle}>
                      <section className="map-legend-section">
                        <p className="map-legend-note">
                          Character samples cross-reference Krynn&apos;s `compact_door_info[]` and compact `map_info[]` entries in `asciimap.c`.
                        </p>
                        <div className="map-legend-grid map-legend-grid-ascii">
                          {ASCII_MAP_LEGEND_ITEMS.map((item) => (
                            <div key={item.id} className="map-legend-item">
                              <span
                                className="map-legend-symbol"
                                dangerouslySetInnerHTML={{ __html: renderMudHtml(item.sample ?? '') }}
                              />
                              <div className="map-legend-copy">
                                <strong>{item.label}</strong>
                                <span>{item.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {showSidebarPanel ? (
              <section className="panel tabbed-panel">
                <div className="tab-strip" role="tablist" aria-label="Sidebar sections">
                  {visibleSidebarTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={resolvedActiveSidebarTab === tab.id}
                      className={`tab-button${resolvedActiveSidebarTab === tab.id ? ' tab-button-active' : ''}`}
                      onClick={() => setActiveSidebarTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="tab-panel" role="tabpanel" style={sidebarPanelStyle}>
                  {resolvedActiveSidebarTab === 'character' ? (
                    <>
                      {showCharacterHeading || playerInfoSummary ? (
                        <div className="identity-block">
                          {showCharacterHeading ? (
                            <strong
                              dangerouslySetInnerHTML={{
                                __html: renderMudHtml(characterHeading),
                              }}
                            />
                          ) : null}
                          {playerInfoSummary ? (
                            <span
                              dangerouslySetInnerHTML={{
                                __html: renderMudHtml(playerInfoSummary),
                              }}
                            />
                          ) : null}
                        </div>
                      ) : null}

                      {showAbilityScores ? (
                        <div className="ability-grid" aria-label="Ability scores">
                          {abilityScores.map((score) => (
                            <div key={score.label} className="ability-cell">
                              <span className="ability-label">{score.label}</span>
                              <span className="ability-value">{formatNumber(score.value) ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {showSavingThrows ? (
                        <div className="saving-throw-grid" aria-label="Saving throws">
                          {savingThrows.map((save) => (
                            <div key={save.label} className="saving-throw-cell">
                              <span className="saving-throw-label">{save.label}</span>
                              <span className="saving-throw-value">{formatSignedNumber(save.value)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {showPlayerInfoStats ? (
                        <dl className="stats-grid">
                          {showPosition ? <Stat label="Position" value={mudState.position} /> : null}
                          {showAttack ? <Stat label="Attack" value={formatNumber(mudState.attackBonus)} /> : null}
                          {showArmorClass ? <Stat label="Armor Class" value={formatNumber(mudState.armorClass)} /> : null}
                          {showAlignment ? <Stat label="Alignment" value={mudState.alignment} /> : null}
                          {showMoney ? <Stat label="Money" value={formatNumber(mudState.money)} /> : null}
                          {showMoney ? <Stat label="Bank" value={formatNumber(mudState.bank)} /> : null}
                        </dl>
                      ) : null}
                    </>
                  ) : null}

                  {resolvedActiveSidebarTab === 'quests' ? (
                    mudState.questInfo ? (
                      <QuestInfoPanel value={mudState.questInfo} />
                    ) : (
                      <EmptyTabMessage message="No quest data reported yet." />
                    )
                  ) : null}

                  {resolvedActiveSidebarTab === 'group' ? (
                    mudState.group ? (
                      <GroupPanel value={mudState.group} />
                    ) : (
                      <EmptyTabMessage message="No group data reported yet." />
                    )
                  ) : null}

                  {resolvedActiveSidebarTab === 'affects' ? (
                    <AffectsPanel
                      value={mudState.affects}
                      cooldowns={mudState.cooldowns}
                      starWarsMode={isStarWarsConnection}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}
          </aside>
        )}
      </main>
    </div>
  )
}

function createEmptyAlias(): AliasDefinition {
  return {
    id: createAutomationId('alias'),
    pattern: '',
    expansion: '',
    enabled: true,
  }
}

function createEmptyTrigger(): TriggerDefinition {
  return {
    id: createAutomationId('trigger'),
    pattern: '',
    action: '',
    enabled: true,
  }
}

function createEmptyKeyBinding(): KeyBindingDefinition {
  return {
    id: createAutomationId('keybind'),
    code: '',
    key: '',
    command: '',
    enabled: true,
  }
}

function getDefaultKeyBindings(): KeyBindingDefinition[] {
  return DEFAULT_KEY_BINDINGS.map((binding) => ({ ...binding }))
}

function formatKeyBindingLabel(binding: KeyBindingDefinition) {
  if (!binding.code) {
    return 'Press a key'
  }

  return KEY_CODE_LABELS[binding.code] ?? formatKeyboardCode(binding.code)
}

function formatKeyboardCode(code: string) {
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3)
  }

  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5)
  }

  if (code === 'Space') {
    return 'Space'
  }

  if (code.startsWith('Arrow')) {
    return code.replace('Arrow', 'Arrow ')
  }

  return code.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function createAutomationId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function expandAliasCommands(text: string, aliases: AliasDefinition[], depth = 0): string[] {
  const trimmedText = text.trim()
  if (!trimmedText) {
    return []
  }

  if (depth >= AUTOMATION_RECURSION_LIMIT) {
    return [trimmedText]
  }

  for (const alias of aliases) {
    if (!alias.enabled) {
      continue
    }

    const match = matchAliasPattern(trimmedText, alias.pattern)
    if (!match) {
      continue
    }

    const expandedText = substituteCaptures(alias.expansion, trimmedText, match.captures)
    const splitCommands = splitCommandSequence(expandedText)
    if (splitCommands.length === 0) {
      return []
    }

    return splitCommands.flatMap((command) => expandAliasCommands(command, aliases, depth + 1))
  }

  return [trimmedText]
}

function consumeTriggerText(text: string, buffer: string, triggers: TriggerDefinition[]) {
  const normalizedText = stripMudFormatting(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const combined = `${buffer}${normalizedText}`
  const segments = combined.split('\n')
  const nextBuffer = segments.pop() ?? ''
  const commands: string[] = []

  for (const segment of segments) {
    const line = segment.trim()
    if (!line) {
      continue
    }

    for (const trigger of triggers) {
      if (!trigger.enabled) {
        continue
      }

      const match = matchTriggerPattern(line, trigger.pattern)
      if (!match) {
        continue
      }

      const actionText = substituteCaptures(trigger.action, line, match.captures)
      commands.push(...splitCommandSequence(actionText))
    }
  }

  return { buffer: nextBuffer, commands }
}

function matchAliasPattern(text: string, pattern: string) {
  const trimmedPattern = pattern.trim()
  if (!trimmedPattern) {
    return null
  }

  if (trimmedPattern.includes('*')) {
    return matchWildcardPattern(text, trimmedPattern)
  }

  const normalizedText = text.toLowerCase()
  const normalizedPattern = trimmedPattern.toLowerCase()
  if (normalizedText === normalizedPattern) {
    return { captures: [''] }
  }

  if (normalizedText.startsWith(`${normalizedPattern} `)) {
    return { captures: [text.slice(trimmedPattern.length).trimStart()] }
  }

  return null
}

function matchTriggerPattern(text: string, pattern: string) {
  const trimmedPattern = pattern.trim()
  if (!trimmedPattern) {
    return null
  }

  if (trimmedPattern.includes('*')) {
    return matchWildcardPattern(text, trimmedPattern)
  }

  return text.toLowerCase().includes(trimmedPattern.toLowerCase()) ? { captures: [] } : null
}

function matchWildcardPattern(text: string, pattern: string) {
  const escapedSegments = pattern.trim().split('*').map(escapeRegExp)
  const matcher = new RegExp(`^${escapedSegments.join('(.*?)')}$`, 'i')
  const match = matcher.exec(text)
  if (!match) {
    return null
  }

  return { captures: match.slice(1).map((capture) => capture.trim()) }
}

function substituteCaptures(template: string, source: string, captures: string[]) {
  return template.replace(/%(\d)/g, (_match, indexText: string) => {
    const index = Number(indexText)
    if (index === 0) {
      return source
    }

    return captures[index - 1] ?? ''
  })
}

function splitCommandSequence(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripMudFormatting(value: string) {
  return convertLuminariColorCodes(value).replace(ANSI_ESCAPE_PATTERN, '')
}

function loadAliasesFromCookies() {
  return parsePersistedAliases(readChunkedCookie(ALIASES_COOKIE_NAME))
}

function loadTriggersFromCookies() {
  return parsePersistedTriggers(readChunkedCookie(TRIGGERS_COOKIE_NAME))
}

function loadClientSettingsFromCookies() {
  return parsePersistedClientSettings(readChunkedCookie(CLIENT_SETTINGS_COOKIE_NAME))
}

function saveAliasesToCookies(aliases: AliasDefinition[]) {
  writeChunkedCookie(ALIASES_COOKIE_NAME, JSON.stringify(aliases))
}

function saveTriggersToCookies(triggers: TriggerDefinition[]) {
  writeChunkedCookie(TRIGGERS_COOKIE_NAME, JSON.stringify(triggers))
}

function saveClientSettingsToCookies(settings: ClientSettings) {
  writeChunkedCookie(CLIENT_SETTINGS_COOKIE_NAME, JSON.stringify(settings))
}

function parsePersistedAliases(value: string | null) {
  if (!value) {
    return []
  }

  try {
    return normalizeAliases(JSON.parse(value))
  } catch {
    return []
  }
}

function parsePersistedTriggers(value: string | null) {
  if (!value) {
    return []
  }

  try {
    return normalizeTriggers(JSON.parse(value))
  } catch {
    return []
  }
}

function parsePersistedClientSettings(value: string | null) {
  if (!value) {
    return DEFAULT_CLIENT_SETTINGS
  }

  try {
    return normalizeClientSettings(JSON.parse(value))
  } catch {
    return DEFAULT_CLIENT_SETTINGS
  }
}

function parseAliasImport(content: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Alias file is not valid JSON.')
  }

  return normalizeAliases(extractImportedEntries(parsed, 'aliases'), 'Alias file must contain an aliases array.')
}

function parseTriggerImport(content: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Trigger file is not valid JSON.')
  }

  return normalizeTriggers(extractImportedEntries(parsed, 'triggers'), 'Trigger file must contain a triggers array.')
}

function parseClientConfigImport(
  content: string,
  currentSettings: ClientSettings,
  currentAliases: AliasDefinition[],
  currentTriggers: TriggerDefinition[],
) {
  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Configuration file is not valid JSON.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Configuration file must be a JSON object.')
  }

  const record = parsed as Record<string, unknown>
  const type = record.type

  if ('settings' in record) {
    return {
      settings: normalizeClientSettings(record.settings, 'Configuration file must contain a settings object.'),
      aliases: normalizeAliases(extractImportedEntries(record, 'aliases'), 'Configuration file must contain an aliases array.'),
      triggers: normalizeTriggers(
        extractImportedEntries(record, 'triggers'),
        'Configuration file must contain a triggers array.',
      ),
    }
  }

  if (type === 'luminari-web-client-aliases' || ('aliases' in record && !('triggers' in record))) {
    return {
      settings: currentSettings,
      aliases: parseAliasImport(content),
      triggers: currentTriggers,
    }
  }

  if (type === 'luminari-web-client-triggers' || ('triggers' in record && !('aliases' in record))) {
    return {
      settings: currentSettings,
      aliases: currentAliases,
      triggers: parseTriggerImport(content),
    }
  }

  throw new Error('Configuration file must include settings, aliases, and triggers.')
}

function extractImportedEntries(parsed: unknown, key: 'aliases' | 'triggers') {
  if (Array.isArray(parsed)) {
    return parsed
  }

  if (parsed && typeof parsed === 'object' && key in parsed) {
    const nestedEntries = (parsed as Record<string, unknown>)[key]
    if (Array.isArray(nestedEntries)) {
      return nestedEntries
    }
  }

  throw new Error(key === 'aliases' ? 'Alias file must contain an aliases array.' : 'Trigger file must contain a triggers array.')
}

function normalizeClientSettings(value: unknown, emptyStateMessage?: string): ClientSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (emptyStateMessage) {
      throw new Error(emptyStateMessage)
    }

    return DEFAULT_CLIENT_SETTINGS
  }

  const record = value as Record<string, unknown>
  const connectionRecord = isObjectRecord(record.connection) ? record.connection : null
  const terminalValue = record.terminal
  if (!terminalValue || typeof terminalValue !== 'object' || Array.isArray(terminalValue)) {
    if (emptyStateMessage) {
      throw new Error('Configuration settings must include a terminal object.')
    }

    return DEFAULT_CLIENT_SETTINGS
  }

  const terminalRecord = terminalValue as Record<string, unknown>
  const layoutRecord = isObjectRecord(record.layout) ? record.layout : null
  const layoutGaugesRecord = isObjectRecord(layoutRecord?.gauges) ? layoutRecord.gauges : null
  const layoutMapPanelsRecord = isObjectRecord(layoutRecord?.mapPanels) ? layoutRecord.mapPanels : null
  const layoutSidebarTabsRecord = isObjectRecord(layoutRecord?.sidebarTabs) ? layoutRecord.sidebarTabs : null
  const layoutPlayerInfoSectionsRecord = isObjectRecord(layoutRecord?.playerInfoSections) ? layoutRecord.playerInfoSections : null
  const minimapRecord = isObjectRecord(record.minimap) ? record.minimap : null
  const sidebarRecord = isObjectRecord(record.sidebar) ? record.sidebar : null

  return {
    connection: {
      defaultMudId: normalizeDefaultMudId(readOptionalString(connectionRecord ?? {}, ['defaultMudId'])),
      customMudName: readOptionalString(connectionRecord ?? {}, ['customMudName'])?.trim() ?? '',
      customHost: normalizeMudHost(readOptionalString(connectionRecord ?? {}, ['customHost'])),
      customPort: normalizeMudPort(readNumericSetting(connectionRecord?.customPort)),
    },
    layout: {
      minimalistMode:
        typeof layoutRecord?.minimalistMode === 'boolean'
          ? layoutRecord.minimalistMode
          : DEFAULT_CLIENT_SETTINGS.layout.minimalistMode,
      sidebarWidthUnit: isSidebarWidthUnit(layoutRecord?.sidebarWidthUnit)
        ? layoutRecord.sidebarWidthUnit
        : DEFAULT_CLIENT_SETTINGS.layout.sidebarWidthUnit,
      sidebarWidthPercent: clampSidebarWidthPercent(
        readNumericSetting(layoutRecord?.sidebarWidthPercent),
        DEFAULT_CLIENT_SETTINGS.layout.sidebarWidthPercent,
      ),
      sidebarWidthPixels: clampSidebarWidthPixels(
        readNumericSetting(layoutRecord?.sidebarWidthPixels),
        DEFAULT_CLIENT_SETTINGS.layout.sidebarWidthPixels,
      ),
      gauges: {
        health: normalizeStandardGaugeSettings(layoutGaugesRecord?.health, DEFAULT_CLIENT_SETTINGS.layout.gauges.health),
        psp: normalizeStandardGaugeSettings(layoutGaugesRecord?.psp, DEFAULT_CLIENT_SETTINGS.layout.gauges.psp),
        movement: normalizeStandardGaugeSettings(layoutGaugesRecord?.movement, DEFAULT_CLIENT_SETTINGS.layout.gauges.movement),
        experience: normalizeStandardGaugeSettings(layoutGaugesRecord?.experience, DEFAULT_CLIENT_SETTINGS.layout.gauges.experience),
        opponent: normalizeCombatGaugeSettings(layoutGaugesRecord?.opponent, DEFAULT_CLIENT_SETTINGS.layout.gauges.opponent),
        tank: normalizeCombatGaugeSettings(layoutGaugesRecord?.tank, DEFAULT_CLIENT_SETTINGS.layout.gauges.tank),
      },
      mapPanels: {
        graphic:
          typeof layoutMapPanelsRecord?.graphic === 'boolean'
            ? layoutMapPanelsRecord.graphic
            : DEFAULT_CLIENT_SETTINGS.layout.mapPanels.graphic,
        graphicLegend:
          typeof layoutMapPanelsRecord?.graphicLegend === 'boolean'
            ? layoutMapPanelsRecord.graphicLegend
            : DEFAULT_CLIENT_SETTINGS.layout.mapPanels.graphicLegend,
        ascii:
          typeof layoutMapPanelsRecord?.ascii === 'boolean'
            ? layoutMapPanelsRecord.ascii
            : DEFAULT_CLIENT_SETTINGS.layout.mapPanels.ascii,
        asciiLegend:
          typeof layoutMapPanelsRecord?.asciiLegend === 'boolean'
            ? layoutMapPanelsRecord.asciiLegend
            : DEFAULT_CLIENT_SETTINGS.layout.mapPanels.asciiLegend,
      },
      sidebarTabs: {
        character:
          typeof layoutSidebarTabsRecord?.character === 'boolean'
            ? layoutSidebarTabsRecord.character
            : DEFAULT_CLIENT_SETTINGS.layout.sidebarTabs.character,
        quests:
          typeof layoutSidebarTabsRecord?.quests === 'boolean'
            ? layoutSidebarTabsRecord.quests
            : DEFAULT_CLIENT_SETTINGS.layout.sidebarTabs.quests,
        group:
          typeof layoutSidebarTabsRecord?.group === 'boolean'
            ? layoutSidebarTabsRecord.group
            : DEFAULT_CLIENT_SETTINGS.layout.sidebarTabs.group,
        affects:
          typeof layoutSidebarTabsRecord?.affects === 'boolean'
            ? layoutSidebarTabsRecord.affects
            : DEFAULT_CLIENT_SETTINGS.layout.sidebarTabs.affects,
      },
      playerInfoSections: {
        characterName:
          typeof layoutPlayerInfoSectionsRecord?.characterName === 'boolean'
            ? layoutPlayerInfoSectionsRecord.characterName
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.characterName,
        race:
          typeof layoutPlayerInfoSectionsRecord?.race === 'boolean'
            ? layoutPlayerInfoSectionsRecord.race
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.race,
        className:
          typeof layoutPlayerInfoSectionsRecord?.className === 'boolean'
            ? layoutPlayerInfoSectionsRecord.className
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.className,
        abilityScores:
          typeof layoutPlayerInfoSectionsRecord?.abilityScores === 'boolean'
            ? layoutPlayerInfoSectionsRecord.abilityScores
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.abilityScores,
        savingThrows:
          typeof layoutPlayerInfoSectionsRecord?.savingThrows === 'boolean'
            ? layoutPlayerInfoSectionsRecord.savingThrows
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.savingThrows,
        position:
          typeof layoutPlayerInfoSectionsRecord?.position === 'boolean'
            ? layoutPlayerInfoSectionsRecord.position
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.position,
        attack:
          typeof layoutPlayerInfoSectionsRecord?.attack === 'boolean'
            ? layoutPlayerInfoSectionsRecord.attack
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.attack,
        armorClass:
          typeof layoutPlayerInfoSectionsRecord?.armorClass === 'boolean'
            ? layoutPlayerInfoSectionsRecord.armorClass
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.armorClass,
        alignment:
          typeof layoutPlayerInfoSectionsRecord?.alignment === 'boolean'
            ? layoutPlayerInfoSectionsRecord.alignment
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.alignment,
        money:
          typeof layoutPlayerInfoSectionsRecord?.money === 'boolean'
            ? layoutPlayerInfoSectionsRecord.money
            : DEFAULT_CLIENT_SETTINGS.layout.playerInfoSections.money,
      },
    },
    terminal: {
      fontSize: clampNumber(readNumericSetting(terminalRecord.fontSize), 8, 32, DEFAULT_CLIENT_SETTINGS.terminal.fontSize),
      lineHeight: clampNumber(
        readNumericSetting(terminalRecord.lineHeight),
        1.2,
        2.2,
        DEFAULT_CLIENT_SETTINGS.terminal.lineHeight,
      ),
      maxHistoryLines: clampTerminalHistoryLines(
        readNumericSetting(terminalRecord.maxHistoryLines),
        DEFAULT_CLIENT_SETTINGS.terminal.maxHistoryLines,
      ),
      autoScroll:
        typeof terminalRecord.autoScroll === 'boolean'
          ? terminalRecord.autoScroll
          : DEFAULT_CLIENT_SETTINGS.terminal.autoScroll,
      wrapLines:
        typeof terminalRecord.wrapLines === 'boolean'
          ? terminalRecord.wrapLines
          : DEFAULT_CLIENT_SETTINGS.terminal.wrapLines,
    },
    minimap: {
      defaultMapType: isDefaultMapType(minimapRecord?.defaultMapType)
        ? minimapRecord.defaultMapType
        : DEFAULT_CLIENT_SETTINGS.minimap.defaultMapType,
      fontSize: clampNumber(
        readNumericSetting(minimapRecord?.fontSize),
        10,
        32,
        DEFAULT_CLIENT_SETTINGS.minimap.fontSize,
      ),
      paneHeight: clampNumber(
        readNumericSetting(minimapRecord?.paneHeight),
        10,
        32,
        DEFAULT_CLIENT_SETTINGS.minimap.paneHeight,
      ),
    },
    sidebar: {
      fontFamily: isSidebarFontFamily(sidebarRecord?.fontFamily)
        ? sidebarRecord.fontFamily
        : DEFAULT_CLIENT_SETTINGS.sidebar.fontFamily,
      fontSize: clampNumber(readNumericSetting(sidebarRecord?.fontSize), 8, 32, DEFAULT_CLIENT_SETTINGS.sidebar.fontSize),
    },
    keyBindings: normalizeKeyBindings(record.keyBindings),
    msdp: normalizeMsdpVariableMap(record.msdp),
  }
}

function normalizeAliases(value: unknown, emptyStateMessage?: string): AliasDefinition[] {
  if (!Array.isArray(value)) {
    if (emptyStateMessage) {
      throw new Error(emptyStateMessage)
    }

    return []
  }

  return value.map((entry, index) => normalizeAliasEntry(entry, index))
}

function normalizeTriggers(value: unknown, emptyStateMessage?: string): TriggerDefinition[] {
  if (!Array.isArray(value)) {
    if (emptyStateMessage) {
      throw new Error(emptyStateMessage)
    }

    return []
  }

  return value.map((entry, index) => normalizeTriggerEntry(entry, index))
}

function normalizeKeyBindings(value: unknown): KeyBindingDefinition[] {
  if (value === undefined) {
    return getDefaultKeyBindings()
  }

  if (!Array.isArray(value)) {
    return getDefaultKeyBindings()
  }

  return value.map((entry, index) => normalizeKeyBindingEntry(entry, index)).filter((entry) => entry !== null)
}

function normalizeAliasEntry(value: unknown, index: number): AliasDefinition {
  if (!value || typeof value !== 'object') {
    throw new Error(`Alias ${index + 1} is invalid.`)
  }

  const record = value as Record<string, unknown>
  const pattern = readOptionalString(record, ['pattern', 'name'])
  const expansion = readOptionalString(record, ['expansion', 'value', 'command'])

  if (!pattern?.trim() || !expansion?.trim()) {
    throw new Error(`Alias ${index + 1} must include both pattern and expansion.`)
  }

  return {
    id: readOptionalString(record, ['id'])?.trim() || createAutomationId('alias'),
    pattern,
    expansion,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
  }
}

function normalizeTriggerEntry(value: unknown, index: number): TriggerDefinition {
  if (!value || typeof value !== 'object') {
    throw new Error(`Trigger ${index + 1} is invalid.`)
  }

  const record = value as Record<string, unknown>
  const pattern = readOptionalString(record, ['pattern', 'match'])
  const action = readOptionalString(record, ['action', 'command', 'expansion'])

  if (!pattern?.trim() || !action?.trim()) {
    throw new Error(`Trigger ${index + 1} must include both pattern and action.`)
  }

  return {
    id: readOptionalString(record, ['id'])?.trim() || createAutomationId('trigger'),
    pattern,
    action,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
  }
}

function normalizeKeyBindingEntry(value: unknown, index: number): KeyBindingDefinition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const code = readOptionalString(record, ['code'])?.trim() ?? ''
  const command = readOptionalString(record, ['command', 'action', 'input'])?.trim() ?? ''

  return {
    id: readOptionalString(record, ['id'])?.trim() || `keybind-imported-${index + 1}`,
    code,
    key: readOptionalString(record, ['key']) ?? '',
    command,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
  }
}

function readOptionalString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function readNumericSetting(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return undefined
}

function clampNumber(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  if (value === undefined) {
    return fallback
  }

  return Math.min(Math.max(value, minimum), maximum)
}

function clampTerminalHistoryLines(value: number | undefined, fallback = DEFAULT_TERMINAL_HISTORY_LINES) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(MAX_TERMINAL_HISTORY_LINES, Math.trunc(value)))
}

function clampSidebarWidthPercent(value: number | undefined, fallback = DEFAULT_CLIENT_SETTINGS.layout.sidebarWidthPercent) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(15, Math.min(50, Math.trunc(value)))
}

function clampSidebarWidthPixels(value: number | undefined, fallback = DEFAULT_CLIENT_SETTINGS.layout.sidebarWidthPixels) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(240, Math.min(960, Math.trunc(value)))
}

function clampGaugeWidthPercent(value: number | undefined, fallback = DEFAULT_LAYOUT_GAUGES.health.widthPercent) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(15, Math.min(100, Math.trunc(value)))
}

function clampGaugeWidthPixels(value: number | undefined, fallback = DEFAULT_LAYOUT_GAUGES.health.widthPixels) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(120, Math.min(960, Math.trunc(value)))
}

function normalizeTerminalText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function isTerminalScrolledToBottom(terminal: HTMLElement | null) {
  if (!terminal) {
    return true
  }

  return terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight <= TERMINAL_BOTTOM_SCROLL_TOLERANCE
}

function scrollTerminalElementToBottom(terminal: HTMLElement | null) {
  if (!terminal) {
    return
  }

  terminal.scrollTop = terminal.scrollHeight
}

function trimTerminalOutputLines(value: string, maxHistoryLines: number) {
  const normalizedValue = normalizeTerminalText(value)
  const lineLimit = clampTerminalHistoryLines(maxHistoryLines)
  const lines = normalizedValue.split('\n')

  if (lines.length <= lineLimit) {
    return normalizedValue
  }

  return lines.slice(-lineLimit).join('\n')
}

function parsePositiveIntegerInput(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isSidebarFontFamily(value: unknown): value is SidebarFontFamily {
  return value === 'sans' || value === 'mono' || value === 'serif'
}

function isDefaultMapType(value: unknown): value is DefaultMapType {
  return value === 'graphic' || value === 'ascii'
}

function isSidebarWidthUnit(value: unknown): value is SidebarWidthUnit {
  return value === 'percent' || value === 'pixels'
}

function isGaugeVisibilityMode(value: unknown): value is GaugeVisibilityMode {
  return value === 'never' || value === 'combat' || value === 'always'
}

function normalizeStandardGaugeSettings(value: unknown, fallback: StandardGaugeSettings): StandardGaugeSettings {
  const record = isObjectRecord(value) ? value : null

  return {
    visible: typeof record?.visible === 'boolean' ? record.visible : fallback.visible,
    widthUnit: isSidebarWidthUnit(record?.widthUnit) ? record.widthUnit : fallback.widthUnit,
    widthPercent: clampGaugeWidthPercent(readNumericSetting(record?.widthPercent), fallback.widthPercent),
    widthPixels: clampGaugeWidthPixels(readNumericSetting(record?.widthPixels), fallback.widthPixels),
  }
}

function normalizeCombatGaugeSettings(value: unknown, fallback: CombatGaugeSettings): CombatGaugeSettings {
  const record = isObjectRecord(value) ? value : null

  return {
    visibilityMode: isGaugeVisibilityMode(record?.visibilityMode) ? record.visibilityMode : fallback.visibilityMode,
    widthUnit: isSidebarWidthUnit(record?.widthUnit) ? record.widthUnit : fallback.widthUnit,
    widthPercent: clampGaugeWidthPercent(readNumericSetting(record?.widthPercent), fallback.widthPercent),
    widthPixels: clampGaugeWidthPixels(readNumericSetting(record?.widthPixels), fallback.widthPixels),
  }
}

function normalizeDefaultMudId(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : DEFAULT_CLIENT_SETTINGS.connection.defaultMudId
}

function normalizeMudHost(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : DEFAULT_CLIENT_SETTINGS.connection.customHost
}

function normalizeMudPort(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_CLIENT_SETTINGS.connection.customPort
  }

  return Math.max(1, Math.min(65535, Math.trunc(value)))
}

function resolveConnectionDefaults(settings: AppSettings, clientSettings: ClientSettings) {
  if (clientSettings.connection.defaultMudId === CUSTOM_MUD_VALUE) {
    return {
      selectedMudId: CUSTOM_MUD_VALUE,
      host: normalizeMudHost(clientSettings.connection.customHost),
      port: normalizeMudPort(clientSettings.connection.customPort),
    }
  }

  const preset = settings.connection.muds.find((mud) => mud.id === clientSettings.connection.defaultMudId)
  if (preset) {
    return {
      selectedMudId: preset.id,
      host: preset.host,
      port: preset.port,
    }
  }

  const matchingPresetId = findMatchingMudPresetId(
    settings.connection.muds,
    settings.connection.defaultHost,
    settings.connection.defaultPort,
  )

  return {
    selectedMudId: matchingPresetId ?? CUSTOM_MUD_VALUE,
    host: settings.connection.defaultHost,
    port: settings.connection.defaultPort,
  }
}

function getCustomMudOptionLabel(settings: ClientSettings) {
  const name = settings.connection.customMudName.trim()
  return name.length > 0 ? name : 'Custom'
}

function getVisibleSidebarTabs(layoutSettings: ClientSettings['layout']) {
  return SIDEBAR_TABS.filter((tab) => layoutSettings.sidebarTabs[tab.id])
}

function getDefaultSidebarTab(settings: ClientSettings): SidebarTabId {
  return getVisibleSidebarTabs(settings.layout)[0]?.id ?? 'character'
}

function getVisibleMapPanelTabs(layoutSettings: ClientSettings['layout']) {
  return MAP_PANEL_TABS.filter((tab) => layoutSettings.mapPanels[tab.id])
}

function getDefaultMapPanelTab(settings: ClientSettings): MapPanelTabId {
  const preferredTab = settings.minimap.defaultMapType === 'ascii' ? 'ascii' : 'graphic'

  if (settings.layout.mapPanels[preferredTab]) {
    return preferredTab
  }

  return getVisibleMapPanelTabs(settings.layout)[0]?.id ?? preferredTab
}

function getGaugeWidthValue(settings: GaugeSizeSettings) {
  return settings.widthUnit === 'percent' ? `${settings.widthPercent}%` : `${settings.widthPixels}px`
}

function shouldRenderCombatGauge(mode: GaugeVisibilityMode, combatGaugeDataAvailable: boolean) {
  if (mode === 'never') {
    return false
  }

  if (mode === 'always') {
    return true
  }

  return combatGaugeDataAvailable
}

function readChunkedCookie(name: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const cookies = parseCookieMap(document.cookie)
  const singleValue = cookies.get(name)
  if (singleValue !== undefined) {
    return decodeURIComponent(singleValue)
  }

  const countText = cookies.get(`${name}.count`)
  if (!countText) {
    return null
  }

  const count = Number(countText)
  if (!Number.isInteger(count) || count < 1) {
    return null
  }

  let combined = ''
  for (let index = 0; index < count; index += 1) {
    const chunk = cookies.get(`${name}.${index}`)
    if (chunk === undefined) {
      return null
    }

    combined += chunk
  }

  return decodeURIComponent(combined)
}

function writeChunkedCookie(name: string, rawValue: string) {
  if (typeof document === 'undefined') {
    return
  }

  clearCookieGroup(name)

  const encodedValue = encodeURIComponent(rawValue)
  const chunks = []
  for (let index = 0; index < encodedValue.length; index += AUTOMATION_COOKIE_CHUNK_SIZE) {
    chunks.push(encodedValue.slice(index, index + AUTOMATION_COOKIE_CHUNK_SIZE))
  }

  if (chunks.length <= 1) {
    setCookieValue(name, encodedValue)
    return
  }

  setCookieValue(`${name}.count`, String(chunks.length))
  chunks.forEach((chunk, index) => {
    setCookieValue(`${name}.${index}`, chunk)
  })
}

function clearCookieGroup(name: string) {
  if (typeof document === 'undefined') {
    return
  }

  const cookies = parseCookieMap(document.cookie)
  for (const cookieName of cookies.keys()) {
    if (cookieName === name || cookieName === `${name}.count` || cookieName.startsWith(`${name}.`)) {
      expireCookie(cookieName)
    }
  }
}

function setCookieValue(name: string, value: string) {
  document.cookie = `${name}=${value}; max-age=${AUTOMATION_COOKIE_MAX_AGE}; path=/; SameSite=Lax`
}

function expireCookie(name: string) {
  document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`
}

function parseCookieMap(cookieHeader: string) {
  const cookies = new Map<string, string>()
  if (!cookieHeader.trim()) {
    return cookies
  }

  for (const entry of cookieHeader.split(/;\s*/)) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = entry.slice(0, separatorIndex)
    const value = entry.slice(separatorIndex + 1)
    cookies.set(key, value)
  }

  return cookies
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function pluralize(count: number) {
  return count === 1 ? '' : 's'
}

function formatCharacterHeading(characterName?: string, title?: string) {
  const trimmedName = characterName?.trim()
  const trimmedTitle = title?.trim()

  if (!trimmedTitle) {
    return trimmedName || 'Unknown adventurer'
  }

  if (!trimmedName) {
    return trimmedTitle
  }

  const normalizedName = trimmedName.toLowerCase()
  const normalizedTitle = trimmedTitle.toLowerCase()

  if (normalizedTitle.includes(normalizedName)) {
    return trimmedTitle
  }

  return `${trimmedName} ${trimmedTitle}`
}

type StatusBarProps = {
  bar: BarConfig
}

function StatusBar({ bar }: StatusBarProps) {
  return (
    <div
      className="status-bar"
      style={
        {
          '--status-bar-width': bar.widthValue,
        } as CSSProperties
      }
    >
      <div
        className={`bar-track bar-state-${bar.availabilityKind}`}
        role="meter"
        aria-label={bar.ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bar.percentage)}
        title={bar.ariaLabel}
      >
        <div className={`bar-fill ${bar.accentClass}`} style={{ width: `${bar.percentage}%` }} />
        <div className="bar-overlay">
          <span className="bar-label">{bar.label}</span>
          <span className="bar-counter">{bar.valueText}</span>
        </div>
      </div>
    </div>
  )
}

function StarWarsResourceInfo({ mudState }: { mudState: MudState }) {
  const resources = [
    { label: 'Bacta', value: formatInfoNumber(mudState.bacta) },
    { label: 'Power cells', value: formatInfoNumber(mudState.powerCells) },
    {
      label: 'Main ammo',
      value: formatWeaponAmmo(mudState.ammoMainType, mudState.ammoMain, mudState.ammoMainMax),
    },
    {
      label: 'Offhand ammo',
      value: formatWeaponAmmo(mudState.ammoOffhandType, mudState.ammoOffhand, mudState.ammoOffhandMax),
    },
    {
      label: 'Actions',
      value: formatActionEconomy(mudState.actionStandard, mudState.actionMove, mudState.actionQuick),
    },
  ]

  return (
    <div className="star-wars-resource-info" aria-label="Star Wars resources">
      {resources.map((resource) => (
        <div className="star-wars-resource-info-item" key={resource.label}>
          <span className="star-wars-resource-info-label">{resource.label}</span>
          <strong className="star-wars-resource-info-value">{resource.value}</strong>
        </div>
      ))}
    </div>
  )
}

type StatProps = {
  label: string
  value?: string | number
}

type MudValuePanelProps = {
  value?: MudValue
  emptyMessage: string
}

function Stat({ label, value }: StatProps) {
  if (typeof value === 'string') {
    return (
      <>
        <dt>{label}</dt>
        <dd dangerouslySetInnerHTML={{ __html: renderMudHtml(value || '—') }} />
      </>
    )
  }

  return (
    <>
      <dt>{label}</dt>
      <dd>{value !== undefined ? value : '—'}</dd>
    </>
  )
}

function EmptyTabMessage({ message }: { message: string }) {
  return <p className="tab-empty-message">{message}</p>
}

type AffectsPanelProps = {
  value?: MudValue
  cooldowns?: MudValue
  starWarsMode: boolean
}

type AffectEntry = {
  nameText: string
  isNameMissing: boolean
  durationText?: string
  detailLines: string[]
  supplementaryLines: string[]
}

function AffectsPanel({ value, cooldowns, starWarsMode }: AffectsPanelProps) {
  if (value === undefined || value === null) {
    if (starWarsMode && cooldowns !== undefined && cooldowns !== null) {
      return <StarWarsAffectsPanel affects={[]} cooldowns={parseStarWarsCooldownEntries(cooldowns)} />
    }
    return <EmptyTabMessage message="No affects reported yet." />
  }

  const affects = mergeAffectEntries(parseAffectEntries(value))

  if (starWarsMode) {
    return <StarWarsAffectsPanel affects={affects} cooldowns={parseStarWarsCooldownEntries(cooldowns)} />
  }

  if (affects.length === 0) {
    return <MudValuePanel value={value} emptyMessage="No affects reported yet." />
  }

  return (
    <div className="affects-panel" role="list" aria-label="Active affects">
      {affects.map((affect, index) => (
        <AffectRow key={`${affect.nameText || 'affect'}-${index}`} affect={affect} />
      ))}
    </div>
  )
}

function StarWarsAffectsPanel({ affects, cooldowns }: { affects: AffectEntry[]; cooldowns: AffectEntry[] }) {
  return (
    <div className="affects-panel affects-panel-starwars">
      <AffectSection title="Affects" entries={affects} emptyMessage="No active affects." />
      <AffectSection title="Cooldowns" entries={cooldowns} emptyMessage="No active cooldowns." />
    </div>
  )
}

function AffectSection({ title, entries, emptyMessage }: { title: string; entries: AffectEntry[]; emptyMessage: string }) {
  return (
    <section className="affect-section" aria-label={title}>
      <h3>{title}</h3>
      {entries.length > 0 ? (
        <div className="affect-section-list" role="list">
          {entries.map((affect, index) => (
            <AffectRow key={`${title}-${affect.nameText || 'entry'}-${index}`} affect={affect} />
          ))}
        </div>
      ) : (
        <p className="affect-section-empty">{emptyMessage}</p>
      )}
    </section>
  )
}

function parseStarWarsCooldownEntries(value?: MudValue): AffectEntry[] {
  if (typeof value !== 'string') {
    return value === undefined || value === null ? [] : mergeAffectEntries(parseAffectEntries(value))
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/)
      return {
        nameText: match?.[2] ?? line,
        isNameMissing: false,
        durationText: match?.[1],
        detailLines: [],
        supplementaryLines: [],
      }
    })
}

function AffectRow({ affect }: { affect: AffectEntry }) {
  const className = [
    'affect-card',
    affect.isNameMissing ? 'affect-card-missing-name' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={className} role="listitem">
      <div className="affect-card-header">
        <span className="affect-card-name">{affect.nameText}</span>
        {affect.durationText ? <span className="affect-duration-badge">{affect.durationText}</span> : null}
      </div>

      {affect.detailLines.length > 0 ? (
        <div className="affect-detail-list">
          {affect.detailLines.map((line, index) => (
            <p key={`${line}-${index}`} className="affect-detail-line">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {affect.supplementaryLines.length > 0 ? (
        <div className="affect-note-list">
          {affect.supplementaryLines.map((line, index) => (
            <p key={`${line}-${index}`} className={line.startsWith('Other: ') ? 'affect-unknown-fields' : 'affect-raw-text'}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  )
}

type GroupPanelProps = {
  value: MudValue
}

type GroupMember = {
  nameText: string
  isNameMissing: boolean
  isLeader: boolean
  leaderText?: string
  statusText?: string
  resources: GroupResource[]
  rawText?: string
  unknownFieldsText?: string
}

type GroupResource = {
  id: 'health' | 'movement'
  label: string
  valueText: string
  percentage: number
  availabilityKind: 'present' | 'empty'
}

function GroupPanel({ value }: GroupPanelProps) {
  const members = parseGroupMembers(value)

  if (members.length === 0) {
    return <MudValuePanel value={value} emptyMessage="No group data reported yet." />
  }

  return (
    <div className="group-panel" role="list" aria-label="Group members">
      {members.map((member, index) => (
        <GroupMemberRow key={`${member.nameText || 'member'}-${index}`} member={member} />
      ))}
    </div>
  )
}

function GroupMemberRow({ member }: { member: GroupMember }) {
  const className = [
    'group-member',
    member.isNameMissing ? 'group-member-missing-name' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={className} role="listitem">
      <div className="group-member-header">
        <span className="group-member-name">{member.nameText}</span>
        {member.leaderText ? <span className="group-leader-badge">{member.leaderText}</span> : null}
      </div>

      {member.statusText ? (
        <div className="group-status-line">
          <span>Status</span>
          <strong>{member.statusText}</strong>
        </div>
      ) : null}

      {member.rawText ? <p className="group-raw-text">{member.rawText}</p> : null}

      {member.resources.length > 0 ? (
        <div className="group-resources">
          {member.resources.map((resource) => (
            <GroupResourceView key={resource.id} resource={resource} />
          ))}
        </div>
      ) : null}

      {member.unknownFieldsText ? <p className="group-unknown-fields">Other: {member.unknownFieldsText}</p> : null}
    </article>
  )
}

function GroupResourceView({ resource }: { resource: GroupResource }) {
  return (
    <div
      className={`group-resource group-resource-${resource.id} group-resource-${resource.availabilityKind}`}
      aria-label={`${resource.label} ${resource.valueText}`}
    >
      <div className="group-resource-header">
        <span>{resource.label}</span>
        <strong>{resource.valueText}</strong>
      </div>
      <div className="group-resource-track" aria-hidden="true">
        <span style={{ width: `${resource.percentage}%` }} />
      </div>
    </div>
  )
}

type QuestInfoPanelProps = {
  value: MudValue
}

function QuestInfoPanel({ value }: QuestInfoPanelProps) {
  const normalizedValue = normalizeQuestValue(value)
  return <div className="tab-inline-output quest-html-output">{renderQuestNode(normalizedValue)}</div>
}

function MudValuePanel({ value, emptyMessage }: MudValuePanelProps) {
  if (value === undefined || value === null) {
    return <EmptyTabMessage message={emptyMessage} />
  }

  const text = formatMudValueAsText(value)
  return <div className="tab-inline-output">{text || emptyMessage}</div>
}

function formatMudValueAsText(value: MudValue): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return formatNumber(value) ?? String(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatMudValueAsText(item)).filter(Boolean).join(', ')
  }

  const entries = Object.entries(value)
    .map(([key, val]) => {
      const formattedValue = formatMudValueAsText(val)
      return formattedValue ? `${formatMudLabel(key)}: ${formattedValue}` : null
    })
    .filter(Boolean)

  return entries.join(' | ')
}

function parseGroupMembers(value: MudValue): GroupMember[] {
  const entries = asCollection(value)

  return entries
    .flatMap((entry) => {
      if (!isMudRecord(entry)) {
        return []
      }

      const name = asOptionalText(
        readAnyKey(entry, ['name', 'NAME', 'member_name', 'MEMBER_NAME', 'character_name', 'CHARACTER_NAME']),
      )
      const health = asOptionalText(readAnyKey(entry, ['health', 'HEALTH']))
      const healthMax = asOptionalText(readAnyKey(entry, ['health_max', 'HEALTH_MAX', 'max_health', 'MAX_HEALTH']))
      const move = asOptionalText(readAnyKey(entry, ['move', 'MOVE', 'movement', 'MOVEMENT']))
      const moveMax = asOptionalText(readAnyKey(entry, ['move_max', 'MOVE_MAX', 'movement_max', 'MOVEMENT_MAX']))
      const isLeader = asOptionalBoolean(readAnyKey(entry, ['is_leader', 'IS_LEADER', 'leader', 'LEADER'])) ?? false
      const statusText = asOptionalText(readAnyKey(entry, ['status', 'STATUS', 'position', 'POSITION', 'state', 'STATE']))
      const rawText = asOptionalText(readAnyKey(entry, ['raw', 'RAW', 'raw_text', 'RAW_TEXT']))
      const unknownFieldsText = formatUnknownGroupFields(entry)
      const resources = [
        buildGroupResource('health', 'Health', health, healthMax),
        buildGroupResource('movement', 'Move', move, moveMax),
      ].filter((resource): resource is GroupResource => resource !== null)

      if (!name && !statusText && !rawText && resources.length === 0 && !unknownFieldsText) {
        return []
      }

      return [
        {
          nameText: name ?? 'Unknown',
          isNameMissing: !name,
          isLeader,
          leaderText: isLeader ? 'Leader' : undefined,
          statusText,
          resources,
          rawText,
          unknownFieldsText,
        },
      ]
    })
}

function parseAffectEntries(value: MudValue): AffectEntry[] {
  if (value === undefined || value === null) {
    return []
  }

  if (typeof value === 'string') {
    return buildAffectEntriesFromText(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    const text = formatMudValueAsText(value)
    return text ? [{ nameText: text, isNameMissing: false, detailLines: [], supplementaryLines: [] }] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap<AffectEntry>((entry) => parseAffectEntries(entry))
  }

  if (isSingleAffectRecord(value)) {
    const affect = parseAffectRecord(value)
    return affect ? [affect] : []
  }

  return Object.entries(value).flatMap<AffectEntry>(([key, entry]) => parseAffectValueEntry(entry, key))
}

function parseAffectValueEntry(value: MudValue, fallbackName?: string): AffectEntry[] {
  if (value === undefined || value === null) {
    return []
  }

  if (typeof value === 'string') {
    return buildAffectEntriesFromText(value, fallbackName)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    const text = formatMudValueAsText(value)
    const label = formatAffectFallbackName(fallbackName)
    if (!text) {
      return []
    }

    return [
      {
        nameText: label ?? text,
        isNameMissing: !label,
        detailLines: label ? [text] : [],
        supplementaryLines: [],
      },
    ]
  }

  if (Array.isArray(value)) {
    return value.flatMap<AffectEntry>((entry) => parseAffectValueEntry(entry, fallbackName))
  }

  if (!isMudRecord(value)) {
    return []
  }

  if (isSingleAffectRecord(value)) {
    const affect = parseAffectRecord(value, fallbackName)
    return affect ? [affect] : []
  }

  return Object.entries(value).flatMap<AffectEntry>(([key, entry]) => parseAffectValueEntry(entry, key))
}

function parseAffectRecord(record: Record<string, MudValue>, fallbackName?: string): AffectEntry | null {
  const name =
    asOptionalText(
      readAnyKey(record, ['name', 'NAME', 'affect', 'AFFECT', 'effect', 'EFFECT', 'spell', 'SPELL', 'type', 'TYPE']),
    ) ?? formatAffectFallbackName(fallbackName)
  const duration = asOptionalText(
    readAnyKey(record, ['duration', 'DURATION', 'remaining', 'REMAINING', 'time', 'TIME', 'timer', 'TIMER', 'ticks', 'TICKS']),
  )
  const modifier = asOptionalText(
    readAnyKey(record, ['modifier', 'MODIFIER', 'mod', 'MOD', 'amount', 'AMOUNT', 'value', 'VALUE']),
  )
  const location = asOptionalText(
    readAnyKey(record, ['location', 'LOCATION', 'apply', 'APPLY', 'stat', 'STAT', 'where', 'WHERE', 'target', 'TARGET']),
  )
  const bonusType = asOptionalText(
    readAnyKey(record, ['bonus_type', 'BONUS_TYPE', 'bonusType', 'BONUSTYPE', 'type_name', 'TYPE_NAME']),
  )
  const status = asOptionalText(readAnyKey(record, ['status', 'STATUS', 'state', 'STATE']))
  const rawText = asOptionalText(readAnyKey(record, ['raw', 'RAW', 'raw_text', 'RAW_TEXT', 'text', 'TEXT']))
  const detailText = formatAffectDetail(status, location, modifier, bonusType)
  const unknownFieldsText = formatUnknownAffectFields(record)

  if (!name && !duration && !detailText && !rawText && !unknownFieldsText) {
    return null
  }

  return {
    nameText: name ?? 'Unknown effect',
    isNameMissing: !name,
    durationText: duration,
    detailLines: detailText ? [detailText] : [],
    supplementaryLines: [rawText, unknownFieldsText ? `Other: ${unknownFieldsText}` : undefined].filter(
      (line): line is string => Boolean(line),
    ),
  }
}

function buildAffectEntriesFromText(value: string, fallbackName?: string): AffectEntry[] {
  const entries = splitAffectTextEntries(value)
  if (entries.length === 0) {
    return []
  }

  const fallbackLabel = formatAffectFallbackName(fallbackName)
  if (fallbackLabel && entries.length === 1) {
    return [
      {
        nameText: fallbackLabel,
        isNameMissing: false,
        detailLines: [entries[0]],
        supplementaryLines: [],
      },
    ]
  }

  return entries.map((entry) => ({
    nameText: entry,
    isNameMissing: false,
    detailLines: [],
    supplementaryLines: [],
  }))
}

function mergeAffectEntries(entries: AffectEntry[]) {
  const mergedEntries: AffectEntry[] = []
  const entriesByName = new Map<string, AffectEntry>()

  for (const entry of entries) {
    const groupingKey = entry.isNameMissing ? '' : entry.nameText.trim().toLowerCase()
    if (!groupingKey) {
      mergedEntries.push({
        ...entry,
        detailLines: [...entry.detailLines],
        supplementaryLines: [...entry.supplementaryLines],
      })
      continue
    }

    const existingEntry = entriesByName.get(groupingKey)
    if (!existingEntry) {
      const clonedEntry = {
        ...entry,
        detailLines: [...entry.detailLines],
        supplementaryLines: [...entry.supplementaryLines],
      }
      entriesByName.set(groupingKey, clonedEntry)
      mergedEntries.push(clonedEntry)
      continue
    }

    if (!existingEntry.durationText && entry.durationText) {
      existingEntry.durationText = entry.durationText
    } else if (
      existingEntry.durationText &&
      entry.durationText &&
      entry.durationText !== existingEntry.durationText
    ) {
      appendUniqueAffectLine(existingEntry.supplementaryLines, `Duration: ${entry.durationText}`)
    }

    for (const line of entry.detailLines) {
      appendUniqueAffectLine(existingEntry.detailLines, line)
    }

    for (const line of entry.supplementaryLines) {
      appendUniqueAffectLine(existingEntry.supplementaryLines, line)
    }
  }

  return mergedEntries
}

function appendUniqueAffectLine(lines: string[], line: string) {
  if (!lines.includes(line)) {
    lines.push(line)
  }
}

function splitAffectTextEntries(value: string) {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) {
    return []
  }

  const primaryParts = normalized
    .split(/\n+|\s*\|\s*|\s*;\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (primaryParts.length > 1) {
    return primaryParts
  }

  const commaParts = normalized
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  return commaParts.length > 1 ? commaParts : [normalized]
}

function isSingleAffectRecord(record: Record<string, MudValue>) {
  return Object.keys(record).some((key) =>
    new Set([
      'name',
      'NAME',
      'affect',
      'AFFECT',
      'effect',
      'EFFECT',
      'spell',
      'SPELL',
      'type',
      'TYPE',
      'duration',
      'DURATION',
      'remaining',
      'REMAINING',
      'time',
      'TIME',
      'timer',
      'TIMER',
      'ticks',
      'TICKS',
      'modifier',
      'MODIFIER',
      'mod',
      'MOD',
      'amount',
      'AMOUNT',
      'value',
      'VALUE',
      'location',
      'LOCATION',
      'apply',
      'APPLY',
      'stat',
      'STAT',
      'where',
      'WHERE',
      'target',
      'TARGET',
      'status',
      'STATUS',
      'state',
      'STATE',
      'raw',
      'RAW',
      'raw_text',
      'RAW_TEXT',
      'text',
      'TEXT',
    ]).has(key),
  )
}

function formatAffectFallbackName(value?: string) {
  const normalized = value?.trim()
  if (!normalized || /^\d+$/.test(normalized) || /^affect[_-]?\d*$/i.test(normalized)) {
    return undefined
  }

  return formatMudLabel(normalized)
}

function buildHudBar({
  id,
  status,
  label,
  value,
  max,
  accentClass,
  widthValue,
}: {
  id: string
  status: ConnectionStatus
  label: string
  value?: number
  max?: number
  accentClass: string
  widthValue: string
}): BarConfig {
  const hasValue = Number.isFinite(value) && Number.isFinite(max) && (max as number) > 0
  const safeMax = hasValue ? (max as number) : 0
  const percentage = hasValue && safeMax > 0 ? Math.min(Math.max(((value as number) / safeMax) * 100, 0), 100) : 0
  const availabilityKind = getHudBarAvailabilityKind(status, hasValue)
  const valueText = hasValue ? `${formatNumber(value)} / ${formatNumber(max)}` : getHudBarFallbackText(availabilityKind)
  const ariaLabel = `${label} ${valueText}`

  return {
    id,
    label,
    valueText,
    percentage,
    ariaLabel,
    availabilityKind,
    accentClass,
    widthValue,
  }
}

function getHudBarAvailabilityKind(
  status: ConnectionStatus,
  hasValue: boolean,
): BarConfig['availabilityKind'] {
  if (status === 'error') {
    return 'error'
  }

  if (status === 'connected') {
    return hasValue ? 'present' : 'unavailable'
  }

  if (status === 'connecting') {
    return 'loading'
  }

  return 'offline'
}

function getHudBarFallbackText(kind: BarConfig['availabilityKind']) {
  switch (kind) {
    case 'error':
      return 'Error'
    case 'loading':
      return 'Loading'
    case 'offline':
      return 'Offline'
    case 'unavailable':
      return 'Waiting'
    case 'present':
      return 'Waiting'
    default:
      return 'Waiting'
  }
}

function buildGroupResource(
  id: GroupResource['id'],
  label: string,
  value?: string,
  max?: string,
): GroupResource | null {
  if (!value && !max) {
    return null
  }

  const numericValue = parseNumericMudText(value)
  const numericMax = parseNumericMudText(max)
  const percentage =
    numericValue !== undefined && numericMax !== undefined && numericMax > 0
      ? Math.min(Math.max((numericValue / numericMax) * 100, 0), 100)
      : 0

  return {
    id,
    label,
    valueText: value && max ? `${value}/${max}` : value || max || 'Unknown',
    percentage,
    availabilityKind: value && max ? 'present' : 'empty',
  }
}

function formatUnknownGroupFields(record: Record<string, MudValue>) {
  const ignoredKeys = new Set([
    'name',
    'NAME',
    'member_name',
    'MEMBER_NAME',
    'character_name',
    'CHARACTER_NAME',
    'health',
    'HEALTH',
    'health_max',
    'HEALTH_MAX',
    'max_health',
    'MAX_HEALTH',
    'move',
    'MOVE',
    'movement',
    'MOVEMENT',
    'move_max',
    'MOVE_MAX',
    'movement_max',
    'MOVEMENT_MAX',
    'is_leader',
    'IS_LEADER',
    'leader',
    'LEADER',
    'status',
    'STATUS',
    'position',
    'POSITION',
    'state',
    'STATE',
    'raw',
    'RAW',
    'raw_text',
    'RAW_TEXT',
  ])

  const entries = Object.entries(record)
    .map(([key, entryValue]) => {
      if (ignoredKeys.has(key)) {
        return null
      }

      const formattedValue = formatMudValueAsText(entryValue)
      return formattedValue ? `${formatMudLabel(key)}: ${formattedValue}` : null
    })
    .filter((entry): entry is string => Boolean(entry))

  return entries.length > 0 ? entries.join(' | ') : undefined
}

function formatAffectDetail(status?: string, location?: string, modifier?: string, bonusType?: string) {
  const locationText =
    location && modifier
      ? `${location}: ${modifier}`
      : location || modifier

  const bonusTypeText = bonusType ? `(${bonusType})` : undefined

  const detailParts = [status, locationText, bonusTypeText].filter((part): part is string => Boolean(part))
  return detailParts.length > 0 ? detailParts.join(' · ') : undefined
}

function formatUnknownAffectFields(record: Record<string, MudValue>) {
  const ignoredKeys = new Set([
    'name',
    'NAME',
    'affect',
    'AFFECT',
    'effect',
    'EFFECT',
    'spell',
    'SPELL',
    'type',
    'TYPE',
    'duration',
    'DURATION',
    'remaining',
    'REMAINING',
    'time',
    'TIME',
    'timer',
    'TIMER',
    'ticks',
    'TICKS',
    'modifier',
    'MODIFIER',
    'mod',
    'MOD',
    'amount',
    'AMOUNT',
    'value',
    'VALUE',
    'location',
    'LOCATION',
    'apply',
    'APPLY',
    'stat',
    'STAT',
    'where',
    'WHERE',
    'target',
    'TARGET',
    'bonus_type',
    'BONUS_TYPE',
    'bonusType',
    'BONUSTYPE',
    'type_name',
    'TYPE_NAME',
    'status',
    'STATUS',
    'state',
    'STATE',
    'raw',
    'RAW',
    'raw_text',
    'RAW_TEXT',
    'text',
    'TEXT',
  ])

  const entries = Object.entries(record)
    .map(([key, entryValue]) => {
      if (ignoredKeys.has(key)) {
        return null
      }

      const formattedValue = formatMudValueAsText(entryValue)
      return formattedValue ? `${formatMudLabel(key)}: ${formattedValue}` : null
    })
    .filter((entry): entry is string => Boolean(entry))

  return entries.length > 0 ? entries.join(' | ') : undefined
}

function renderQuestNode(value: MudValue): ReactNode {
  if (value === null || value === undefined) {
    return <span className="quest-empty">No quest data reported yet.</span>
  }

  const compactQuests = parseQuestEntries(value)
  if (compactQuests.length > 0) {
    return (
      <div className="quest-compact-list">
        {compactQuests.map((quest, index) => (
          <div className="quest-compact-item" key={`${quest.name ?? 'quest'}-${index}`}>
            {quest.name ? <div className="quest-compact-name" dangerouslySetInnerHTML={{ __html: renderMudHtml(quest.name) }} /> : null}
            {quest.type ? (
              <div className="quest-compact-type">
                <span dangerouslySetInnerHTML={{ __html: renderMudHtml(quest.type) }} />
                {quest.progress ? <span>: {quest.progress.label}</span> : null}
              </div>
            ) : quest.progress ? (
              <div className="quest-compact-type">Progress: {quest.progress.label}</div>
            ) : null}
            {quest.progress ? (
              <div
                className="quest-progress-bar"
                role="progressbar"
                aria-label={`Quest progress ${quest.progress.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(quest.progress.percentage)}
              >
                <div className="quest-progress-bar-fill" style={{ width: `${quest.progress.percentage}%` }} />
              </div>
            ) : null}
            {quest.targets ? (
              <div className="quest-compact-targets">
                <span className="quest-compact-target-label">Target: </span>
                <span dangerouslySetInnerHTML={{ __html: renderMudHtml(quest.targets) }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  if (typeof value === 'string') {
    return <span dangerouslySetInnerHTML={{ __html: renderMudHtml(value) }} />
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span>{formatMudValueAsText(value)}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="quest-empty">No entries.</span>
    }

    return (
      <ul className="quest-list">
        {value.map((item, index) => (
          <li key={index}>{renderQuestNode(item)}</li>
        ))}
      </ul>
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    return <span className="quest-empty">No fields.</span>
  }

  return (
    <div className="quest-object">
      {entries.map(([key, entryValue]) => {
        const label = formatMudLabel(key)
        const isScalar =
          entryValue === null ||
          entryValue === undefined ||
          typeof entryValue === 'string' ||
          typeof entryValue === 'number' ||
          typeof entryValue === 'boolean'

        if (isScalar) {
          return (
            <div key={key} className="quest-row">
              <span className="quest-key">{label}</span>
              <span className="quest-value">{renderQuestNode(entryValue)}</span>
            </div>
          )
        }

        return (
          <div key={key} className="quest-block">
            <div className="quest-block-title">{label}</div>
            <div>{renderQuestNode(entryValue)}</div>
          </div>
        )
      })}
    </div>
  )
}

type QuestEntry = {
  name?: string
  type?: string
  progress?: QuestProgress
  targets?: string
}

type QuestProgress = {
  label: string
  percentage: number
}

function parseQuestEntries(value: MudValue): QuestEntry[] {
  const source = Array.isArray(value) ? value : isMudRecord(value) ? [value] : []

  return source.flatMap((entry) => {
    if (!isMudRecord(entry)) {
      return []
    }

    const name = asOptionalText(readAnyKey(entry, ['name', 'NAME']))
    const type = sanitizeQuestType(asOptionalText(readAnyKey(entry, ['type', 'TYPE'])))
    const progress = formatQuestProgress(readAnyKey(entry, ['progress', 'PROGRESS']))
    const targets = formatQuestTargets(readAnyKey(entry, ['targets', 'TARGETS']))

    if (!name && !type && !progress && !targets) {
      return []
    }

    return [
      {
        name,
        type,
        progress,
        targets,
      },
    ]
  })
}

function formatQuestProgress(value: MudValue | undefined): QuestProgress | undefined {
  if (!isMudRecord(value)) {
    return undefined
  }

  const completed = asOptionalText(readAnyKey(value, ['completed', 'COMPLETED']))
  const required = asOptionalText(readAnyKey(value, ['required', 'REQUIRED']))
  if (!completed || !required) {
    return undefined
  }

  const completedCount = Number.parseInt(completed, 10)
  const requiredCount = Number.parseInt(required, 10)
  const percentage =
    Number.isFinite(completedCount) && Number.isFinite(requiredCount) && requiredCount > 0
      ? Math.max(0, Math.min((completedCount / requiredCount) * 100, 100))
      : 0

  return {
    label: `${completed}/${required}`,
    percentage,
  }
}

function formatQuestTargets(value: MudValue | undefined): string | undefined {
  const source = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const names = source
    .map((target) => {
      if (isMudRecord(target)) {
        return asOptionalText(
          readAnyKey(target, ['name', 'NAME', 'short_description', 'SHORT_DESCRIPTION', 'description', 'DESCRIPTION', 'target', 'TARGET']),
        )
      }

      return asOptionalText(target)
    })
    .filter((entry): entry is string => Boolean(entry))

  if (names.length === 0) {
    return undefined
  }

  return names.join(', ')
}

function normalizeQuestValue(value: MudValue): MudValue {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))

  if (!looksLikeJson) {
    return value
  }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (isMudValue(parsed)) {
      return parsed
    }
  } catch {
    return value
  }

  return value
}

function isMudValue(value: unknown): value is MudValue {
  if (value === null || value === undefined) {
    return true
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((item) => isMudValue(item))
  }

  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isMudValue(entry))
  }

  return false
}

function asCollection(value: MudValue): MudValue[] {
  if (Array.isArray(value)) {
    return value
  }

  if (isMudRecord(value)) {
    return Object.values(value)
  }

  return []
}

function isMudRecord(value: unknown): value is Record<string, MudValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readAnyKey(record: Record<string, MudValue>, keys: string[]): MudValue | undefined {
  for (const key of keys) {
    if (key in record) {
      return record[key]
    }
  }

  return undefined
}

function sanitizeQuestType(value: string | undefined) {
  if (!value) {
    return undefined
  }

  return value.replace(/\s*\(?comma separated values\)?/i, '').trim()
}

function asOptionalText(value: MudValue | undefined) {
  if (value === undefined || value === null) {
    return undefined
  }

  const formatted = formatMudValueAsText(value)
  return formatted || undefined
}

function asOptionalBoolean(value: MudValue | undefined): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y') {
      return true
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'n') {
      return false
    }
  }

  return undefined
}

function parseNumericMudText(value?: string) {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseFloat(value.replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

function formatMudLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function getSettingsUrl() {
  return '/api/settings'
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null
    }

    return parsed as ServerMessage
  } catch {
    return null
  }
}

function formatNumber(value: number | undefined) {
  return value === undefined ? undefined : new Intl.NumberFormat().format(value)
}

function formatInfoNumber(value: number | undefined) {
  return formatNumber(value) ?? '—'
}

function formatWeaponAmmo(type: string | undefined, current: number | undefined, max: number | undefined) {
  const normalizedType = type?.trim()
  if (!normalizedType && current === undefined && max === undefined) {
    return 'None'
  }

  return `${normalizedType ? formatMudLabel(normalizedType) : 'Unknown'} ${formatInfoNumber(current)}/${formatInfoNumber(max)}`
}

function formatActionEconomy(standard: number | undefined, move: number | undefined, quick: number | undefined) {
  if (standard === undefined && move === undefined && quick === undefined) {
    return '—'
  }

  const available = [
    standard !== 0 ? 'Standard' : undefined,
    move !== 0 ? 'Move' : undefined,
    quick !== 0 ? 'Quick' : undefined,
  ].filter((action): action is string => action !== undefined)

  return available.length > 0 ? available.join(' · ') : 'None'
}

function formatSignedNumber(value: number | undefined) {
  if (value === undefined) {
    return '—'
  }

  if (value > 0) {
    return `+${value}`
  }

  return String(value)
}

function getExperienceProgress(mudState: MudState, isStarWarsConnection: boolean) {
  if (mudState.experienceMax === undefined) {
    return undefined
  }

  // Star Wars supplies EXPERIENCE_TNL as experience earned in the current
  // level (despite the inherited TNL variable name). Other MUDs use it as
  // experience remaining, so preserve their existing calculation.
  if (isStarWarsConnection) {
    return mudState.experienceTnl ?? mudState.experience
  }

  if (mudState.experienceTnl === undefined) {
    return mudState.experience
  }

  return Math.max(mudState.experienceMax - mudState.experienceTnl, 0)
}

function hasCompleteCombatGaugeData(value?: number, max?: number) {
  return Number.isFinite(value) && Number.isFinite(max) && (value as number) > 0 && (max as number) > 0
}

function buildAsciiMapOutput(minimap?: string) {
  return minimap && minimap.length > 0 ? minimap : 'Waiting for MINIMAP MSDP data.'
}

type GraphicMapRoomCell = {
  key: string
  title: string
  kind: 'room'
  color: string
  isCurrent: boolean
  markers: Array<{
    id: string
    icon: string
    label: string
    className?: string
  }>
}

type GraphicMapConnectorCell = {
  key: string
  title: string
  kind: 'connector'
  color: string
  orientation: 'horizontal' | 'vertical' | 'diagonal-ascending' | 'diagonal-descending' | 'diagonal-cross'
}

type GraphicMapEmptyCell = {
  key: string
  title: string
  kind: 'empty'
  color?: undefined
}

type GraphicMapCell = GraphicMapRoomCell | GraphicMapConnectorCell | GraphicMapEmptyCell

type BuiltGraphicMap = {
  width: number
  height: number
  cells: GraphicMapCell[]
}

const GRAPHIC_MAP_SECTOR_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#bfbfbf',
  2: '#84cc16',
  3: '#166534',
  4: '#a16207',
  5: '#940000',
  6: '#6992e2',
  7: '#0950dc',
  8: '#ffffff',
  9: '#090fb3',
  10: '#dc2626',
  11: '#feb44d',
  12: '#feb44d',
  13: '#feb44d',
  14: '#dee137',
  15: '#155e75',
  16: '#9544ca',
  17: '#610000',
  18: '#390080',
  19: '#a05713',
  20: '#9e9e9e',
  21: '#575757',
  22: '#4f5dc4',
  23: '#475569',
  24: '#dc2626',
  25: '#ac2f2f',
  26: '#b91c1c',
  27: '#d2b48c',
  28: '#a3a3a3',
  29: '#545454',
  30: '#2b7a00',
  31: '#c5e0e7',
  32: '#65a30d',
  33: '#fee9b4',
  34: '#991b1b',
  35: '#52525b',
  36: '#0891b2',
}

const GRAPHIC_MAP_DEFAULT_TILE_COLOR = '#111827'
const GRAPHIC_MAP_MARKER_ICONS: Record<string, { icon: string; label: string; className?: string }> = {
  u: { icon: '↑', label: 'Up exit' },
  d: { icon: '↓', label: 'Down exit' },
  i: { icon: '🚪↘', label: 'Inside exit', className: 'graphic-map-marker-entrance' },
  o: { icon: '🚪↗', label: 'Outside exit', className: 'graphic-map-marker-entrance' },
}

function buildGraphicMap(graphicMap?: GraphicMapData, minimap?: string, rotate180 = false): BuiltGraphicMap | null {
  if (!graphicMap?.rooms?.length) {
    return null
  }

  const validRooms = graphicMap.rooms.filter(isGraphicMapRoomWithCoordinates)
  if (validRooms.length === 0) {
    return null
  }

  const radius = clampGraphicMapRadius(graphicMap.radius)
  const boundedRooms = validRooms
    .filter((room) => Math.abs(room.x) <= radius && Math.abs(room.y) <= radius)
    .map((room) =>
      rotate180
        ? {
            ...room,
            x: -room.x,
            y: -room.y,
          }
        : room,
    )
  if (boundedRooms.length === 0) {
    return null
  }

  const roomGridSize = radius * 2 + 1
  const width = roomGridSize * 2 - 1
  const height = roomGridSize * 2 - 1
  const roomsByPosition = new Map<string, GraphicMapRoom>()

  for (const room of boundedRooms) {
    roomsByPosition.set(`${room.x},${room.y}`, room)
  }

  const connectionMap = inferGraphicMapConnections(boundedRooms, minimap)

  const cells: GraphicMapCell[] = []

  for (let gridY = 0; gridY < height; gridY += 1) {
    for (let gridX = 0; gridX < width; gridX += 1) {
      const key = `${gridX},${gridY}`
      const lookupGridX = rotate180 ? width - 1 - gridX : gridX
      const roomX = Math.floor(lookupGridX / 2) - radius
      const roomY = Math.floor(gridY / 2) - radius
      const isRoomColumn = lookupGridX % 2 === 0
      const isRoomRow = gridY % 2 === 0

      if (isRoomColumn && isRoomRow) {
        const room = roomsByPosition.get(`${roomX},${roomY}`)
        if (!room) {
          cells.push({ key, kind: 'empty', title: 'Unmapped room' })
          continue
        }

        const sector = room.s
        cells.push({
          key,
          kind: 'room',
          color: sector === undefined ? GRAPHIC_MAP_DEFAULT_TILE_COLOR : getGraphicMapSectorColor(sector, room.i === 1),
          isCurrent: roomX === 0 && roomY === 0,
          markers: getGraphicMapMarkers(room.sp),
          title: `Room ${room.v ?? 'unknown'} · sector ${sector ?? 'unknown'}${room.i === 1 ? ' · indoors' : ''}`,
        })
        continue
      }

      if (!isRoomColumn && isRoomRow) {
        const leftRoom = roomsByPosition.get(`${roomX},${roomY}`)
        const rightRoom = roomsByPosition.get(`${roomX + 1},${roomY}`)

        if (leftRoom && rightRoom && shouldRenderGraphicMapConnection(leftRoom, rightRoom, 1, 0, connectionMap)) {
          cells.push({
            key,
            kind: 'connector',
            orientation: 'horizontal',
            color: getGraphicMapConnectionColor(leftRoom, rightRoom),
            title: `Connection between rooms ${leftRoom.v ?? 'unknown'} and ${rightRoom.v ?? 'unknown'}`,
          })
          continue
        }
      }

      if (isRoomColumn && !isRoomRow) {
        const topRoom = roomsByPosition.get(`${roomX},${roomY}`)
        const bottomRoom = roomsByPosition.get(`${roomX},${roomY + 1}`)

        if (topRoom && bottomRoom && shouldRenderGraphicMapConnection(topRoom, bottomRoom, 0, 1, connectionMap)) {
          cells.push({
            key,
            kind: 'connector',
            orientation: 'vertical',
            color: getGraphicMapConnectionColor(topRoom, bottomRoom),
            title: `Connection between rooms ${topRoom.v ?? 'unknown'} and ${bottomRoom.v ?? 'unknown'}`,
          })
          continue
        }
      }

      if (!isRoomColumn && !isRoomRow) {
        const northwestRoom = roomsByPosition.get(`${roomX},${roomY}`)
        const northeastRoom = roomsByPosition.get(`${roomX + 1},${roomY}`)
        const southwestRoom = roomsByPosition.get(`${roomX},${roomY + 1}`)
        const southeastRoom = roomsByPosition.get(`${roomX + 1},${roomY + 1}`)
        const hasDescendingDiagonal = Boolean(
          northwestRoom &&
            southeastRoom &&
            shouldRenderGraphicMapConnection(northwestRoom, southeastRoom, 1, 1, connectionMap),
        )
        const hasAscendingDiagonal = Boolean(
          northeastRoom &&
            southwestRoom &&
            shouldRenderGraphicMapConnection(northeastRoom, southwestRoom, -1, 1, connectionMap),
        )

        const descendingColor =
          hasDescendingDiagonal && northwestRoom && southeastRoom
            ? getGraphicMapConnectionColor(northwestRoom, southeastRoom)
            : null
        const ascendingColor =
          hasAscendingDiagonal && northeastRoom && southwestRoom
            ? getGraphicMapConnectionColor(northeastRoom, southwestRoom)
            : null

        if (descendingColor || ascendingColor) {
          const diagonalConnections: string[] = []
          if (hasDescendingDiagonal && northwestRoom && southeastRoom) {
            diagonalConnections.push(`NW-SE between rooms ${northwestRoom.v ?? 'unknown'} and ${southeastRoom.v ?? 'unknown'}`)
          }

          if (hasAscendingDiagonal && northeastRoom && southwestRoom) {
            diagonalConnections.push(`NE-SW between rooms ${northeastRoom.v ?? 'unknown'} and ${southwestRoom.v ?? 'unknown'}`)
          }

          cells.push({
            key,
            kind: 'connector',
            orientation:
              descendingColor && ascendingColor
                ? 'diagonal-cross'
                : descendingColor
                  ? 'diagonal-descending'
                  : 'diagonal-ascending',
            color:
              descendingColor && ascendingColor
                ? mixGraphicMapColor(descendingColor, ascendingColor, 0.5)
                : descendingColor ?? ascendingColor ?? GRAPHIC_MAP_DEFAULT_TILE_COLOR,
            title: `Diagonal connection${diagonalConnections.length > 1 ? 's' : ''}: ${diagonalConnections.join(' · ')}`,
          })
          continue
        }
      }

      cells.push({ key, kind: 'empty', title: 'Unmapped space' })
    }
  }

  return { width, height, cells }
}

function isGraphicMapRoomWithCoordinates(room: GraphicMapRoom): room is GraphicMapRoom & { x: number; y: number } {
  return typeof room.x === 'number' && Number.isFinite(room.x) && typeof room.y === 'number' && Number.isFinite(room.y)
}

function shouldRenderGraphicMapConnection(
  firstRoom: GraphicMapRoom | undefined,
  secondRoom: GraphicMapRoom | undefined,
  offsetX: number,
  offsetY: number,
  connectionMap: GraphicMapConnectionMap,
) {
  if (!firstRoom || !secondRoom || !isGraphicMapRoomWithCoordinates(firstRoom) || !isGraphicMapRoomWithCoordinates(secondRoom)) {
    return false
  }

  return isKnownGraphicMapConnection(firstRoom, secondRoom, offsetX, offsetY, connectionMap)
}

type GraphicMapDirection = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw'

type GraphicMapConnectionMap = Record<string, Partial<Record<GraphicMapDirection, string>>>

const GRAPHIC_MAP_DIRECTION_ORDER: GraphicMapDirection[] = ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw']

const GRAPHIC_MAP_OPPOSITE_DIRECTIONS: Record<GraphicMapDirection, GraphicMapDirection> = {
  n: 's',
  e: 'w',
  s: 'n',
  w: 'e',
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
}

const GRAPHIC_MAP_DIRECTION_OFFSETS: Record<GraphicMapDirection, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
}

const GRAPHIC_MAP_CONNECTION_BITS: Record<GraphicMapDirection, number> = {
  n: 1 << 0,
  e: 1 << 1,
  s: 1 << 2,
  w: 1 << 3,
  nw: 1 << 4,
  ne: 1 << 5,
  se: 1 << 6,
  sw: 1 << 7,
}

function isKnownGraphicMapConnection(
  firstRoom: GraphicMapRoom & { x: number; y: number },
  secondRoom: GraphicMapRoom & { x: number; y: number },
  offsetX: number,
  offsetY: number,
  connectionMap: GraphicMapConnectionMap,
) {
  const direction = getGraphicMapDirectionForOffset(offsetX, offsetY)
  if (!direction) {
    return false
  }

  const firstRoomKey = getGraphicMapRoomKey(firstRoom)
  const secondRoomKey = getGraphicMapRoomKey(secondRoom)
  const reverseDirection = GRAPHIC_MAP_OPPOSITE_DIRECTIONS[direction]

  return (
    connectionMap[firstRoomKey]?.[direction] === secondRoomKey ||
    connectionMap[secondRoomKey]?.[reverseDirection] === firstRoomKey
  )
}

function inferGraphicMapConnections(
  rooms: Array<GraphicMapRoom & { x: number; y: number }>,
  minimap?: string,
): GraphicMapConnectionMap {
  const authoritativeConnections = inferGraphicMapConnectionsFromRoomConnectors(rooms)
  if (authoritativeConnections) {
    return authoritativeConnections
  }

  return inferGraphicMapConnectionsFromMinimap(rooms, minimap)
}

function inferGraphicMapConnectionsFromRoomConnectors(
  rooms: Array<GraphicMapRoom & { x: number; y: number }>,
): GraphicMapConnectionMap | null {
  const hasAuthoritativeConnectors = rooms.some((room) => typeof room.c === 'number' && Number.isFinite(room.c))

  if (!hasAuthoritativeConnectors) {
    return null
  }

  const roomsByCoordinate = new Map(rooms.map((room) => [`${room.x},${room.y}`, room] as const))
  const connectionMap: GraphicMapConnectionMap = {}

  for (const room of rooms) {
    const roomKey = getGraphicMapRoomKey(room)
    const connectionMask = typeof room.c === 'number' && Number.isFinite(room.c) ? Math.trunc(room.c) : 0

    for (const direction of GRAPHIC_MAP_DIRECTION_ORDER) {
      if ((connectionMask & GRAPHIC_MAP_CONNECTION_BITS[direction]) === 0) {
        continue
      }

      const [offsetX, offsetY] = GRAPHIC_MAP_DIRECTION_OFFSETS[direction]
      const targetRoom = roomsByCoordinate.get(`${room.x + offsetX},${room.y + offsetY}`)
      if (!targetRoom) {
        continue
      }

      const targetKey = getGraphicMapRoomKey(targetRoom)
      connectionMap[roomKey] = {
        ...(connectionMap[roomKey] ?? {}),
        [direction]: targetKey,
      }
      connectionMap[targetKey] = {
        ...(connectionMap[targetKey] ?? {}),
        [GRAPHIC_MAP_OPPOSITE_DIRECTIONS[direction]]: roomKey,
      }
    }
  }

  return connectionMap
}

type MinimapRoomToken = {
  x: number
  y: number
  row: number
  column: number
}

function inferGraphicMapConnectionsFromMinimap(
  rooms: Array<GraphicMapRoom & { x: number; y: number }>,
  minimap?: string,
): GraphicMapConnectionMap {
  const tokens = parseMinimapRoomTokens(minimap)
  if (!tokens) {
    return {}
  }

  const roomKeysByCoordinate = new Map<string, string>()
  for (const room of rooms) {
    roomKeysByCoordinate.set(`${room.x},${room.y}`, getGraphicMapRoomKey(room))
  }

  const connectionMap: GraphicMapConnectionMap = {}
  const directions: Array<[GraphicMapDirection, number, number]> = [
    ['e', 1, 0],
    ['s', 0, 1],
    ['se', 1, 1],
    ['sw', -1, 1],
  ]

  for (const token of tokens.rooms) {
    const fromKey = roomKeysByCoordinate.get(`${token.x},${token.y}`)
    if (!fromKey) {
      continue
    }

    for (const [direction, offsetX, offsetY] of directions) {
      const neighborToken = tokens.byCoordinate.get(`${token.x + offsetX},${token.y + offsetY}`)
      if (!neighborToken) {
        continue
      }

      const toKey = roomKeysByCoordinate.get(`${neighborToken.x},${neighborToken.y}`)
      if (!toKey) {
        continue
      }

      if (!minimapShowsGraphicMapConnection(tokens.lines, token, neighborToken, direction)) {
        continue
      }

      const reverseDirection = GRAPHIC_MAP_OPPOSITE_DIRECTIONS[direction]
      connectionMap[fromKey] = {
        ...(connectionMap[fromKey] ?? {}),
        [direction]: toKey,
      }
      connectionMap[toKey] = {
        ...(connectionMap[toKey] ?? {}),
        [reverseDirection]: fromKey,
      }
    }
  }

  return connectionMap
}

function parseMinimapRoomTokens(minimap?: string) {
  if (!minimap) {
    return null
  }

  const normalized = stripMudFormatting(minimap).replace(/\r/g, '')
  const lines = normalized.split('\n')
  const rawTokens: Array<{ row: number; column: number; token: string }> = []

  for (const [row, line] of lines.entries()) {
    const matches = line.matchAll(/\[[^\]]\]/g)
    for (const match of matches) {
      if (match.index === undefined) {
        continue
      }

      rawTokens.push({ row, column: match.index, token: match[0] })
    }
  }

  if (rawTokens.length === 0) {
    return null
  }

  const currentToken = rawTokens.find((token) => token.token === '[&]')
  if (!currentToken) {
    return null
  }

  const columnStep = getMinimapAxisStep(rawTokens.map((token) => token.column))
  const rowStep = getMinimapAxisStep(rawTokens.map((token) => token.row))
  if (!columnStep || !rowStep) {
    return null
  }

  const rooms = rawTokens.map<MinimapRoomToken>((token) => ({
    x: Math.round((token.column - currentToken.column) / columnStep),
    y: Math.round((token.row - currentToken.row) / rowStep),
    row: token.row,
    column: token.column,
  }))

  return {
    lines,
    rooms,
    byCoordinate: new Map(rooms.map((room) => [`${room.x},${room.y}`, room])),
  }
}

function getMinimapAxisStep(values: number[]) {
  const uniqueValues = [...new Set(values)].sort((left, right) => left - right)
  let step = 0

  for (let index = 1; index < uniqueValues.length; index += 1) {
    const delta = uniqueValues[index] - uniqueValues[index - 1]
    if (delta <= 0) {
      continue
    }

    step = step === 0 ? delta : greatestCommonDivisor(step, delta)
  }

  return step || null
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)

  while (b !== 0) {
    const next = a % b
    a = b
    b = next
  }

  return a
}

function minimapShowsGraphicMapConnection(
  lines: string[],
  fromToken: MinimapRoomToken,
  toToken: MinimapRoomToken,
  direction: GraphicMapDirection,
) {
  const rowStart = Math.min(fromToken.row, toToken.row)
  const rowEnd = Math.max(fromToken.row, toToken.row)
  const columnStart = Math.min(fromToken.column, toToken.column)
  const columnEnd = Math.max(fromToken.column, toToken.column)

  switch (direction) {
    case 'e': {
      const segment = readMinimapSegment(lines, fromToken.row, fromToken.column + 3, toToken.column)
      return /-/.test(segment)
    }
    case 's': {
      const centerColumn = fromToken.column + 1
      for (let row = fromToken.row + 1; row < toToken.row; row += 1) {
        const segment = readMinimapSegment(lines, row, centerColumn - 1, centerColumn + 2)
        if (/[|+]/.test(segment)) {
          return true
        }
      }
      return false
    }
    case 'se':
      for (let row = rowStart + 1; row < rowEnd; row += 1) {
        const segment = readMinimapSegment(lines, row, columnStart + 2, columnEnd + 1)
        if (/\\/.test(segment)) {
          return true
        }
      }
      return false
    case 'sw':
      for (let row = rowStart + 1; row < rowEnd; row += 1) {
        const segment = readMinimapSegment(lines, row, columnStart, columnEnd)
        if (/\//.test(segment)) {
          return true
        }
      }
      return false
    default:
      return false
  }
}

function readMinimapSegment(lines: string[], row: number, startColumn: number, endColumn: number) {
  const line = lines[row] ?? ''
  return line.slice(Math.max(0, startColumn), Math.max(startColumn, endColumn))
}

function getGraphicMapRoomKey(room: { x: number; y: number; v?: number }) {
  return typeof room.v === 'number' ? `v:${room.v}` : `p:${room.x},${room.y}`
}

function getGraphicMapDirectionForOffset(offsetX: number, offsetY: number): GraphicMapDirection | null {
  switch (`${offsetX},${offsetY}`) {
    case '0,-1':
      return 'n'
    case '1,0':
      return 'e'
    case '0,1':
      return 's'
    case '-1,0':
      return 'w'
    case '-1,-1':
      return 'nw'
    case '1,-1':
      return 'ne'
    case '1,1':
      return 'se'
    case '-1,1':
      return 'sw'
    default:
      return null
  }
}

function clampGraphicMapRadius(radius?: number) {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return 8
  }

  return Math.max(1, Math.min(8, Math.trunc(radius)))
}

function getGraphicMapSectorColor(sector: number, isIndoors: boolean) {
  const base = GRAPHIC_MAP_SECTOR_COLORS[sector] ?? GRAPHIC_MAP_DEFAULT_TILE_COLOR
  return isIndoors ? mixGraphicMapColor(base, '#d4d4d8', 0.2) : base
}

function getGraphicMapConnectionColor(firstRoom: GraphicMapRoom, secondRoom: GraphicMapRoom) {
  const firstColor = getGraphicMapSectorColor(firstRoom.s ?? -1, firstRoom.i === 1)
  const secondColor = getGraphicMapSectorColor(secondRoom.s ?? -1, secondRoom.i === 1)
  return mixGraphicMapColor(firstColor, secondColor, 0.5)
}

function mixGraphicMapColor(primary: string, secondary: string, ratio: number) {
  const primaryRgb = hexToRgb(primary)
  const secondaryRgb = hexToRgb(secondary)
  if (!primaryRgb || !secondaryRgb) {
    return primary
  }

  const mix = (from: number, to: number) => Math.round(from * (1 - ratio) + to * ratio)

  return `rgb(${mix(primaryRgb[0], secondaryRgb[0])}, ${mix(primaryRgb[1], secondaryRgb[1])}, ${mix(primaryRgb[2], secondaryRgb[2])})`
}

function hexToRgb(value: string): [number, number, number] | null {
  const normalized = value.trim().replace('#', '')
  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return null
  }

  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number]
}

function getGraphicMapMarkers(specials?: string) {
  if (!specials) {
    return []
  }

  return specials
    .split('')
    .map((special, index) => {
      const marker = GRAPHIC_MAP_MARKER_ICONS[special]
      if (!marker) {
        return null
      }

      return {
        id: `${special}-${index}`,
        icon: marker.icon,
        label: marker.label,
        ...(marker.className ? { className: marker.className } : {}),
      }
    })
    .filter((marker) => marker !== null)
}

function findMatchingMudPresetId(mudPresets: AppSettings['connection']['muds'], host: string, port: number) {
  return mudPresets.find(
    (mud) => mud.host.toLowerCase() === host.trim().toLowerCase() && mud.port === port,
  )?.id
}

function renderMudHtml(value: string) {
  return new AnsiToHtml({ escapeXML: true }).toHtml(convertLuminariColorCodes(value))
}

function convertLuminariColorCodes(value: string) {
  const normalized = value.replace(/\\t/g, KRYNN_COLOR_CHAR)
  let converted = ''

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index]
    if (current !== LUMINARI_COLOR_CHAR && current !== KRYNN_COLOR_CHAR) {
      converted += current
      continue
    }

    const next = normalized[index + 1]
    if (!next) {
      converted += current
      continue
    }

    if (next === current) {
      converted += LUMINARI_COLOR_CHAR
      index += 1
      continue
    }

    if (next === '[') {
      const endIndex = normalized.indexOf(']', index + 2)
      if (endIndex > index + 2) {
        const luminariRgb = normalized.slice(index + 2, endIndex)
        const ansiColor = luminariRgbToAnsi(luminariRgb)
        if (ansiColor) {
          converted += ansiColor
          index = endIndex
          continue
        }
      }
    }

    const luminariColor = LUMINARI_COLOR_CODES[next]
    if (luminariColor !== undefined) {
      converted += luminariColor
      index += 1
      continue
    }

    converted += current
  }

  return converted
}

function luminariRgbToAnsi(code: string) {
  if (!/^[FfBb][0-5]{3}$/.test(code)) {
    return ''
  }

  const isBackground = code[0].toLowerCase() === 'b'
  const [red, green, blue] = code
    .slice(1)
    .split('')
    .map((value) => Number(value) * 51)

  return `\u001b[${isBackground ? 48 : 38};2;${red};${green};${blue}m`
}

function shouldPreservePointerFocus(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, label, a, summary, [data-prevent-command-focus], [contenteditable="true"]',
    ),
  )
}

function shouldIgnoreKeyBindingTarget(target: EventTarget | null, commandInput: HTMLInputElement | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target === commandInput) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'))
}

function hasExpandedSelection() {
  if (typeof window === 'undefined') {
    return false
  }

  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed)
}

function focusCommandInput(input: HTMLInputElement | null) {
  requestAnimationFrame(() => {
    input?.focus({ preventScroll: true })
  })
}

function createAnsiConverter() {
  return new AnsiToHtml({
    escapeXML: true,
    newline: true,
    stream: true,
  })
}

export default App
