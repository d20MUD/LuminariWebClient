import express from 'express'
import net from 'node:net'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { RawData } from 'ws'
import { appSettings } from '../shared/app-settings.ts'
import {
  defaultMsdpVariables,
  isWildernessRoomVnum,
  isMovementCommandInput,
  normalizeMsdpVariableMap,
  starWarsMsdpVariableKeys,
} from '../shared/mud.ts'
import type {
  ClientMessage,
  ConnectionStatus,
  MsdpVariableKey,
  MsdpVariableMap,
  MudState,
  MudValue,
  ServerMessage,
} from '../shared/mud.ts'

const IAC = 255
const DONT = 254
const DO = 253
const WONT = 252
const WILL = 251
const SB = 250
const SE = 240
const TTYPE_IS = 0
const TTYPE_SEND = 1
const TELOPT_ECHO = 1
const TELOPT_SGA = 3
const TELOPT_TTYPE = 24
const TELOPT_NAWS = 31
const TELOPT_CHARSET = 42
const TELOPT_MSDP = 69
const TELOPT_MCCP = 86
const TELOPT_MXP = 91
const MSDP_VAR = 1
const MSDP_VAL = 2
const MSDP_TABLE_OPEN = 3
const MSDP_TABLE_CLOSE = 4
const MSDP_ARRAY_OPEN = 5
const MSDP_ARRAY_CLOSE = 6
const WEB_CLIENT_NAME = 'LuminariWebClient'
const WEB_CLIENT_VERSION = '0.1.0'
const DEFAULT_COLUMNS = 120
const DEFAULT_ROWS = 40
const CONTROL_BYTES = new Set([
  MSDP_VAR,
  MSDP_VAL,
  MSDP_TABLE_OPEN,
  MSDP_TABLE_CLOSE,
  MSDP_ARRAY_OPEN,
  MSDP_ARRAY_CLOSE,
])
const REQUIRED_MSDP_VARIABLES = ['ROOM', 'ROOM_VNUM', 'MINIMAP', 'AUTOMAP', 'GRAPHIC_MAP', 'WILDERNESS_GRAPHIC_MAP']
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDist = path.resolve(__dirname, '../client')

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

// Debug capture: stores the last raw + normalized GRAPHIC_MAP value from any session
let _debugLastRawGraphicMap: MudValue | undefined
let _debugLastNormalizedGraphicMap: unknown

app.get('/api/debug/graphic-map', (_request, response) => {
  response.json({
    raw: _debugLastRawGraphicMap,
    normalized: _debugLastNormalizedGraphicMap,
  })
})

app.get('/api/settings', (_request, response) => {
  response.json(appSettings)
})

app.use(express.static(clientDist))

app.get(/^(?!\/ws).*/, (_request, response) => {
  response.sendFile(path.join(clientDist, 'index.html'))
})

wss.on('connection', (socket) => {
  const session = new MudSession(socket)

  socket.on('message', (data) => {
    const message = parseClientMessage(data)
    if (!message) {
      session.sendStatus('error', 'Received an invalid browser message.')
      return
    }

    if (message.type === 'connect') {
      session.connect(message.host, message.port, normalizeMsdpVariableMap(message.msdpVariables), message.starWarsMode)
      return
    }

    if (message.type === 'disconnect') {
      session.disconnect('Disconnected.')
      return
    }

    if (message.type === 'msdp-config') {
      session.updateMsdpVariables(normalizeMsdpVariableMap(message.msdpVariables), message.starWarsMode)
      return
    }

    session.sendInput(message.text)
  })

  socket.on('close', () => {
    session.disconnect('Disconnected.')
  })
})

const port = Number(process.env.PORT ?? appSettings.ports.server)
server.listen(port, () => {
  console.log(`LuminariWebClient proxy listening on http://localhost:${port}`)
})

class MudSession {
  private mudSocket: net.Socket | null = null
  private parser: TelnetParser | null = null
  private state: MudState = {}
  private msdpInitialized = false
  private msdpVariables: MsdpVariableMap = normalizeMsdpVariableMap(defaultMsdpVariables)
  private starWarsMode = false
  private movementMapRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private initialMsdpRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private readonly browserSocket: WebSocket

