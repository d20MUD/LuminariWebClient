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
const context = vm.createContext({ ANSI_ESCAPE_PATTERN: /\x1b\[[0-?]*[ -/]*[@-~]/g, React, Fragment: React.Fragment, AnsiToHtml, useEffect: React.useEffect, useRef: React.useRef })
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
  const text = context.reflowModalText(help.body)
  assert.match(text, /^This is wrapped prose\.\n\nName  Damage Bow   1d8\n\n/)
  const html = renderToStaticMarkup(React.createElement(context.HelpInfoModal, { help, onClose() {} }))
  assert.match(html, /Help: ranged/)
  assert.match(html, /class="modal-flow-text"/)
  assert.doesNotMatch(html, /<pre>/)
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


test('completion events validate payloads and render safe web rewards', () => {
  assert.equal(context.parseQuestCompletion(undefined), null)
  assert.equal(context.parseQuestCompletion('{}'), null)
  const completion = context.parseQuestCompletion(JSON.stringify({
    id: 'completion-1', name: 'A finished quest', body: 'Thank you!\n\n<script>unsafe</script>',
    rewards: { 'Quest points': 5, 'Gold coins': 2500, Item: '<img src=x onerror=bad>', invalid: {} },
  }))
  assert.equal(completion.rewards['Gold coins'], 2500)
  assert.equal(completion.rewards.invalid, undefined)
  const html = renderToStaticMarkup(context.QuestCompletionModal({ completion, onClose() {} }))
  assert.match(html, /Quest complete!/)
  assert.match(html, /Rewards received/)
  assert.match(html, /2,500/)
  assert.doesNotMatch(html, /<script>|<img/)
  assert.match(html, /&lt;script&gt;/)
})


test('room quests reject malformed entries and expose a clickable room notification', () => {
  assert.equal(context.parseRoomQuests(undefined), null)
  assert.equal(context.parseRoomQuests('{broken'), null)
  assert.equal(context.parseRoomQuests({ room: '1005', quests: [] }), null)
  const value = JSON.stringify({ room: 1005, quests: [
    { id: 100, name: '<script>Quest</script>', description: 'Help the guard', giver: 'Guard', info: 'First paragraph.\n\nSecond paragraph.', minLevel: 5, maxLevel: 20, time: 30 },
    { id: '100;quit', name: 'Invalid' },
  ] })
  assert.equal(context.parseRoomQuests(value).quests.length, 1)
  let opened = null
  context.useState = () => [opened, (value) => { opened = value }]
  const props = { value, currentRoom: 1005, connected: true, onJoin() {} }
  const notice = context.RoomQuestNotice(props)
  const html = renderToStaticMarkup(notice)
  assert.match(html, /Quests available here/)
  assert.match(html, /1 quest you can join/)
  assert.match(html, /View quests/)
  notice.props.children[1].props.onClick()
  assert.equal(opened, 1005)
  const modalTree = context.RoomQuestNotice(props).props.children[2]
  const modalHtml = renderToStaticMarkup(modalTree)
  assert.match(modalHtml, /Join quest/)
  assert.match(modalHtml, /Levels 5–20/)
  assert.match(modalHtml, /Time limit: 30 turns/)
  assert.doesNotMatch(modalHtml, /<script>/)
  assert.equal(context.RoomQuestNotice({ ...props, currentRoom: 1006 }), null)
  assert.equal(opened, null)
  assert.equal(context.RoomQuestNotice({ ...props, connected: false }), null)
  assert.equal(context.RoomQuestNotice({ ...props, value: { room: 1005, quests: [] } }), null)
})

test('joining from the room modal sends the selected quest ID and room token', () => {
  const commands = []
  let opened = 1005
  context.useState = () => [opened, (value) => { opened = value }]
  const notice = context.RoomQuestNotice({
    value: { room: 1005, quests: [{ id: 900, name: 'Quest', giver: 'Giver' }] }, currentRoom: 1005, connected: true,
    onJoin: (command) => commands.push(command),
  })
  const modal = notice.props.children[2]
  const card = modal.props.children[1].props.children[0]
  const join = card.props.children.at(-1)
  join.props.onClick()
  assert.deepEqual(commands, ['quest webjoin 1005 900'])
  assert.equal(opened, null)
})


test('lore results use a labeled modal with safe colors, prose and stat tables', () => {
  const help = context.parseHelpInfo(JSON.stringify({ id: 'lore-1', topic: 'sword <script>',
    body: '\tWName: Sword\tn\nLevel: 5\n\nDamage    1d8\nWeight    3\n\n<img src=x onerror=bad>', truncated: true }))
  const html = renderToStaticMarkup(context.HelpInfoModal({ help, kind: 'Lore', onClose() {} }))
  assert.match(html, /Lore: sword &lt;script&gt;/)
  assert.match(html, /lore-details-title/)
  assert.match(html, /Close lore/)
  assert.match(html, /class="modal-flow-text"/)
  assert.doesNotMatch(html, /<pre/)
  assert.match(html, /Damage/)
  assert.match(html, /This lore response exceeded/)
  assert.doesNotMatch(html, /<script>|<img/)
})


test('quest acceptance validates and renders the actual journal and dialogue commands', () => {
  assert.equal(context.parseQuestAcceptance(undefined), null)
  assert.equal(context.parseQuestAcceptance('{}'), null)
  const acceptance = context.parseQuestAcceptance(JSON.stringify({ id: 'accept-1', name: '\tWThe guard\tn',
    body: 'Speak to the guard.\n\n<script>unsafe</script>', time: 20, commands: ['convince', 'beguile', 3] }))
  assert.equal(acceptance.commands.length, 2)
  const html = renderToStaticMarkup(context.QuestAcceptanceModal({ acceptance, onClose() {} }))
  assert.match(html, /Quest accepted!/)
  assert.match(html, /Speak to the guard/)
  assert.match(html, /Time limit: 20 turns/)
  assert.match(html, /convince, beguile/)
  assert.doesNotMatch(html, /<script>/)
})

test('available quests hide acceptance instructions until after joining', () => {
  context.useState = () => [1005, () => {}]
  const available = { room: 1005, quests: [{ id: 900, name: 'Trouble at the Docks', giver: 'a mysterious old lady',
    description: 'Trouble at the Docks', info: '\tCSecret acceptance instructions about the dockmaster.' }] }
  const notice = context.RoomQuestNotice({ value: available, currentRoom: 1005, connected: true, onJoin() {} })
  const html = renderToStaticMarkup(notice.props.children[2])
  assert.match(html, /Trouble at the Docks/)
  assert.match(html, /Join quest/)
  assert.doesNotMatch(html, /Secret acceptance instructions|dockmaster/)
  const terminal = context.formatAvailableQuestsOutput(context.parseRoomQuests(available))
  assert.doesNotMatch(terminal, /Secret acceptance instructions|dockmaster/)
  assert.match(terminal, /quest webjoin 1005 900/)
})

test('acceptance and completion decode leading color tokens before trimming and keep paragraph colors', () => {
  for (const token of ['\tC', String.raw`\tC`, '^[F055]']) {
    const body = `${token}First paragraph.\n\nSecond paragraph.\tn\n\nPlain paragraph. <script>unsafe</script>`
    for (const kind of ['accepted', 'complete']) {
      const element = kind === 'accepted'
        ? context.QuestAcceptanceModal({ acceptance: { id: '1', name: 'Trouble at the Docks', body, commands: [] }, onClose() {} })
        : context.QuestCompletionModal({ completion: { id: '1', name: 'Trouble at the Docks', body, rewards: {} }, onClose() {} })
      const html = renderToStaticMarkup(element)
      assert.match(html, /<span style="color:#00ffff">First paragraph\./i)
      assert.match(html, /First paragraph\.\n\nSecond paragraph\./i)
      assert.doesNotMatch(html, /<p>C|\\tC|<script>/)
      assert.match(html, /Plain paragraph\. &lt;script&gt;/)
    }
  }
  const standalone = renderToStaticMarkup(React.createElement(React.Fragment, null, context.renderWebTextBlocks('Uncolored next result.')))
  assert.doesNotMatch(standalone, /color:/)
})


test('modal prose reflows source lines while preserving every blank line and colors', () => {
  const input = '\tC  First line\r\n  continues here.\r\n\r\n\r\nSecond paragraph\ncontinues.\tn\n \nLast paragraph.'
  const text = context.reflowModalText(input)
  assert.match(text, /First line continues here\.\n\n\nSecond paragraph continues\./)
  assert.match(text, /\n\nLast paragraph\.$/)
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, context.renderWebTextBlocks(input)))
  assert.match(html, /modal-flow-text/)
  assert.match(html, /color:#00ffff/i)
  assert.match(html, /First line continues here\.\n\n\nSecond paragraph continues\./)
  assert.doesNotMatch(html, /<pre|\\tC/)
  assert.equal(context.reflowModalText('\n\nLeading\nwrapped\n\n'), '\n\nLeading wrapped\n\n')
})

