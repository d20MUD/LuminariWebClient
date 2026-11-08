import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the session without starting a listener or connecting to a live MUD.
const source = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
const sessionSource = source.slice(source.indexOf('class MudSession'), source.indexOf('class TelnetParser'))
const helpers = source.slice(source.indexOf('function isValidAutoLoginValue'), source.indexOf('function parseClientMessage'))
function fixture() {
  const sockets = []
  const context = vm.createContext({
    WebSocket: { OPEN: 1 },
    defaultMsdpVariables: {},
    normalizeMsdpVariableMap: (value) => value,
    isValidHost: () => true,
    MUD_TCP_KEEPALIVE_INITIAL_DELAY_MS: 30_000,
    ANSI_ESCAPE_PATTERN: /\x1b\[[0-?]*[ -/]*[@-~]/g,
    TelnetParser: class {},
    net: { createConnection() {
      const socket = new EventEmitter()
      Object.assign(socket, {
        destroyed: false, writes: [],
        setNoDelay() {}, setKeepAlive() {},
        destroy() { this.destroyed = true },
        write(text) { this.writes.push(text) },
      })
      sockets.push(socket)
      return socket
    } },
  })
  vm.runInContext(ts.transpile(`${sessionSource}\n${helpers}\nglobalThis.Session = MudSession`, { target: ts.ScriptTarget.ES2022 }), context)
  const messages = []
  const session = new context.Session({ readyState: 1, send: (message) => messages.push(JSON.parse(message)) })
  session.connect('krynn.d20mud.com', 4300, {}, false)
  return { session, sockets, messages }
}

test('Krynn prompt and split output advance through saved character login', () => {
  const { session, sockets } = fixture()
  session.startAutoLogin('SavedAccount', 'test-password', 'SavedCharacter')
  for (const chunk of ['\x1b[31mWhat is your account ', 'name, adventurer?\x1b[0m', 'Pass', 'word: ', '  2  | Saved', 'Character    | 20 | Human\r\n', 'Press enter to continue']) {
    session.processAutoLoginText(chunk)
  }
  assert.deepEqual(sockets[0].writes, ['SavedAccount\n', 'test-password\n', '2\n', '\n'])
})

test('closing an old socket leaves the replacement session and auto-login intact', () => {
  const { session, sockets, messages } = fixture()
  session.connect('krynn.d20mud.com', 4300, {}, false)
  session.startAutoLogin('SavedAccount', 'test-password', 'SavedCharacter')
  const messageCount = messages.length
  sockets[0].emit('close')
  assert.equal(session.mudSocket, sockets[1])
  assert.equal(messages.length, messageCount)
  session.processAutoLoginText('What is your account name, adventurer?')
  assert.deepEqual(sockets[1].writes, ['SavedAccount\n'])
  sockets[1].emit('close')
  assert.equal(session.mudSocket, null)
  assert.equal(messages.at(-1).status, 'disconnected')
})