  constructor(browserSocket: WebSocket) {
    this.browserSocket = browserSocket
  }

  connect(host: string, port: number, msdpVariables: MsdpVariableMap, starWarsMode: boolean) {
    if (!isValidHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      this.sendStatus('error', 'Provide a valid MUD host and port.')
      return
    }

    this.disconnect('Disconnected.')
    this.state = {}
    this.msdpInitialized = false
    this.msdpVariables = normalizeMsdpVariableMap(msdpVariables)
    this.starWarsMode = starWarsMode
    this.sendStatus('connecting', `Connecting to ${host}:${port}...`)

    const mudSocket = net.createConnection({ host, port })
    this.mudSocket = mudSocket
    this.parser = new TelnetParser(mudSocket, {
      onText: (text) => {
        this.send({ type: 'terminal', text })
      },
      onMsdp: (variable, value) => {
        const partial = mapMsdpUpdate(variable, value, this.msdpVariables)
        const stateUpdate = this.withLocalGraphicMapUpdate(partial)
        if (Object.keys(stateUpdate).length === 0) {
          return
        }

        this.state = { ...this.state, ...stateUpdate }
        this.send({ type: 'state', state: stateUpdate })
      },
      onMsdpReady: () => {
        if (this.msdpInitialized) {
          return
        }

        this.msdpInitialized = true
        this.initializeMsdp()
      },
    })

    mudSocket.setNoDelay(true)

    mudSocket.on('connect', () => {
      this.sendStatus('connected', `Connected to ${host}:${port}.`)
    })

    mudSocket.on('data', (chunk) => {
      this.parser?.push(chunk)
    })

    mudSocket.on('error', (error) => {
      this.sendStatus('error', `Connection error: ${error.message}`)
    })

    mudSocket.on('close', () => {
      this.cleanupSocket()
      this.sendStatus('disconnected', `Connection to ${host}:${port} closed.`)
    })
  }

  updateMsdpVariables(msdpVariables: MsdpVariableMap, starWarsMode: boolean) {
    this.msdpVariables = normalizeMsdpVariableMap(msdpVariables)
    this.starWarsMode = starWarsMode

    if (!this.msdpInitialized) {
      return
    }

    this.applyMsdpConfiguration()
  }

  disconnect(detail: string) {
    if (this.mudSocket) {
      this.mudSocket.destroy()
    }

    this.cleanupSocket()
    this.state = {}
    this.sendStatus('disconnected', detail)
  }

  sendInput(text: string) {
    if (!this.mudSocket || this.mudSocket.destroyed) {
      this.sendStatus('error', 'Connect to a MUD before sending commands.')
      return
    }

    this.mudSocket.write(text.endsWith('\n') ? text : `${text}\n`)

    if (isMovementCommandInput(text)) {
      this.requestMovementMapRefresh()
    }
  }

  sendStatus(status: ConnectionStatus, detail: string) {
    this.send({ type: 'connection-status', status, detail })
  }

  private initializeMsdp() {
    if (!this.mudSocket || this.mudSocket.destroyed) {
      return
    }

    this.sendMsdpPair('CLIENT_ID', WEB_CLIENT_NAME)
    this.sendMsdpPair('CLIENT_VERSION', WEB_CLIENT_VERSION)
    this.sendMsdpPair('ANSI_COLORS', 1)
    this.sendMsdpPair('256_COLORS', 1)
    this.sendMsdpPair('UTF_8', 1)
    this.applyMsdpConfiguration()
    this.scheduleInitialMsdpRefresh()
  }

  private sendMsdpPair(variable: string, value: string | number) {
    if (!this.mudSocket || this.mudSocket.destroyed) {
      return
    }

    const payload = Buffer.concat([
      Buffer.from([IAC, SB, TELOPT_MSDP, MSDP_VAR]),
      Buffer.from(variable, 'utf8'),
      Buffer.from([MSDP_VAL]),
      Buffer.from(String(value), 'utf8'),
      Buffer.from([IAC, SE]),
    ])
    this.mudSocket.write(payload)
  }

