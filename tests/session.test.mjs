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
function fixture(host = 'krynn.d20mud.com') {
  const sockets = []
  const context = vm.createContext({
    WebSocket: { OPEN: 1 },
    appSettings: { connection: { muds: [{ host: 'krynn.d20mud.com', features: { helpModal: true } }] } },
    defaultMsdpVariables: {},
    normalizeMsdpVariableMap: (value) => value,
    isValidHost: () => true,
    MUD_TCP_KEEPALIVE_INITIAL_DELAY_MS: 30_000,
    ANSI_ESCAPE_PATTERN: /\x1b\[[0-?]*[ -/]*[@-~]/g,
    IAC: 255, SB: 250, SE: 240, TELOPT_MSDP: 69, MSDP_VAR: 1, MSDP_VAL: 2,
    WEB_CLIENT_NAME: 'LuminariWebClient', WEB_CLIENT_VERSION: 'test', Buffer,
    getConfiguredMsdpVariables: (values) => Object.values(values),
    setTimeout: () => 1, clearTimeout() {},
    TelnetParser: class { constructor(_socket, callbacks) { this.callbacks = callbacks } },
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
  session.connect(host, 4300, {}, false)
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

const characterMenu = `  ** Chronicles of Krynn Character Menu **
0) Return to the Account Menu.
1) Enter the game.
2) Enter character options.
3) Read the background story.
4) Change password.
5) Delete this character.
   Make your choice: `

function selectSavedCharacter(session) {
  session.startAutoLogin('SavedAccount', 'test-password', 'SavedCharacter')
  for (const text of ['What is your account name, adventurer?', 'Password: ', ' 2 | SavedCharacter | 20 | Human\r\n']) session.processAutoLoginText(text)
}

test('Krynn full login enters the game once after split MOTD and character menu', () => {
  const { session, sockets } = fixture()
  selectSavedCharacter(session)
  session.processAutoLoginText('Character loaded. Press enter to continue.\r\n')
  session.processAutoLoginText('Message of the day\r\n *** PRESS RETURN ***')
  session.processAutoLoginText('\x1b[33m' + characterMenu.slice(0, 28))
  session.processAutoLoginText(characterMenu.slice(28, -4))
  assert.deepEqual(sockets[0].writes, ['SavedAccount\n', 'test-password\n', '2\n', '\n'])
  session.processAutoLoginText(characterMenu.slice(-4) + '\x1b[0m')
  assert.deepEqual(sockets[0].writes, ['SavedAccount\n', 'test-password\n', '2\n', '\n', '1\n'])
  session.processAutoLoginText(characterMenu)
  assert.equal(sockets[0].writes.length, 5)
  assert.equal(session.autoLogin, null)
})

test('Krynn standalone MOTD Return prompt is handled', () => {
  const { session, sockets } = fixture()
  selectSavedCharacter(session)
  for (const text of ['Message of the day\r\n*** PRESS RET', 'URN ***', characterMenu]) session.processAutoLoginText(text)
  assert.deepEqual(sockets[0].writes.slice(3), ['\n', '1\n'])
})

test('Krynn reconnect never sends a menu choice into the game', () => {
  const { session, sockets } = fixture()
  selectSavedCharacter(session)
  session.processAutoLoginText('Character loaded. Press enter to continue.\r\nReconnecting.\r\n')
  session.processAutoLoginText(characterMenu)
  assert.equal(sockets[0].writes.length, 3)
  assert.equal(session.autoLogin, null)
})

test('unrelated menus do not trigger Enter the game', () => {
  const { session, sockets } = fixture()
  selectSavedCharacter(session)
  session.processAutoLoginText('1) Enter the game.\r\nMake your choice: ')
  assert.equal(sockets[0].writes.length, 3)
})

test('Faerun keeps its existing continuation behavior without Krynn menu handling', () => {
  const { session, sockets } = fixture('faerun.d20mud.com')
  selectSavedCharacter(session)
  session.processAutoLoginText('Press enter to continue')
  session.processAutoLoginText(characterMenu)
  session.processAutoLoginText('Press enter to continue')
  assert.deepEqual(sockets[0].writes.slice(3), ['\n', '\n'])
  assert.equal(session.autoLogin, null)
})


test('Krynn menu and ANSI escape sequences can arrive one byte at a time', () => {
  const { session, sockets } = fixture()
  selectSavedCharacter(session)
  for (const byte of '\x1b[33m' + characterMenu + '\x1b[0m') session.processAutoLoginText(byte)
  assert.deepEqual(sockets[0].writes.slice(3), ['1\n'])
})

test('Krynn reconnect after a continuation still stops menu automation', () => {
  const { session, sockets } = fixture()
  selectSavedCharacter(session)
  session.processAutoLoginText('Character loaded. Press enter to continue.\r\n')
  session.processAutoLoginText('Reconnec')
  session.processAutoLoginText('ting to unswitched char.\r\n')
  session.processAutoLoginText(characterMenu)
  assert.deepEqual(sockets[0].writes.slice(3), ['\n'])
})


test('Krynn copyover renegotiation restores quest REPORT and SEND subscriptions', () => {
  const { session, sockets } = fixture()
  session.updateMsdpVariables({ questInfo: 'QUEST_INFO' }, false)
  session.parser.callbacks.onMsdpReady()
  const packets = () => sockets[0].writes.filter((value) => Buffer.isBuffer(value)).map((value) => value.toString('utf8'))
  assert.equal(packets().filter((value) => value.includes('REPORT\x02QUEST_INFO')).length, 1)
  assert.equal(packets().filter((value) => value.includes('SEND\x02QUEST_INFO')).length, 1)
  session.parser.callbacks.onMsdpReady()
  assert.equal(packets().filter((value) => value.includes('REPORT\x02QUEST_INFO')).length, 2)
  assert.equal(packets().filter((value) => value.includes('SEND\x02QUEST_INFO')).length, 2)
})
