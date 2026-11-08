import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { StringDecoder } from 'node:string_decoder'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AnsiToHtml from 'ansi-to-html'
import ts from 'typescript'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
// Use the real parsing/rendering functions without mounting the application or a socket.
const functions = ast.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(ast).replace('export default ', '')).filter((text) => !text.includes('import.meta')).join('\n')
const colors = ast.statements.filter(ts.isVariableStatement).filter((node) => node.declarationList.declarations.some((d) => ['LUMINARI_COLOR_CHAR', 'KRYNN_COLOR_CHAR', 'LUMINARI_COLOR_CODES'].includes(d.name.getText(ast)))).map((n) => n.getText(ast)).join('\n')
const context = vm.createContext({ ANSI_ESCAPE_PATTERN: /\x1b\[[0-?]*[ -/]*[@-~]/g, React, AnsiToHtml, useEffect: React.useEffect, useRef: React.useRef })
vm.runInContext(ts.transpile(`${colors}\n${functions}`, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }), context)
const fixture = [{ slot: 0, vnum: 70001, name: '\tWDefend Palanthas\tn', type: 'Kill Mob', description: 'Help the militia.', info: 'Hold the gates.\n\n<script>alert("bad")</script>\n\tRFor Palanthas!\tn', progress: { completed: 2, required: 5, remaining: 3 }, targets: [{ name: 'a knight' }], time_remaining: 7, dialogue_commands: ['convince'] }]

test('quest JSON parses into stable identities and complete details', () => {
  const [quest] = context.parseQuestEntries(context.normalizeQuestValue(JSON.stringify(fixture)))
  assert.equal(quest.id, '70001:0')
  assert.equal(quest.info, fixture[0].info)
  assert.equal(quest.timeRemaining, 7)
  assert.equal(quest.progress.percentage, 40)
  const updated = structuredClone(fixture)
  updated[0].progress.completed = 4
  assert.equal(context.parseQuestEntries(updated)[0].id, quest.id)
  assert.equal(context.parseQuestEntries([]).length, 0)
  const largeProgress = context.formatQuestProgress({ completed: 1200, required: 2400 })
  assert.equal(largeProgress.percentage, 50)
  assert.equal(context.normalizeQuestValue('legacy text'), 'legacy text')
})

test('only enabled quest lists expose keyboard-accessible modal buttons', () => {
  const legacy = renderToStaticMarkup(context.renderQuestNode(fixture))
  assert.doesNotMatch(legacy, /aria-haspopup/)
  let selected
  const tree = context.renderQuestNode(fixture, (quest) => { selected = quest })
  const enabled = renderToStaticMarkup(tree)
  assert.match(enabled, /aria-haspopup="dialog"/)
  const button = tree.props.children[0].props.children[0]
  button.props.onClick()
  assert.equal(selected.id, '70001:0')
})