  private requestStateRefresh() {
    if (!this.msdpInitialized) {
      return
    }

    for (const variable of getConfiguredMsdpVariables(this.msdpVariables, this.starWarsMode)) {
      this.sendMsdpPair('SEND', variable)
    }
  }

  private requestMovementMapRefresh() {
    if (!this.msdpInitialized) {
      return
    }

    if (this.movementMapRefreshTimer) {
      clearTimeout(this.movementMapRefreshTimer)
    }

    this.movementMapRefreshTimer = setTimeout(() => {
      this.movementMapRefreshTimer = null
      this.sendMapRefreshRequest()
    }, 200)
  }

  private sendMapRefreshRequest() {
    if (!this.msdpInitialized) {
      return
    }

    const mapVariables = new Set([
      this.msdpVariables.graphicMap.trim(),
      this.msdpVariables.wildernessGraphicMap.trim(),
      this.msdpVariables.minimap.trim(),
    ])

    for (const variable of mapVariables) {
      if (!variable) {
        continue
      }

      this.sendMsdpPair('SEND', variable)
    }
  }

  private applyMsdpConfiguration() {
    for (const variable of getConfiguredMsdpVariables(this.msdpVariables, this.starWarsMode)) {
      this.sendMsdpPair('REPORT', variable)
    }

    this.requestStateRefresh()
  }

  private scheduleInitialMsdpRefresh(attemptsRemaining = 2, delayMs = 1200) {
    if (this.initialMsdpRefreshTimer) {
      clearTimeout(this.initialMsdpRefreshTimer)
    }

    this.initialMsdpRefreshTimer = setTimeout(() => {
      this.initialMsdpRefreshTimer = null

      if (!this.msdpInitialized || !this.mudSocket || this.mudSocket.destroyed) {
        return
      }

      // A character can finish account/character selection after the first
      // report cycle. Re-requesting twice makes the initial HUD reliable
      // without keeping a polling loop running for the whole session.
      this.applyMsdpConfiguration()

      if (attemptsRemaining > 1) {
        this.scheduleInitialMsdpRefresh(attemptsRemaining - 1, 3500)
      }
    }, delayMs)
  }

  private cleanupSocket() {
    if (this.movementMapRefreshTimer) {
      clearTimeout(this.movementMapRefreshTimer)
      this.movementMapRefreshTimer = null
    }

    if (this.initialMsdpRefreshTimer) {
      clearTimeout(this.initialMsdpRefreshTimer)
      this.initialMsdpRefreshTimer = null
    }

    this.parser = null
    this.mudSocket = null
    this.msdpInitialized = false
  }

  private withLocalGraphicMapUpdate(partial: Partial<MudState>) {
    if (partial.roomVnum === undefined) {
      return partial
    }

    const nextPartial = { ...partial }
    const hasGraphicMapUpdate = Object.prototype.hasOwnProperty.call(partial, 'graphicMap')
    const hasWildernessGraphicMapUpdate = Object.prototype.hasOwnProperty.call(partial, 'wildernessGraphicMap')

    if (!isWildernessRoomVnum(partial.roomVnum) && !hasGraphicMapUpdate && this.state.graphicMap) {
      const graphicMap = recenterGraphicMapData(this.state.graphicMap, partial.roomVnum)
      if (graphicMap) {
        nextPartial.graphicMap = graphicMap
      }
    }

    if (
      isWildernessRoomVnum(partial.roomVnum) &&
      !hasWildernessGraphicMapUpdate &&
      this.state.wildernessGraphicMap
    ) {
      const wildernessGraphicMap = recenterGraphicMapData(this.state.wildernessGraphicMap, partial.roomVnum)
      if (wildernessGraphicMap) {
        nextPartial.wildernessGraphicMap = wildernessGraphicMap
      }
    }

    return nextPartial
  }

  private send(message: ServerMessage) {
    if (this.browserSocket.readyState !== WebSocket.OPEN) {
      return
    }

    this.browserSocket.send(JSON.stringify(message))
  }
}

type TelnetParserCallbacks = {
  onText: (text: string) => void
  onMsdp: (variable: string, value: MudValue) => void
  onMsdpReady: () => void
}

type ParserState = 'data' | 'iac' | 'iac-command' | 'sb-option' | 'sb-data' | 'sb-iac'

