import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import AnsiToHtml from 'ansi-to-html'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = ast.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(ast).replace('export default ', '')).filter((text) => !text.includes('import.meta')).join('\n')
const constants = ast.statements.filter(ts.isVariableStatement).map((node) => node.getText(ast)).filter((text) => !text.includes('import.meta')).join('\n')
const context = vm.createContext({ React, AnsiToHtml,
  appSettings: { connection: { defaultHost: 'krynn.d20mud.com', defaultPort: 4300, muds: [{ id: 'krynn', host: 'krynn.d20mud.com', port: 4300 }] } },
  normalizeMsdpVariableMap: (value) => value, defaultMsdpVariables: {},
})
vm.runInContext(ts.transpile(`${functions}\n${constants}`, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }), context)
const plain = (value) => JSON.parse(JSON.stringify(value))

test('window defaults migrate old settings and persist individual choices', () => {
  const defaults = plain(context.normalizeWindowPreferences(undefined))
  assert.equal(Object.keys(defaults).length, 8)
  assert.ok(Object.values(defaults).every(Boolean))
  const settings = context.normalizeClientSettings({ terminal: {}, windows: { help: false, lore: false, questCompletion: false, questAcceptance: 'false' } })
  assert.equal(settings.windows.help, false)
  assert.equal(settings.windows.questCompletion, false)
  assert.equal(settings.windows.questAcceptance, true)
  assert.equal(settings.windows.questDetails, true)
  const restored = context.parsePersistedClientSettings(JSON.stringify(settings))
  assert.deepEqual(plain(restored.windows), plain(settings.windows))
  assert.deepEqual(plain(context.normalizeClientSettings({ terminal: {} }).windows), defaults)
})

test('Windows controls expose checked options and apply all on/off', () => {
  let preferences = context.normalizeWindowPreferences(undefined)
  const onChange = (updates) => { preferences = { ...preferences, ...updates } }
  const controls = context.OutputWindowsControls({ windows: preferences, onChange })
  const html = renderToStaticMarkup(controls)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 8)
  assert.equal((html.match(/checked=""/g) ?? []).length, 8)
  assert.match(html, /Quest acceptance/)
  const actions = controls.props.children[1].props.children
  actions[1].props.onClick()
  assert.ok(Object.values(preferences).every((enabled) => enabled === false))
  actions[0].props.onClick()
  assert.ok(Object.values(preferences).every((enabled) => enabled === true))
  const labels = controls.props.children[0].props.children[1]
  labels[0].props.children[0].props.onChange({ target: { checked: false } })
  assert.equal(preferences.help, false)
  assert.equal(preferences.lore, true)
})

// Exercise the actual WebSocket event routing without a network connection.
const start = source.indexOf('        const acceptance = parseQuestAcceptance(message.state.questAccepted)')
const routing = source.slice(start, source.indexOf('        setMudState(', start))
function route(windows) {
  const output = [], quests = [], lore = [], help = [], info = []
  Object.assign(context, {
    message: { state: {
      questAccepted: { id: 'accepted', name: 'Quest', body: 'Instructions' },
      questComplete: { id: 'complete', name: 'Quest', body: 'Done', rewards: { Experience: 42 } },
      loreInfo: { id: 'lore', topic: 'guard', body: 'Name: guard\nLevel: 10' },
      helpInfo: { id: 'help', topic: 'quest', body: 'Quest help text' },
    } },
    clientSettingsRef: { current: { windows } },
    lastQuestAcceptanceIdRef: { current: null }, lastQuestCompletionIdRef: { current: null },
    lastLoreResponseIdRef: { current: null }, lastHelpResponseIdRef: { current: null },
    lastInfoIdsRef: { current: {} }, setInfoModals: (update) => { info.splice(0, info.length, ...update(info)) },
    setQuestNotifications: (update) => { quests.splice(0, quests.length, ...update(quests)) },
    setLoreModals: (update) => { lore.splice(0, lore.length, ...update(lore)) },
    setHelpModal: (value) => help.push(value), appendWindowOutput: (text) => output.push(text),
  })
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  // Repeated state must not duplicate either modal or main-output content.
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  return { output, quests, lore, help, info }
}

test('all off suppresses popups and restores captured help/lore to main output once', () => {
  const windows = Object.fromEntries(Object.keys(context.normalizeWindowPreferences(undefined)).map((key) => [key, false]))
  const result = route(windows)
  assert.equal(result.quests.length, 0)
  assert.equal(result.lore.length, 0)
  assert.equal(result.help.length, 0)
  assert.equal(result.output.length, 2)
  assert.match(result.output.join('\n'), /Name: guard\nLevel: 10/)
  assert.match(result.output.join('\n'), /Quest help text/)
})

