import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the session without starting a listener or connecting to a live MUD.
const source = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
const sessionSource = source.slice(source.indexOf('class MudSession'), source.indexOf('class TelnetParser'))
const helpers = source.slice(source.indexOf('function isValidAutoLoginValue'), source.indexOf('function parseClientMessage')) + source.slice(source.indexOf('function minimumNonNegative'), source.indexOf('function isValidHost'))
function fixture(host = 'krynn.d20mud.com') {
  const sockets = []
  const timers = []
  const context = vm.createContext({
    WebSocket: { OPEN: 1 },
    appSettings: { connection: { muds: [{ host: 'krynn.d20mud.com', features: { helpModal: true } }] } },
    defaultMsdpVariables: {},
    mapMsdpUpdate: () => ({}),
    normalizeMsdpVariableMap: (value) => value,
    isValidHost: () => true,
    isMovementCommandInput: () => false,
    MUD_TCP_KEEPALIVE_INITIAL_DELAY_MS: 30_000,
    ANSI_ESCAPE_PATTERN: /\x1b\[[0-?]*[ -/]*[@-~]/g,
    IAC: 255, SB: 250, SE: 240, TELOPT_MSDP: 69, MSDP_VAR: 1, MSDP_VAL: 2,
    WEB_CLIENT_NAME: 'LuminariWebClient', WEB_CLIENT_VERSION: 'test', Buffer,
    getConfiguredMsdpVariables: (values) => Object.values(values),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length }, clearTimeout() {},
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
  return { session, sockets, messages, timers }
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

test('Krynn create flow signs into an account and selects C only at its menu', () => {
  const { session, sockets, timers } = fixture()
  session.startCharacterCreation('ExistingAccount', 'test-password')
  session.processAutoLoginText('What is your account name, adventurer?')
  session.processAutoLoginText('Password: ')
  session.processAutoLoginText('Account characters\r\n(C)create a new character | (A)add a character | (Q)quit\r\nYour cho')
  assert.deepEqual(sockets[0].writes, ['ExistingAccount\n', 'test-password\n'])
  session.processAutoLoginText('ice : ')
  assert.equal(sockets[0].writes.at(-1).includes(Buffer.from('CHARACTER_CREATION')), true)
  timers.find((timer) => timer.delay === 150).callback()
  assert.deepEqual(sockets[0].writes.filter((write) => typeof write === 'string'), ['ExistingAccount\n', 'test-password\n', 'c\n'])
  assert.equal(session.autoLogin, null)
  session.processAutoLoginText('Did I get that right, Newname (Y/N)?')
  assert.equal(sockets[0].writes.filter((write) => typeof write === 'string').length, 3)
})

test('creation never confirms a nonexistent account or operates on another MUD', () => {
  const { session, sockets } = fixture()
  session.startCharacterCreation('MissingAccount', 'test-password')
  session.processAutoLoginText('What is your account name, adventurer?')
  session.processAutoLoginText('Did I get that right, MissingAccount (Y/N)? ')
  assert.deepEqual(sockets[0].writes, ['MissingAccount\n', 'N\n'])
  assert.equal(session.autoLogin, null)
  const other = fixture('faerun.d20mud.com')
  other.session.startCharacterCreation('ExistingAccount', 'test-password')
  assert.equal(other.session.autoLogin, null)
  assert.match(other.messages.at(-1).detail, /only for Krynn/)
})


test('actual colored Krynn account menu starts creation when received byte by byte', () => {
  const { session, sockets, timers } = fixture()
  session.startCharacterCreation('ExistingAccount', 'test-password')
  session.processAutoLoginText('What is your account name, adventurer?')
  session.processAutoLoginText('Password: ')
  // Match the real show_account_menu output: the shortcut supplies the C/A/Q.
  const menu = '\tC--------------------------------\tn\r\n'
    + '  # | Name | Lvl | Race | Class\r\n  2 | Someone | 10 | Human | War\r\n'
    + '\tcType the # of a character listed above or choose one of the following:\r\n'
    + ' \tn(\tCC\tn)\tcreate a new character \tC| \tn(\tCA\tn)\tcdd a character \tC| \tn(\tCQ\tn)\tcuit\tn\r\n'
    + '\tcYour choice :\tn '
  for (const character of menu) session.processAutoLoginText(character)
  assert.equal(timers.filter((timer) => timer.delay === 150).length, 1)
  assert.equal(sockets[0].writes.at(-1).includes(Buffer.from('CHARACTER_CREATION')), true)
  timers.find((timer) => timer.delay === 150).callback()
  assert.deepEqual(sockets[0].writes.filter((write) => typeof write === 'string'), ['ExistingAccount\n', 'test-password\n', 'c\n'])
  assert.equal(session.autoLogin, null)
})

test('account-menu handoff requires the prompt and cancels after manual takeover', () => {
  const { session, sockets, timers } = fixture()
  session.startCharacterCreation('ExistingAccount', 'test-password')
  session.processAutoLoginText('What is your account name, adventurer?')
  session.processAutoLoginText('Password: ')
  session.processAutoLoginText('(C)reate a new character')
  assert.equal(timers.filter((timer) => timer.delay === 150).length, 0)
  session.processAutoLoginText('\nYour choice : ')
  const timer = timers.find((timer) => timer.delay === 150)
  assert.ok(timer)
  session.sendInput('q')
  timer.callback()
  assert.deepEqual(sockets[0].writes.filter((write) => typeof write === 'string'), ['ExistingAccount\n', 'test-password\n', 'q\n'])
})


test('on-demand result commands renew reports before sending the game command', () => {
  const { session, sockets } = fixture()
  session.msdpInitialized = true
  for (const [command, variable] of [['score', 'SCORE_INFO'], ['who', 'WHO_INFO'], ['lore guard', 'LORE_INFO']]) {
    sockets[0].writes = []
    session.sendInput(command)
    assert.equal(sockets[0].writes.length, 2)
    assert.deepEqual(sockets[0].writes[0], Buffer.concat([Buffer.from([255, 250, 69, 1]), Buffer.from('REPORT'), Buffer.from([2]), Buffer.from(variable), Buffer.from([255, 240])]))
    assert.equal(sockets[0].writes[1], `${command}\n`)
  }
})


test('Krynn uses MSDP chat events, preserves repeated ANSI text, and does not classify prose', () => {
  const { session, messages } = fixture()
  const text = "\x1b[36mA traveler says, 'Hello'\x1b[0m\r\n"
  session.parser.callbacks.onMsdp('CHAT_MESSAGE', JSON.stringify({ text }))
  session.parser.callbacks.onMsdp('CHAT_MESSAGE', JSON.stringify({ text }))
  assert.deepEqual(messages.filter((message) => message.type === 'chat'), [{ type: 'chat', text }, { type: 'chat', text }])
  session.parser.callbacks.onMsdp('CHAT_MESSAGE', '{invalid')
  session.parser.callbacks.onMsdp('CHAT_MESSAGE', JSON.stringify({ text: 123 }))
  assert.equal(messages.filter((message) => message.type === 'chat').length, 2)
  session.parser.callbacks.onText('A room description mentions (chat) and shouting.\r\n')
  assert.equal(messages.at(-1).type, 'terminal')
})

test('Star Wars destination routing retains its independent split-tag format', () => {
  const { session } = fixture('d20mud.com')
  session.starWarsMode = true
  let result = session.routeChatDestination('Room\r\n\t<DES')
  assert.equal(result.terminalText, 'Room\r\n')
  assert.equal(result.chatText, '')
  result = session.routeChatDestination('T Player Comm>Player (holonet): Hello\r\n\t</DE')
  assert.equal(result.chatText, 'Player (holonet): Hello\r\n')
  assert.equal(result.terminalText, '')
  result = session.routeChatDestination('ST>Combat\r\n')
  assert.equal(result.terminalText, 'Combat\r\n')
  assert.equal(result.chatText, '')
})


test('Krynn restores combined history once per character connection, including manual login', () => {
  const { session, sockets, messages } = fixture()
  const receive = (name) => session.parser.callbacks.onMsdp('CHARACTER_NAME', name)
  receive('')
  assert.deepEqual(sockets[0].writes, [])
  receive('Vertas')
  receive('Vertas')
  assert.deepEqual(sockets[0].writes, ['history all\n'])
  assert.equal(messages.filter((m) => m.type === 'chat' && m.reset).length, 1)
  session.connect('krynn.d20mud.com', 4300, {}, false)
  receive('Vertas')
  assert.deepEqual(sockets[1].writes, ['history all\n'])
  receive('Other')
  assert.deepEqual(sockets[1].writes, ['history all\n', 'history all\n'])
})

test('Krynn history restoration does not send commands to Star Wars', () => {
  const { session, sockets } = fixture('starwars.d20mud.com')
  session.parser.callbacks.onMsdp('CHARACTER_NAME', 'Test')
  assert.deepEqual(sockets[0].writes, [])
})