class TelnetParser {
  private state: ParserState = 'data'
  private readonly decoder = new StringDecoder('utf8')
  private readonly textBuffer: number[] = []
  private readonly sbBuffer: number[] = []
  private pendingCommand = 0
  private currentSbOption = 0
  private readonly socket: net.Socket
  private readonly callbacks: TelnetParserCallbacks

  constructor(socket: net.Socket, callbacks: TelnetParserCallbacks) {
    this.socket = socket
    this.callbacks = callbacks
  }

  push(chunk: Buffer) {
    for (const byte of chunk) {
      this.consume(byte)
    }

    this.flushText()
  }

  private consume(byte: number) {
    if (this.state === 'data') {
      if (byte === IAC) {
        this.flushText()
        this.state = 'iac'
        return
      }

      this.textBuffer.push(byte)
      return
    }

    if (this.state === 'iac') {
      if (byte === IAC) {
        this.textBuffer.push(IAC)
        this.state = 'data'
        return
      }

      if (byte === WILL || byte === WONT || byte === DO || byte === DONT) {
        this.pendingCommand = byte
        this.state = 'iac-command'
        return
      }

      if (byte === SB) {
        this.state = 'sb-option'
        return
      }

      this.state = 'data'
      return
    }

    if (this.state === 'iac-command') {
      this.handleNegotiation(this.pendingCommand, byte)
      this.state = 'data'
      return
    }

    if (this.state === 'sb-option') {
      this.currentSbOption = byte
      this.sbBuffer.length = 0
      this.state = 'sb-data'
      return
    }

    if (this.state === 'sb-data') {
      if (byte === IAC) {
        this.state = 'sb-iac'
        return
      }

      this.sbBuffer.push(byte)
      return
    }

    if (byte === SE) {
      this.handleSubnegotiation(this.currentSbOption, Buffer.from(this.sbBuffer))
      this.sbBuffer.length = 0
      this.state = 'data'
      return
    }

    if (byte === IAC) {
      this.sbBuffer.push(IAC)
    }

    this.state = 'sb-data'
  }

  private flushText() {
    if (this.textBuffer.length === 0) {
      return
    }

    const text = this.decoder.write(Buffer.from(this.textBuffer))
    this.textBuffer.length = 0

    if (text) {
      this.callbacks.onText(text)
    }
  }

  private handleNegotiation(command: number, option: number) {
    if (command === WILL) {
      if (option === TELOPT_MSDP) {
        this.sendNegotiation(DO, option)
        this.callbacks.onMsdpReady()
        return
      }

      if (option === TELOPT_ECHO || option === TELOPT_SGA) {
        this.sendNegotiation(DO, option)
        return
      }

      if (option === TELOPT_MCCP) {
        this.sendNegotiation(DONT, option)
        return
      }

      this.sendNegotiation(DONT, option)
      return
    }

    if (command === DO) {
      if (option === TELOPT_TTYPE) {
        this.sendNegotiation(WILL, option)
        return
      }

      if (option === TELOPT_NAWS) {
        this.sendNegotiation(WILL, option)
        this.sendNaws(DEFAULT_COLUMNS, DEFAULT_ROWS)
        return
      }

      if (option === TELOPT_CHARSET || option === TELOPT_MXP) {
        this.sendNegotiation(WONT, option)
        return
      }

      this.sendNegotiation(WONT, option)
    }
  }

  private handleSubnegotiation(option: number, payload: Buffer) {
    if (option === TELOPT_MSDP) {
      for (const [variable, value] of parseMsdpPayload(payload)) {
        this.callbacks.onMsdp(variable, value)
      }
      return
    }

    if (option === TELOPT_TTYPE && payload[0] === TTYPE_SEND) {
      this.socket.write(
        Buffer.concat([
          Buffer.from([IAC, SB, TELOPT_TTYPE, TTYPE_IS]),
          Buffer.from(WEB_CLIENT_NAME, 'utf8'),
          Buffer.from([IAC, SE]),
        ]),
      )
    }
  }

  private sendNegotiation(command: number, option: number) {
    this.socket.write(Buffer.from([IAC, command, option]))
  }