test('quest journal details use the same flowing paragraph renderer', () => {
  const quest = context.parseQuestEntries([{ vnum: 100, name: 'Quest', description: 'A summary\nwrapped by the server.', info: 'Journal line\ncontinues.\n\nNew paragraph.' }])[0]
  const html = renderToStaticMarkup(context.QuestDetailsModal({ quest, onClose() {} }))
  assert.match(html, /A summary wrapped by the server\./)
  assert.match(html, /Journal line continues\.\n\nNew paragraph\./)
  assert.doesNotMatch(html, /<pre/)
})

test('creation prompts decode tab colors and link controls in actual and escaped forms', () => {
  for (const tab of ['\t', String.raw`\t`]) {
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, context.renderWebTextBlocks(
      `Did I get that right, Stanky (${tab}(Y${tab})/${tab}(N${tab}))?\n\n${tab}RRed${tab}n ${tab}[F055]Cyan${tab}n`,
    )))
    assert.match(html, /Stanky \(Y\/N\)\?/)
    assert.match(html, /color:#ff0000/i)
    assert.match(html, /color:#00ffff/i)
    assert.doesNotMatch(html, /\t|\\t/)
  }
  assert.equal(context.convertLuminariColorCodes('\t\t'), '\t')
  assert.equal(context.convertLuminariColorCodes('\t[x1.0]\t<send href="yes">Yes\t</send>'), 'Yes')
  assert.equal(context.convertLuminariColorCodes('\t[u9731/snow]'), '☃')
})