test('individual preferences route only enabled events to their modals', () => {
  const result = route({ ...context.normalizeWindowPreferences(undefined), questAcceptance: false, lore: false })
  assert.equal(result.quests.length, 1)
  assert.equal(result.quests[0].kind, 'complete')
  assert.equal(result.lore.length, 0)
  assert.equal(result.help.length, 1)
  assert.equal(result.output.length, 1)
  assert.match(result.output[0], /Lore: guard/)
})

test('disabled quest list/detail windows print readable content and join commands', () => {
  let state = null
  context.useState = () => [state, (value) => { state = value }]
  const output = []
  const notice = context.RoomQuestNotice({ value: { room: 1005, quests: [{ id: 900, name: 'Guard duty', giver: 'Guard', info: 'Keep watch.', time: 20 }] },
    currentRoom: 1005, connected: true, modalEnabled: false, onOutput: (text) => output.push(text), onJoin() {} })
  assert.equal(notice.props.children[2], null)
  assert.equal(notice.props.children[1].props['aria-haspopup'], undefined)
  notice.props.children[1].props.onClick()
  assert.equal(state, null)
  assert.match(output[0], /Guard duty/)
  assert.match(output[0], /To join: quest webjoin 1005 900/)
  const panel = context.QuestInfoPanel({ value: [{ vnum: 900, name: 'Guard duty', info: 'Keep watch.' }], detailsEnabled: true,
    modalEnabled: false, onOutput: (text) => output.push(text) })
  const questButton = panel.props.children[0].props.children[0].props.children[0]
  assert.equal(questButton.props['aria-haspopup'], undefined)
  questButton.props.onClick()
  assert.equal(state, null)
  assert.match(output[1], /Guard duty/)
  assert.match(output[1], /Keep watch/)
})


test('turning all off drains captured pending content and clears queued popups', () => {
  const output = []
  let lore = [{ id: 'pending-lore', topic: 'sword', body: 'Lore details', truncated: false }]
  let help = { id: 'pending-help', topic: 'help', body: 'Help details', truncated: false }
  let notifications = [{ kind: 'accepted', quest: {} }, { kind: 'complete', quest: {} }]
  const ref = { current: { windows: context.normalizeWindowPreferences(undefined), terminal: {} } }
  Object.assign(context, {
    clientSettingsRef: ref, loreModals: lore, helpModal: help, infoModals: [], setInfoModals: () => {},
    appendWindowOutput: (text) => output.push(text),
    setLoreModals: (value) => { lore = value }, setHelpModal: (value) => { help = value },
    setQuestNotifications: (update) => { notifications = update(notifications) },
    setClientSettings: (settings) => { assert.equal(settings, ref.current) },
  })
  const start = source.indexOf('  function updateWindowPreferences(')
  const update = source.slice(start, source.indexOf('\n  }', start) + 4)
  vm.runInContext(ts.transpile(update), context)
  context.updateWindowPreferences(Object.fromEntries(Object.keys(ref.current.windows).map((key) => [key, false])))
  assert.equal(output.length, 2)
  assert.match(output.join('\n'), /Lore details/)
  assert.match(output.join('\n'), /Help details/)
  assert.equal(lore.length, 0)
  assert.equal(help, null)
  assert.equal(notifications.length, 0)
  assert.ok(Object.values(ref.current.windows).every((enabled) => enabled === false))
})


test('score and who route once through Windows preferences', () => {
  const enabled = route(context.normalizeWindowPreferences(undefined))
  context.message.state.scoreInfo = { id: 'score-1', topic: 'Score', body: 'Score fallback', fields: [{ section: 'Resources', label: 'HP', value: '10 / 20' }] }
  context.message.state.whoInfo = { id: 'who-1', topic: 'Who', body: 'Who fallback', players: [] }
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  assert.deepEqual(enabled.info.map((entry) => entry.kind), ['Score', 'Who'])
  const disabled = route({ ...context.normalizeWindowPreferences(undefined), score: false, who: false })
  context.message.state.scoreInfo = { id: 'score-2', topic: 'Score', body: 'Score fallback' }
  context.message.state.whoInfo = { id: 'who-2', topic: 'Who', body: 'Who fallback' }
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  assert.equal(disabled.info.length, 0)
  assert.match(disabled.output.join(' '), /Score fallback.*Who fallback/s)
})