  private sendNaws(columns: number, rows: number) {
    const width = Buffer.from([columns >> 8, columns & 0xff])
    const height = Buffer.from([rows >> 8, rows & 0xff])
    this.socket.write(Buffer.concat([Buffer.from([IAC, SB, TELOPT_NAWS]), width, height, Buffer.from([IAC, SE])]))
  }
}

function parseClientMessage(data: RawData): ClientMessage | null {
  const text = dataToString(data)
  if (!text) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const message = parsed as Record<string, unknown>

    if (message.type === 'connect' && typeof message.host === 'string' && typeof message.port === 'number') {
      return {
        type: 'connect',
        host: message.host,
        port: message.port,
        msdpVariables: normalizeMsdpVariableMap(message.msdpVariables),
        starWarsMode: message.starWarsMode === true,
      }
    }

    if (message.type === 'disconnect') {
      return { type: 'disconnect' }
    }

    if (message.type === 'input' && typeof message.text === 'string') {
      return { type: 'input', text: message.text }
    }

    if (message.type === 'msdp-config') {
      return {
        type: 'msdp-config',
        msdpVariables: normalizeMsdpVariableMap(message.msdpVariables),
        starWarsMode: message.starWarsMode === true,
      }
    }

    return null
  } catch {
    return null
  }
}

function dataToString(data: RawData) {
  if (typeof data === 'string') {
    return data
  }

  if (data instanceof Buffer) {
    return data.toString('utf8')
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }

  return ''
}

