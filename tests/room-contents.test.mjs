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
const fixture = { room: 1005, entries: [
  { target: '}c100', kind: 'mob', name: '\tCthe dockmaster\tn' },
  { target: '}o200', kind: 'object', name: 'a sword', takeable: true },
  { target: '}o201', kind: 'object', name: 'a sign <script>', takeable: false },
  { target: '}c300', kind: 'player', name: 'a hooded stranger' },
] }

test('room contents parses exact targets and rejects malformed/injected actions', () => {
  assert.equal(context.parseRoomContents(JSON.stringify(fixture)).entries.length, 4)
  assert.equal(context.parseRoomContents(undefined), null)
  assert.equal(context.parseRoomContents('{broken'), null)
  const malformed = { room: 1005, entries: [
    { target: '}c100\nquit', kind: 'mob', name: 'bad' }, { target: '}o200', kind: 'mob', name: 'wrong type' },
    { target: '}c0', kind: 'player', name: 'bad ID' }, { target: '}o200', kind: 'unknown', name: 'bad kind' },
  ] }
  assert.equal(context.parseRoomContents(malformed).entries.length, 0)
})

test('room action choices match entity type and takeable flag', () => {
  const parsed = context.parseRoomContents(fixture)
  const labels = (entry) => [...context.roomEntityActions(entry)].map((action) => action.label)
  assert.deepEqual(labels(parsed.entries[0]), ['Attack', 'Fire', 'Lore', 'Look'])
  assert.deepEqual(labels(parsed.entries[1]), ['Look', 'Examine', 'Read', 'Get'])
  assert.deepEqual(labels(parsed.entries[2]), ['Look', 'Examine', 'Read'])
  assert.deepEqual(labels(parsed.entries[3]), ['Look'])
})

test('clicking room entries reveals actions and sends their exact target', () => {
  let selected = null
  const commands = []
  context.useState = () => [selected, (value) => { selected = value }]
  const props = { value: fixture, currentRoom: 1005, connected: true, onAction: (command) => commands.push(command) }
  let panel = context.RoomContentsPanel(props)
  const html = renderToStaticMarkup(panel)
  assert.match(html, /the dockmaster/)
  assert.match(html, /a hooded stranger/)
  assert.doesNotMatch(html, /<script>/)
  const mobButton = panel.props.children[0].props.children[1].props.children[0].props.children[0]
  mobButton.props.onClick()
  assert.equal(selected, '}c100')
  panel = context.RoomContentsPanel(props)
  const actions = panel.props.children[0].props.children[1].props.children[0].props.children[1].props.children
  actions[0].props.onClick()
  assert.deepEqual(commands, ['kill }c100'])
  assert.equal(selected, null)
  selected = '}o200'
  panel = context.RoomContentsPanel(props)
  const objectActions = panel.props.children[1].props.children[1].props.children[0].props.children[1].props.children
  objectActions.at(-1).props.onClick()
  assert.deepEqual(commands, ['kill }c100', 'get }o200'])
})

test('moving, disappearing targets and disconnecting clear stale actions', () => {
  let selected = '}c100'
  context.useState = () => [selected, (value) => { selected = value }]
  const props = { value: fixture, currentRoom: 1006, connected: true, onAction() {} }
  const html = renderToStaticMarkup(context.RoomContentsPanel(props))
  assert.match(html, /Waiting for current room contents/)
  assert.equal(selected, null)
  selected = '}c100'
  context.RoomContentsPanel({ ...props, currentRoom: 1005, value: { room: 1005, entries: [] } })
  assert.equal(selected, null)
  selected = '}c100'
  context.RoomContentsPanel({ ...props, currentRoom: 1005, connected: false })
  assert.equal(selected, null)
})

test('Room contents tab is enabled by default for Krynn only and remains configurable', () => {
  const settings = context.normalizeClientSettings({ terminal: {} })
  assert.equal(settings.layout.sidebarTabs.roomContents, true)
  const visible = (starwars, krynn) => [...context.getVisibleSidebarTabs(settings.layout, starwars, krynn)].map((tab) => tab.id)
  assert.equal(visible(false, true).includes('roomContents'), true)
  assert.equal(visible(false, false).includes('roomContents'), false)
  assert.equal(visible(true, false).includes('roomContents'), false)
  settings.layout.sidebarTabs.roomContents = false
  assert.equal(visible(false, true).includes('roomContents'), false)
})