test('creator ability lists keep individual entries while reflowing their continuations', () => {
  const input = '\tWRacial Abilities:\tn\n\nSeafaring:          - +2 to swim checks.\nMinotaur Toughness: - +2 to intimidation\nchecks.\nTough Hide:         - +1 to armor class (natural ac bonus).\nInfravision:        - limited vision when without light.'
  const text = context.reflowModalText(input)
  assert.match(text, /swim checks\.\nMinotaur Toughness:/)
  assert.match(text, /intimidation checks\.\nTough Hide:/)
  assert.match(text, /bonus\)\.\nInfravision:/)
  assert.match(text, /Abilities:.*\n\nSeafaring:/)
  assert.equal(context.reflowModalText('Class features:\n- First benefit\n  continues here.\n- Second benefit\n\nNext paragraph\nwraps here.'),
    'Class features:\n- First benefit continues here.\n- Second benefit\n\nNext paragraph wraps here.')
  assert.equal(context.reflowModalText('Choices:\n1. First\n2. Second\n• Third'), 'Choices:\n1. First\n2. Second\n• Third')
})

test('class help preserves statistics, abilities and proficiencies on separate lines', () => {
  const input = '>Class Abilities:\n\nBardic Knowledge\nPerform\nArcane Casting (Compose)\n\n>Alignment: Any\n>Hit Dice: 3-6 Per Level\n>Skill Points: Int Modifier x 4 at 1st level,\n8 + Int Modifier each additional level\n>Proficiencies:\nAdvanced Weapon Proficiency\nLight Armor Proficiency\n\nSee also: CLASSES'
  const text = context.reflowModalText(input)
  assert.match(text, /Bardic Knowledge\nPerform\nArcane Casting/)
  assert.match(text, />Alignment: Any\n>Hit Dice: 3-6 Per Level\n>Skill Points:/)
  assert.match(text, /1st level, 8 \+ Int Modifier each additional level\n>Proficiencies:\nAdvanced Weapon Proficiency\nLight Armor Proficiency/)
})