function isValidHost(host: string) {
  return /^[a-z0-9.-]+$/i.test(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
}

function parseMsdpPayload(payload: Buffer): Array<[string, MudValue]> {
  const pairs: Array<[string, MudValue]> = []
  let index = 0

  while (index < payload.length) {
    if (payload[index] !== MSDP_VAR) {
      index += 1
      continue
    }

    index += 1
    const [variable, nextIndex] = readScalar(payload, index)
    index = nextIndex

    if (payload[index] !== MSDP_VAL) {
      continue
    }

    index += 1
    const [value, afterValue] = readValue(payload, index)
    index = afterValue

    if (variable) {
      pairs.push([variable, value])
    }
  }

  return pairs
}

function readValue(payload: Buffer, index: number): [MudValue, number] {
  const marker = payload[index]

  if (marker === MSDP_ARRAY_OPEN) {
    const items: MudValue[] = []
    let cursor = index + 1

    while (cursor < payload.length && payload[cursor] !== MSDP_ARRAY_CLOSE) {
      if (payload[cursor] === MSDP_ARRAY_OPEN || payload[cursor] === MSDP_TABLE_OPEN) {
        const [value, nextCursor] = readValue(payload, cursor)
        items.push(value)
        cursor = nextCursor
        continue
      }

      if (payload[cursor] === MSDP_VAL) {
        cursor += 1
        const [value, nextCursor] = readValue(payload, cursor)
        items.push(value)
        cursor = nextCursor
        continue
      }

      if (CONTROL_BYTES.has(payload[cursor])) {
        cursor += 1
        continue
      }

      const [value, nextCursor] = readScalar(payload, cursor)
      if (value !== '') {
        items.push(normalizeScalar(value))
      }
      cursor = nextCursor
    }

    return [items, cursor + 1]
  }

  if (marker === MSDP_TABLE_OPEN) {
    const table: Record<string, MudValue> = {}
    let cursor = index + 1

    while (cursor < payload.length && payload[cursor] !== MSDP_TABLE_CLOSE) {
      if (payload[cursor] !== MSDP_VAR) {
        cursor += 1
        continue
      }

      cursor += 1
      const [key, nextCursor] = readScalar(payload, cursor)
      cursor = nextCursor

      if (payload[cursor] !== MSDP_VAL) {
        continue
      }

      cursor += 1
      const [value, afterValue] = readValue(payload, cursor)
      cursor = afterValue

      if (key) {
        table[key] = value
      }
    }

    return [table, cursor + 1]
  }

  const [value, nextIndex] = readScalar(payload, index)
  return [normalizeScalar(value), nextIndex]
}

function readScalar(payload: Buffer, index: number): [string, number] {
  const bytes: number[] = []
  let cursor = index

  while (cursor < payload.length && !CONTROL_BYTES.has(payload[cursor])) {
    bytes.push(payload[cursor])
    cursor += 1
  }

  return [Buffer.from(bytes).toString('utf8'), cursor]
}

function normalizeScalar(value: string): MudValue {
  if (/^-?\d+$/.test(value)) {
    return Number(value)
  }

  return value
}

function getConfiguredMsdpVariables(msdpVariables: MsdpVariableMap, starWarsMode: boolean) {
  const variables = new Set(
    Object.entries(msdpVariables)
      .filter(([key]) => starWarsMode || !starWarsMsdpVariableKeys.includes(key as (typeof starWarsMsdpVariableKeys)[number]))
      .map(([, value]) => value.trim())
      .filter(Boolean),
  )
  const graphicMapVariables = [msdpVariables.graphicMap.trim(), msdpVariables.wildernessGraphicMap.trim()]

  for (const graphicMapVariable of graphicMapVariables) {
    if (!graphicMapVariable) {
      continue
    }

    variables.add(graphicMapVariable.toUpperCase())
    variables.add(graphicMapVariable.toLowerCase())
  }

  for (const variable of REQUIRED_MSDP_VARIABLES) {
    variables.add(variable)
  }

  return [...variables]
}

function resolveMsdpVariableKey(variable: string, msdpVariables: MsdpVariableMap): MsdpVariableKey | null {
  const normalizedVariable = variable.trim().toUpperCase()

  for (const [key, configuredVariable] of Object.entries(msdpVariables)) {
    if (configuredVariable.trim().toUpperCase() === normalizedVariable) {
      return key as MsdpVariableKey
    }
  }

  return null
}

function mapMsdpUpdate(variable: string, value: MudValue, msdpVariables: MsdpVariableMap): Partial<MudState> {
  const normalizedVariable = variable.trim().toUpperCase()

  if (normalizedVariable === 'ROOM') {
    return mapRoomMsdpUpdate(value)
  }

  if (normalizedVariable === 'ROOM_VNUM') {
    return { roomVnum: toOptionalNumber(value) }
  }

  const key = resolveMsdpVariableKey(variable, msdpVariables)
  if (!key) {
    return {}
  }

  const partial: Partial<MudState> = {}

  switch (key) {
    case 'characterName':
      partial.characterName = toOptionalString(value)
      break
    case 'title':
      partial.title = toOptionalString(value)
      break
    case 'level':
      partial.level = toOptionalNumber(value)
      break
    case 'race':
      partial.race = toOptionalString(value)
      break
    case 'className':
      partial.className = toOptionalString(value)
      break
    case 'health':
      partial.health = toOptionalNumber(value)
      break
    case 'healthMax':
      partial.healthMax = toOptionalNumber(value)
      break
    case 'psp':
      partial.psp = toOptionalNumber(value)
      break
    case 'pspMax':
      partial.pspMax = toOptionalNumber(value)
      break
    case 'movement':
      partial.movement = toOptionalNumber(value)
      break
    case 'movementMax':
      partial.movementMax = toOptionalNumber(value)
      break
    case 'experience':
      partial.experience = toOptionalNumber(value)
      break
    case 'experienceMax':
      partial.experienceMax = toOptionalNumber(value)
      break
    case 'experienceTnl':
      partial.experienceTnl = toOptionalNumber(value)
      break
    case 'strength':
      partial.strength = toOptionalNumber(value)
      break
    case 'dexterity':
      partial.dexterity = toOptionalNumber(value)
      break
    case 'constitution':
      partial.constitution = toOptionalNumber(value)
      break
    case 'intelligence':
      partial.intelligence = toOptionalNumber(value)
      break
    case 'wisdom':
      partial.wisdom = toOptionalNumber(value)
      break
    case 'charisma':
      partial.charisma = toOptionalNumber(value)
      break
    case 'fortitude':
      partial.fortitude = toOptionalNumber(value)
      break
    case 'reflex':
      partial.reflex = toOptionalNumber(value)
      break
    case 'willpower':
      partial.willpower = toOptionalNumber(value)
      break
    case 'attackBonus':
      partial.attackBonus = toOptionalNumber(value)
      break
    case 'armorClass':
      partial.armorClass = toOptionalNumber(value)
      break
    case 'alignment':
      partial.alignment = toOptionalString(value)
      break
    case 'money':
      partial.money = toOptionalNumber(value)
      break
    case 'bank':
      partial.bank = toOptionalNumber(value)
      break
    case 'position':
      partial.position = toOptionalString(value)
      break
    case 'minimap':
      partial.minimap = toOptionalString(value)
      break
    case 'graphicMap':
      partial.graphicMap = toGraphicMapData(value)
      break
    case 'wildernessGraphicMap':
      partial.wildernessGraphicMap = toGraphicMapData(value)
      break
    case 'affects':
      partial.affects = value
      break
    case 'cooldowns':
      partial.cooldowns = value
      break
    case 'group':
      partial.group = value
      break
    case 'questInfo':
      partial.questInfo = value
      break
    case 'opponentName':
      partial.opponentName = toOptionalString(value)
      break
    case 'opponentHealth':
      partial.opponentHealth = toOptionalNumber(value)
      break
    case 'opponentHealthMax':
      partial.opponentHealthMax = toOptionalNumber(value)
      break
    case 'tankName':
      partial.tankName = toOptionalString(value)
      break
    case 'tankHealth':
      partial.tankHealth = toOptionalNumber(value)
      break
    case 'tankHealthMax':
      partial.tankHealthMax = toOptionalNumber(value)
      break
    case 'bacta':
      partial.bacta = toOptionalNumber(value)
      break
    case 'powerCells':
      partial.powerCells = toOptionalNumber(value)
      break
    default:
      break
  }

  return partial
}

function mapRoomMsdpUpdate(value: MudValue): Partial<MudState> {
  const partial: Partial<MudState> = { room: value }
  const roomRecord = toMudRecord(value)

  if (!roomRecord) {
    return partial
  }

  const exitsRecord = toMudRecord(getMudRecordValue(roomRecord, 'EXITS'))
  const coordsRecord = toMudRecord(getMudRecordValue(roomRecord, 'COORDS'))

  partial.roomVnum = toOptionalNumber(getMudRecordValue(roomRecord, 'VNUM'))
  partial.roomName = toOptionalString(getMudRecordValue(roomRecord, 'NAME'))
  partial.areaName = toOptionalString(getMudRecordValue(roomRecord, 'AREA'))
  partial.roomEnvironment = toOptionalString(getMudRecordValue(roomRecord, 'ENVIRONMENT'))
  partial.roomTerrain = toOptionalString(getMudRecordValue(roomRecord, 'TERRAIN'))
  partial.roomExits = exitsRecord ? Object.keys(exitsRecord) : []

  if (coordsRecord) {
    partial.roomCoords = {
      x: toOptionalNumber(getMudRecordValue(coordsRecord, 'X')),
      y: toOptionalNumber(getMudRecordValue(coordsRecord, 'Y')),
      z: toOptionalNumber(getMudRecordValue(coordsRecord, 'Z')),
    }
  }

  return partial
}

function toMudRecord(value: MudValue | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, MudValue>
}

function getMudRecordValue(record: Record<string, MudValue>, key: string) {
  const normalizedKey = key.trim().toUpperCase()

  for (const [entryKey, entryValue] of Object.entries(record)) {
    if (entryKey.trim().toUpperCase() === normalizedKey) {
      return entryValue
    }
  }

  return undefined
}

function toOptionalNumber(value: MudValue | undefined) {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value)
  }

  return undefined
}

