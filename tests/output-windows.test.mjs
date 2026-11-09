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
const context = vm.createContext({ React, Fragment: React.Fragment, AnsiToHtml,
  appSettings: { connection: { defaultHost: 'krynn.d20mud.com', defaultPort: 4300, muds: [{ id: 'krynn', host: 'krynn.d20mud.com', port: 4300 }] } },
  normalizeMsdpVariableMap: (value) => value, defaultMsdpVariables: {},
})
vm.runInContext(ts.transpile(`${functions}\n${constants}`, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }), context)
const plain = (value) => JSON.parse(JSON.stringify(value))

test('window defaults migrate old settings and persist individual choices', () => {
  const defaults = plain(context.normalizeWindowPreferences(undefined))
  assert.equal(Object.keys(defaults).length, 9)
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
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 9)
  assert.equal((html.match(/checked=""/g) ?? []).length, 9)
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


test('loot events queue once and disabled loot prints native fields', () => {
  const result = route(context.normalizeWindowPreferences(undefined))
  context.message.state.lootInfo = { id: 'loot-1', topic: 'Corpse loot', body: '', fields: [{ section: 'On corpse', label: 'Item', value: 'a sword' }] }
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  assert.deepEqual(result.info.map((entry) => entry.kind), ['Loot'])
  const disabled = route({ ...context.normalizeWindowPreferences(undefined), loot: false })
  context.message.state.lootInfo = { id: 'loot-2', topic: 'Corpse loot', body: '', fields: [{ section: 'On corpse', label: 'Item', value: 'a sword' }] }
  vm.runInContext(ts.transpile(`(() => {${routing}})()`), context)
  assert.equal(disabled.info.length, 0)
  assert.match(disabled.output.join(' '), /On corpse.*a sword/)
})


test('captured score and who output retains colors in the main terminal', () => {
  for (const body of [
    '\tcAlignment: \tn\tcNeutral \tWGood\tn\r\n',
    '\tYPlayers online\tn\r\n\tCVertas\tn',
    '^RQuest complete^n\n\n^GReward^n',
    String.raw`\tRHelp, lore, loot and creation text\tn`,
    '\t[f123]Extended color\tn',
  ]) {
    const text = context.normalizeCapturedOutputText(body)
    assert.match(text, /\x1b\[/)
    const html = new AnsiToHtml({ escapeXML: true }).toHtml(text)
    assert.match(html, /style="color:/)
    assert.doesNotMatch(html, /\t[cCYRWn]|\\t[Rn]|\^R|\^n|\^G/)
  }
  const alignment = new AnsiToHtml().toHtml(context.normalizeCapturedOutputText('\tcNeutral \tWGood\tn'))
  assert.match(alignment, />Neutral /)
  assert.doesNotMatch(alignment, /cNeutral/)
  const ansi = '\x1b[31mAlready converted\x1b[0m\r\nLiteral ^caret'
  assert.equal(context.normalizeTerminalText(ansi), ansi.replace('\r\n', '\n'))
  assert.equal(context.normalizeCapturedOutputText('a\n\nb'), 'a\n\nb')
})

test('the actual captured-output append path renders colored score and who text', () => {
  let terminal = ''
  Object.assign(context, {
    useCallback: (callback) => callback,
    terminalScrollRef: { current: { isFollowing: () => true } },
    terminalHistoryLineLimitRef: { current: 100 },
    setHasUnreadTerminalOutput() {},
    setTerminalOutput: (update) => { terminal = update(terminal) },
  })
  const start = source.indexOf('  const appendWindowOutput = useCallback(')
  const end = source.indexOf('  const rememberCommand', start)
  const append = vm.runInContext(ts.transpile(`(() => {${source.slice(start, end)}\nreturn appendWindowOutput})()`), context)
  append(context.formatTextWindowOutput({ topic: 'Score', body: '\tcNeutral \tWGood\tn', truncated: false }, 'Score'))
  append(context.formatTextWindowOutput({ topic: 'Who', body: '\tCVertas\tn', truncated: false }, 'Who'))
  assert.match(terminal, /\x1b\[/)
  assert.doesNotMatch(terminal, /\t[cCWn]/)
  const html = new AnsiToHtml({ escapeXML: true }).toHtml(terminal)
  assert.match(html, /style="color:/)
  assert.match(html, />Neutral /)
  assert.match(html, />Vertas/)
})

test('Who displays staff titles with colors and active happy-hour bonuses', () => {
  const info = context.parseHelpInfo({ id: 'who-details', topic: 'Who is online', body: '',
    players: [{ name: 'Gicker', role: 'Staff', staffTitle: '\tCCaretaker\tn' },
      { name: 'Vertas', role: 'Player', level: 2 }],
    fields: [{ section: 'Happy hour', label: 'Time remaining', value: '0h 30m 0s' },
      { section: 'Happy hour', label: 'Experience', value: '+50%' }],
  })
  assert.equal(info.players[0].staffTitle, '\tCCaretaker\tn')
  const html = renderToStaticMarkup(context.StructuredInfo({ help: info }))
  assert.match(html, /Staff &#xB7; .*Caretaker/)
  assert.match(html, /color:/)
  assert.doesNotMatch(html, /\tC/)
  assert.match(html, /Happy hour/)
  assert.match(html, /Time remaining/)
  assert.match(html, /0h 30m 0s/)
  assert.match(html, /Experience/)
  assert.match(html, /\+50%/)
})

test('Who remains compatible with older responses and ignores malformed titles', () => {
  const info = context.parseHelpInfo({ id: 'old-who', body: '',
    players: [{ name: 'Staff member', role: 'Staff', staffTitle: 42 }],
  })
  assert.equal(info.players[0].staffTitle, undefined)
  const html = renderToStaticMarkup(context.StructuredInfo({ help: info }))
  assert.match(html, /Staff member/)
  assert.doesNotMatch(html, /Happy hour|undefined|42/)
})

test('See Also links only resolved topics and navigates without submitting a form', () => {
  const visited = []
  const references = { text: 'See Also: CRAFTING, NOFILE, LITANY OF RIGHTEOUSNESS\n', entries: [
    { label: 'CRAFTING', topic: 'CRAFTING' }, { label: 'NOFILE' },
    { label: 'LITANY OF RIGHTEOUSNESS', topic: 'LITANY OF RIGHTEOUSNESS' },
  ] }
  const links = context.HelpReferenceLinks({ references, onNavigate: topic => visited.push(topic) })
  const html = renderToStaticMarkup(links)
  assert.equal((html.match(/class="help-reference-link"/g) ?? []).length, 2)
  assert.match(html, /<span>NOFILE<\/span>/)
  assert.match(html, /type="button"/)
  links.props.children[1][2].props.children[1].props.onClick()
  assert.deepEqual(visited, ['LITANY OF RIGHTEOUSNESS'])
  const info = context.parseHelpInfo({ id: 'references', body: `Intro\n\n${references.text}\nFooter remains.`, seeAlso: references })
  const rendered = renderToStaticMarkup(context.renderLinkedHelpText(info, () => {}))
  assert.match(rendered, /Intro/)
  assert.match(rendered, /Footer remains/)
  assert.equal((rendered.match(/See also:/g) ?? []).length, 1)
  assert.equal((rendered.match(/NOFILE/g) ?? []).length, 1)
})

test('help references reject malformed metadata and command separators, escaping labels', () => {
  const info = context.parseHelpInfo({ id: 'unsafe', body: 'See Also: example\n', seeAlso: {
    text: 'See Also: example\n', entries: [null, { label: 42 },
      { label: '<script>bad</script>', topic: 'foo\nquit' }, { label: 'also bad', topic: 'foo;quit' }],
  } })
  assert.equal(info.seeAlso.entries.length, 2)
  const html = renderToStaticMarkup(context.HelpReferenceLinks({ references: info.seeAlso, onNavigate() {} }))
  assert.doesNotMatch(html, /help-reference-link|<script>/)
  assert.match(html, /&lt;script&gt;/)
  const legacy = context.parseHelpInfo({ id: 'old', body: 'See Also: plain text' })
  assert.equal(legacy.seeAlso, undefined)
  assert.match(renderToStaticMarkup(React.createElement(React.Fragment, null, context.renderLinkedHelpText(legacy))), /See Also: plain text/)
})