test('racial ability descriptions remove column padding and join wrapped text', () => {
  const input = '\tC>Racial Abilities:\tn\n\nUltravision:           - Can see in the dark.\nCowardly:              - Can flee regardless                          of movement speed\n                          and no move action needed to flee.\nGrubby:                - Resists poison,\n                          disease and water damage.\n\n>Other Info:\nKeep   spacing here.'
  const text = context.reflowModalText(input)
  assert.match(text, /Ultravision: - Can see in the dark\.\nCowardly: - Can flee regardless of movement speed and no move action needed to flee\.\nGrubby: - Resists poison, disease and water damage\./)
  assert.match(text, /\n\n>Other Info:\nKeep   spacing here\./)
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, context.renderWebTextBlocks(input)))
  assert.match(html, /color:#00ffff/i)
  assert.doesNotMatch(html, /Cowardly: {2}|regardless {2}/)
})

test('race and class info preserve whitespace and decorative lines while parsing colors safely', () => {
  const body = '\tC>Racial Abilities:\tn\n\nAbility:         - First line\n                   continuation\n--------------------\n<script> & text'
  const html = renderToStaticMarkup(context.renderCreationInfo(body))
  assert.match(html, /<pre class="creation-info-text">/)
  assert.match(html, /color:#00ffff/i)
  assert.match(html, /Ability:         - First line\n                   continuation\n--------------------/)
  assert.match(html, /&lt;script&gt; &amp; text/)
  assert.doesNotMatch(html, /<script>|modal-flow-text/)
})


test('structured lore and score render native fields without parsing terminal text', () => {
  const info = context.parseHelpInfo({ id: 'structured-1', topic: 'Test', body: 'Fallback only', fields: [
    { section: 'Combat', label: 'Armor class', value: '17' },
    { section: 'Combat', label: 'Unsafe', value: '<script>bad</script>' },
    { section: 'Broken', label: 4, value: 'ignored' },
  ] })
  assert.equal(info.fields.length, 2)
  const html = renderToStaticMarkup(context.StructuredInfo({ help: info }))
  assert.match(html, /<h3>Combat<\/h3>/)
  assert.match(html, /<dt>Armor class<\/dt><dd>17<\/dd>/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|Broken/)
  assert.match(html, /Full command output/)
})

test('who cards respect omitted anonymous fields and escape server names', () => {
  const info = context.parseHelpInfo({ id: 'who-structured', topic: 'Who', body: '', players: [
    { name: 'an unknown traveler', role: 'Player' },
    { name: '<img src=x>', role: 'Player', level: 12, race: 'Human', faction: 'Adventurer', afk: true },
    { name: 7 },
  ] })
  assert.equal(info.players.length, 2)
  const html = renderToStaticMarkup(context.StructuredInfo({ help: info }))
  assert.match(html, /2 visible players/)
  assert.match(html, /an unknown traveler/)
  assert.match(html, /Level 12/)
  assert.match(html, /AFK/)
  assert.doesNotMatch(html, /<img|Level undefined|Level 0/)
  assert.match(html, /&lt;img/)
})