function toOptionalString(value: MudValue | undefined) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return undefined
}

function toGraphicMapData(value: MudValue) {
  _debugLastRawGraphicMap = value
  if (typeof value === 'string') {
    const parsed = parseGraphicMapString(value)
    const result = parsed ? normalizeGraphicMapData(parsed) : undefined
    if (result) {
      const cCount = result.rooms?.filter(r => r.c !== undefined).length ?? 0
      process.stderr.write(`[GRAPHIC_MAP] ver=${result.ver} rooms=${result.rooms?.length} cFields=${cCount} (from string)\n`)
    }
    _debugLastNormalizedGraphicMap = result
    return result
  }

  const result = normalizeGraphicMapData(value)
  if (result) {
    const cCount = result.rooms?.filter(r => r.c !== undefined).length ?? 0
    process.stderr.write(`[GRAPHIC_MAP] ver=${result.ver} rooms=${result.rooms?.length} cFields=${cCount} (from object)\n`)
  }
  _debugLastNormalizedGraphicMap = result
  return result
}

function normalizeGraphicMapData(value: MudValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, MudValue>
  const roomsCandidate = getMudRecordValue(record, 'rooms')
  const roomsValue = Array.isArray(roomsCandidate) ? roomsCandidate : []

  return {
    ver: toOptionalNumber(getMudRecordValue(record, 'ver')),
    radius: toOptionalNumber(getMudRecordValue(record, 'radius')),
    rooms: roomsValue
      .filter((room): room is Record<string, MudValue> => Boolean(room) && typeof room === 'object' && !Array.isArray(room))
      .map((room) => ({
        x: toOptionalNumber(getMudRecordValue(room, 'x')),
        y: toOptionalNumber(getMudRecordValue(room, 'y')),
        v: toOptionalNumber(getMudRecordValue(room, 'v')),
        s: toOptionalNumber(getMudRecordValue(room, 's')),
        i: toOptionalNumber(getMudRecordValue(room, 'i')),
        sp: toOptionalString(getMudRecordValue(room, 'sp')),
        c: toOptionalNumber(getMudRecordValue(room, 'c')),
      })),
  }
}