test('modal renders player details and colors while escaping supplied HTML', () => {
  const quest = context.parseQuestEntries(fixture)[0]
  const html = renderToStaticMarkup(React.createElement(context.QuestDetailsModal, { quest, onClose() {} }))
  assert.match(html, /aria-labelledby="quest-details-title"/)
  assert.match(html, /Hold the gates/)
  assert.match(html, /7 turns/)
  assert.match(html, /2\/5/)
  assert.match(html, /convince/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /style="color:/)
})

test('quest details are enabled only for Krynn presets', () => {
  const settingsSource = readFileSync(new URL('../shared/app-settings.ts', import.meta.url), 'utf8')
  const settings = vm.createContext({ exports: {} })
  vm.runInContext(ts.transpile(settingsSource, { module: ts.ModuleKind.CommonJS }), settings)
  const presets = settings.exports.appSettings.connection.muds
  assert.equal(presets.find((p) => p.id === 'krynn').features.questDetails, true)
  for (const preset of presets.filter((p) => p.id !== 'krynn')) assert.notEqual(preset.features?.questDetails, true)
})

test('proxy preserves a large QUEST_INFO payload fragmented across telnet reads', () => {
  const server = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
  const serverAst = ts.createSourceFile('server.ts', server, ts.ScriptTarget.Latest, true)
  const declarations = serverAst.statements.filter((node) => ts.isFunctionDeclaration(node) || (ts.isClassDeclaration(node) && node.name.text === 'TelnetParser')).map((node) => node.getText(serverAst)).filter((text) => !text.includes('import.meta')).join('\n')
  const received = []
  const parserContext = vm.createContext({ Buffer, StringDecoder, setTimeout, IAC: 255, SB: 250, SE: 240, WILL: 251, WONT: 252, DO: 253, DONT: 254, TELOPT_MSDP: 69, MSDP_VAR: 1, MSDP_VAL: 2, MSDP_TABLE_OPEN: 3, MSDP_TABLE_CLOSE: 4, MSDP_ARRAY_OPEN: 5, MSDP_ARRAY_CLOSE: 6, CONTROL_BYTES: new Set([1, 2, 3, 4, 5, 6]) })
  vm.runInContext(ts.transpile(`${declarations}\nglobalThis.Parser = TelnetParser`, { target: ts.ScriptTarget.ES2022 }), parserContext)
  const parser = new parserContext.Parser({ write() {} }, { onText() {}, onMsdp: (...pair) => received.push(pair), onMsdpReady() {} })
  const quests = structuredClone(fixture)
  quests[0].info = 'Palanthas — défense!\n'.repeat(12000)
  const value = JSON.stringify(quests)
  const packet = Buffer.concat([Buffer.from([255, 250, 69, 1]), Buffer.from('QUEST_INFO'), Buffer.from([2]), Buffer.from(value), Buffer.from([255, 240])])
  for (let offset = 0; offset < packet.length; offset += 127) parser.push(packet.subarray(offset, offset + 127))
  assert.equal(received.length, 1)
  assert.equal(received[0][0], 'QUEST_INFO')
  assert.equal(typeof received[0][1] === 'string' ? received[0][1] : JSON.stringify(received[0][1]), value)
})


test('an active quest in slot zero with zero completed objectives remains visible', () => {
  const data = [{ slot: 0, vnum: 2204, name: 'The Cold War', type: 'Kill Mob', info: 'Help Palanthas.', progress: { remaining: 1, required: 1, completed: 0 }, targets: [] }]
  const quests = context.parseQuestEntries(context.normalizeQuestValue(JSON.stringify(data)))
  assert.equal(quests.length, 1)
  assert.equal(quests[0].id, '2204:0')
  assert.equal(quests[0].progress.label, '0/1')
  const html = renderToStaticMarkup(context.renderQuestNode(data, () => {}))
  assert.match(html, /The Cold War/)
  assert.match(html, /aria-haspopup="dialog"/)
})

test('quest modal stays open through Strict Mode effect replay and still closes normally', () => {
  const originalEffect = context.useEffect
  const originalRef = context.useRef
  let effect
  let closes = 0
  let shows = 0
  const closeEvents = []
  const dialog = {
    open: false,
    showModal() { this.open = true; shows++ },
    close() { this.open = false; closeEvents.push(() => element.props.onClose({ currentTarget: dialog })) },
  }
  let element
  try {
    context.useEffect = (callback) => { effect = callback }
    context.useRef = () => ({ current: dialog })
    element = context.WebOutputModal({ title: 'Test', titleId: 'test-title', closeLabel: 'Close', children: null, onClose: () => { closes++ } })
    const cleanup = effect()
    assert.equal(dialog.open, true)
    cleanup() // Strict Mode simulates unmounting and then remounting the effect.
    const finalCleanup = effect()
    assert.equal(shows, 2)
    assert.equal(dialog.open, true)
    closeEvents.shift()() // The native close event from cleanup arrives later.
    assert.equal(closes, 0)
    dialog.close()
    closeEvents.shift()()
    assert.equal(closes, 1)
    finalCleanup()
  } finally {
    context.useEffect = originalEffect
    context.useRef = originalRef
  }
})


test('help modal accepts structured JSON and formats prose, colors and tables safely', () => {
  assert.equal(context.parseHelpInfo(''), null)
  assert.equal(context.parseHelpInfo({ id: '1', body: 4 }), null)
  const help = context.parseHelpInfo(JSON.stringify({ id: '1', topic: 'ranged', body: '----------\nThis is wrapped\nprose.\n\nName  Damage\nBow   1d8\n\n<script>bad()</script>\n\n\tRRed text\tn', truncated: true }))
  const blocks = context.formatWebHelpBlocks(help.body)
  assert.equal(blocks[0].text, 'This is wrapped prose.')
  assert.equal(blocks[1].preformatted, true)
  const html = renderToStaticMarkup(React.createElement(context.HelpInfoModal, { help, onClose() {} }))
  assert.match(html, /Help: ranged/)
  assert.match(html, /<pre>/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|----------/)
  assert.match(html, /was shortened/)
})

test('help modal feature is enabled only for Krynn', () => {
  const settingsSource = readFileSync(new URL('../shared/app-settings.ts', import.meta.url), 'utf8')
  const settings = vm.createContext({ exports: {} })
  vm.runInContext(ts.transpile(settingsSource, { module: ts.ModuleKind.CommonJS }), settings)
  for (const preset of settings.exports.appSettings.connection.muds) {
    assert.equal(preset.features?.helpModal === true, preset.id === 'krynn')
  }
})