function recenterGraphicMapData(graphicMap: MudState['graphicMap'], roomVnum: number) {
  if (!graphicMap?.rooms?.length) {
    return null
  }

  const currentRoom = graphicMap.rooms.find(
    (room) =>
      room.v === roomVnum &&
      typeof room.x === 'number' &&
      Number.isFinite(room.x) &&
      typeof room.y === 'number' &&
      Number.isFinite(room.y),
  )

  if (!currentRoom || currentRoom.x === 0 && currentRoom.y === 0) {
    return null
  }

  const offsetX = Number(currentRoom.x)
  const offsetY = Number(currentRoom.y)

  return {
    ...graphicMap,
    rooms: graphicMap.rooms.map((room) => {
      if (
        typeof room.x !== 'number' ||
        !Number.isFinite(room.x) ||
        typeof room.y !== 'number' ||
        !Number.isFinite(room.y)
      ) {
        return { ...room }
      }

      return {
        ...room,
        x: room.x - offsetX,
        y: room.y - offsetY,
      }
    }),
  }
}

function parseGraphicMapString(value: string): MudValue | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as MudValue
    } catch {
      return null
    }
  }

  const payload = decodeGraphicMapTokenString(trimmed)
  if (!payload || payload.length === 0) {
    return null
  }

  const [parsed] = readValue(payload, 0)
  return parsed
}

function decodeGraphicMapTokenString(value: string) {
  const tokenPattern = /<(TABLE_OPEN|TABLE_CLOSE|ARRAY_OPEN|ARRAY_CLOSE|VAR|VAL)>/g
  const tokenBytes: Record<string, number> = {
    TABLE_OPEN: MSDP_TABLE_OPEN,
    TABLE_CLOSE: MSDP_TABLE_CLOSE,
    ARRAY_OPEN: MSDP_ARRAY_OPEN,
    ARRAY_CLOSE: MSDP_ARRAY_CLOSE,
    VAR: MSDP_VAR,
    VAL: MSDP_VAL,
  }
  const bytes: number[] = []
  let lastIndex = 0

  for (const match of value.matchAll(tokenPattern)) {
    const tokenIndex = match.index ?? 0
    const literal = value.slice(lastIndex, tokenIndex)
    if (literal) {
      bytes.push(...Buffer.from(literal, 'utf8'))
    }

    const tokenName = match[1]
    const tokenByte = tokenBytes[tokenName]
    if (tokenByte !== undefined) {
      bytes.push(tokenByte)
    }

    lastIndex = tokenIndex + match[0].length
  }

  const remainder = value.slice(lastIndex)
  if (remainder) {
    bytes.push(...Buffer.from(remainder, 'utf8'))
  }

  return bytes.length > 0 ? Buffer.from(bytes) : null
}
