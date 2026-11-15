import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const helpers = readFileSync(new URL('../src/character-creation.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '')
const component = readFileSync(new URL('../src/CharacterCreation.tsx', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '')
let submitted = false
const context = vm.createContext({ TextEncoder, React, useEffect: () => {}, useRef: () => ({ current: null }), useState: (initial) => [typeof initial === 'boolean' ? submitted : initial, (value) => { if (typeof value === 'boolean') submitted = value }] })
vm.runInContext(ts.transpile(`${helpers}\n${component}`, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }), context)
const step = (overrides = {}) => context.parseCreationStep({ id: 'step-1', active: true, canBack: true, step: 'race', state: 32, name: 'Newname', title: 'Choose your race', body: 'Choose a race', choices: [{ value: 'human', label: 'Human', description: 'Versatile adventurers.' }], ...overrides })

test('creation choices are validated and never inferred from race/class prose', () => {
  assert.equal(context.parseCreationStep(undefined), null)
  assert.equal(context.parseCreationStep('{broken'), null)
  assert.equal(context.parseCreationStep({}), null)
  const creation = step({ body: 'Vampire\nLich\nHuman', choices: [{ value: 'human', label: 'Human' }, { value: 'human\nquit', label: 'Bad' }] })
  assert.equal(creation.choices.length, 1)
  submitted = false
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => React.createElement('p', null, text) }))
  assert.equal((html.match(/class="creation-choice-card"/g) ?? []).length, 1)
  assert.match(html, /\/creation\/races\/human.webp/)
  assert.match(html, /Only races available to your account/)
})

test('portrait choices submit exact server tokens and Previous sends the back action', () => {
  submitted = false
  const commands = []
  const panel = context.CharacterCreationPanel({ creation: step(), onRespond: (value) => commands.push(value), renderText: (text) => text })
  const grid = panel.props.children.find((child) => child?.props?.className === 'creation-choice-grid')
  grid.props.children.flat().filter(Boolean)[0].props.onClick()
  assert.deepEqual(commands, ['human'])
  submitted = false
  const backPanel = context.CharacterCreationPanel({ creation: step({ step: 'class' }), onRespond: (value) => commands.push(value), renderText: (text) => text })
  const navigation = backPanel.props.children.find((child) => child?.props?.className === 'creation-navigation')
  assert.equal(navigation.props.className, 'creation-navigation')
  navigation.props.children.props.onClick()
  assert.deepEqual(commands, ['human', '@creation-back'])
})

test('later setup steps and editors remain usable through the UI', () => {
  const choices = context.creationPromptChoices('\tC1) Hair style\tn\n(A) Return to menu\n[2] Eye color')
  assert.deepEqual([...choices].map((choice) => choice.value), ['1', 'A', '2'])
  submitted = false
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation: step({ step: 'editor', choices: [], body: 'Use /s to save', canBack: false }), onRespond() {}, renderText: (text) => React.createElement('p', null, text) }))
  assert.match(html, /textarea/)
  assert.doesNotMatch(html, /Use \/s to save/)
  assert.doesNotMatch(html, /creation-previous/)
})

test('reference portrait aliases resolve to downloaded assets', () => {
  for (const [kind, name] of [['race', 'Human'], ['race', 'Gnome'], ['race', 'Kender'], ['class', 'Warrior'], ['class', 'Wizard']]) {
    const path = context.creationPortrait(kind, name)
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), path)
  }
})


test('confirmation buttons and Previous share one compact row without a duplicate input form', () => {
  submitted = false
  const creation = step({ step: 'confirm', state: 3, choices: [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }] })
  const panel = context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text })
  const row = panel.props.children.find((child) => child?.props?.className?.includes('creation-choice-list-compact'))
  assert.ok(row)
  const buttons = row.props.children.flat().filter(Boolean)
  assert.equal(buttons.length, 3)
  assert.match(buttons[0].props.children, /Previous/)
  assert.equal(buttons[1].props.children[1].props.children, 'Yes')
  const html = renderToStaticMarkup(panel)
  assert.doesNotMatch(html, /<form|Or enter a response/)
})


test('name criteria are highlighted guidance rather than selectable menu actions', () => {
  submitted = false
  const body = "Naming guidelines:\n1. Do not use everyday names.\n2.'Exotic' names may be acceptable.\n2. Do not use deity names.\n3. Avoid famous fictional characters.\n4. Fit the fantasy theme.\n\nWhat will your new character be called?"
  const creation = step({ step: 'name', state: 2, canBack: false, choices: [], body })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => React.createElement('span', null, text) }))
  assert.match(html, /<ol class="creation-name-guidelines"/)
  assert.equal((html.match(/<li>/g) ?? []).length, 5)
  assert.equal((html.match(/<button/g) ?? []).length, 1)
  assert.match(html, /type="submit"/)
  assert.doesNotMatch(html, /creation-choice-list/)
  assert.equal((html.match(/Do not use everyday names/g) ?? []).length, 1)
  assert.match(html, /What will your new character be called/)
})

test('race cards omit summaries and class cards sort alphabetically without changing commands', () => {
  submitted = false
  const raceHtml = renderToStaticMarkup(context.CharacterCreationPanel({ creation: step(), onRespond() {}, renderText: (text) => text }))
  assert.doesNotMatch(raceHtml, /Versatile adventurers|creation-choice-description/)
  const creation = step({ step: 'class', choices: [{ value: 'warrior-token', label: 'Warrior', description: 'Warrior summary' }, { value: 'bard-token', label: 'Bard', description: 'Bard summary' }] })
  const commands = []
  const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
  const cards = panel.props.children.find((child) => child?.props?.className === 'creation-choice-grid').props.children.flat().filter(Boolean)
  assert.equal(cards[0].props.children[1].props.children, 'Bard')
  cards[0].props.onClick()
  assert.deepEqual(commands, ['bard-token'])
  const confirmation = renderToStaticMarkup(context.CharacterCreationPanel({ creation: step({ step: 'confirm', title: 'Confirm your class', body: 'Bard help and abilities', choices: [{ value: 'y', label: 'Yes', description: '' }] }), onRespond() {}, renderText: (text) => text }))
  assert.match(confirmation, /Bard help and abilities/)
  assert.equal(creation.choices[0].label, 'Warrior')
})


test('portrait selection has no free-text input and review steps return focus to the heading', () => {
  for (const kind of ['race', 'class', 'confirm']) {
    submitted = false
    const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation: step({ step: kind }), onRespond() {}, renderText: (text) => text }))
    assert.doesNotMatch(html, /<input|<form|Or enter a response|autoFocus/i)
    assert.match(html, /creation-previous/)
  }
  const dialog = { scrollTop: 900 }
  let focused = false
  const effects = []
  context.useRef = () => ({ current: {
    closest: () => dialog,
    querySelector: () => ({ focus: (options) => { focused = options.preventScroll } }),
  } })
  context.useEffect = (effect) => effects.push(effect)
  try {
    context.CharacterCreationPanel({ creation: step({ step: 'confirm', title: 'Confirm your class' }), onRespond() {}, renderText: (text) => text })
    effects.forEach((effect) => effect())
    assert.equal(dialog.scrollTop, 0)
    assert.equal(focused, true)
  } finally {
    context.useRef = () => ({ current: null })
    context.useEffect = () => {}
  }
})


test('roleplay status offers all three server actions as buttons without a response field', () => {
  const creation = step({ step: 'roleplay', state: 80, canBack: false, title: 'Choose your roleplay status', choices: [
    { value: '1', label: 'Non-role-player', description: 'Enter the game.' },
    { value: '2', label: 'Role-player', description: 'Add roleplay details.' },
    { value: '3', label: 'Decide later', description: 'Choose later.' },
  ] })
  for (let index = 0; index < 3; index++) {
    submitted = false
    const commands = []
    const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
    const row = panel.props.children.find((child) => child?.props?.className?.includes('creation-choice-list-compact'))
    const buttons = row.props.children.flat().filter(Boolean)
    assert.equal(buttons.length, 3)
    buttons[index].props.onClick()
    assert.deepEqual(commands, [String(index + 1)])
    const html = renderToStaticMarkup(panel)
    assert.doesNotMatch(html, /<form|<input/)
    assert.match(html, /Non-role-player/)
    assert.match(html, /Role-player/)
    assert.match(html, /Decide later/)
  }
})

test('character options show menu buttons without repeated terminal prose or response field', () => {
  submitted = false
  const tokens = [...'0123456789ABCDQ']
  const body = "You've elected to be a role-player.\n---CHARACTER OPTIONS MENU---\n" + tokens.map((token) => `\tW${token})\tC Option ${token}.\tn`).join('\n')
  const creation = step({ step: 'options', state: 62, body, choices: [] })
  const commands = []
  const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
  const html = renderToStaticMarkup(panel)
  assert.doesNotMatch(html, /elected to be|CHARACTER OPTIONS MENU|<article|<form|<input/)
  assert.match(html, /creation-options-menu/)
  const row = panel.props.children.find((child) => child?.props?.className?.includes('creation-options-menu'))
  const buttons = row.props.children.flat().filter(Boolean)
  assert.equal(buttons.length, 16)
  buttons.at(-1).props.onClick()
  assert.deepEqual(commands, ['Q'])
  submitted = false
  const fallback = renderToStaticMarkup(context.CharacterCreationPanel({ creation: step({ step: 'options', state: 62, choices: [], body: 'Please select again.' }), onRespond() {}, renderText: (text) => text }))
  assert.match(fallback, /Please select again/)
  assert.doesNotMatch(fallback, /<input|<form|Or enter a response/)
})

test('race and class help use the original-format renderer only for their help states', () => {
  for (const state of [36, 38]) {
    submitted = false
    const original = 'Ability:          - First line\n                    continuation\n\nNext ability.'
    const preserved = []
    const html = renderToStaticMarkup(context.CharacterCreationPanel({
      creation: step({ step: 'confirm', state, body: original, choices: [] }), onRespond() {},
      renderText: (text) => text,
      renderInfo: (text) => { preserved.push(text); return React.createElement('pre', null, text) },
    }))
    assert.deepEqual(preserved, [original])
    assert.match(html, /Ability:          - First line\n                    continuation\n\nNext ability\./)
  }
})

test('short description features, adjectives and review actions use server buttons without command input', () => {
  for (const state of [53, 54, 55, 56, 57, 58, 59]) {
    submitted = false
    const commands = []
    const creation = step({ step: 'short-description', state, canBack: false,
      descriptionPreview: 'a blue-eyed human <script>', body: '1) old text columns  2) old option',
      choices: [{ value: state === 53 || state === 58 ? '' : '12', label: state === 59 ? 'Save description' : 'Blue eyes' }] })
    const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => React.createElement('span', null, text) })
    const html = renderToStaticMarkup(panel)
    assert.match(html, /Your short description/)
    assert.match(html, /creation-descriptor-choices/)
    assert.match(html, /&lt;script&gt;/)
    assert.doesNotMatch(html, /<input|<form|<script>/)
    const buttons = panel.props.children.find((child) => child?.props?.['data-creation-step'] === 'short-description')
    buttons.props.children.flat().filter(Boolean)[0].props.onClick()
    assert.deepEqual(commands, [creation.choices[0].value])
  }
})

test('short description options never fall back to parsing stale text columns', () => {
  submitted = false
  const creation = step({ step: 'short-description', state: 56, choices: [], body: '1) stale adjective' })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.doesNotMatch(html, /creation-choice-label|<input/)
})


test('all creation menus omit the generic command bar while name and editor keep dedicated fields', () => {
  for (const kind of ['options', 'gender', 'race', 'class', 'confirm', 'continue', 'roleplay', 'short-description']) {
    submitted = false
    const creation = step({ step: kind, state: 99, choices: [{ value: '1', label: 'Choose this' }] })
    const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
    assert.doesNotMatch(html, /<input|<form|Or enter a response|Your response/)
    assert.match(html, /Choose this/)
  }
  for (const kind of ['name', 'editor']) {
    submitted = false
    const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation: step({ step: kind, choices: [] }), onRespond() {}, renderText: (text) => text }))
    assert.match(html, kind === 'name' ? /Character name/ : /Choose your race/)
    assert.match(html, /<form/)
  }
})


test('legacy short-description states never parse two-column text into buttons or display raw menus', () => {
  submitted = false
  const creation = step({ step: 'options', state: 56, choices: [], body: '1) a big    2) a large\n3) a small' })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.doesNotMatch(html, /a big|a large|a small|Instructions and feedback|<input/)
  assert.match(html, /Waiting for descriptor choices/)
})


test('short description features and adjectives sort alphabetically while preserving server values', () => {
  for (const state of [54, 55, 56, 57]) {
    submitted = false
    const commands = []
    const creation = step({ step: 'short-description', state, canBack: false, choices: [
      { value: '8', label: 'Wavy' }, { value: '12', label: 'blue' }, { value: '3', label: 'Amber' },
    ] })
    const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
    const grid = panel.props.children.find((child) => child?.props?.['data-creation-step'] === 'short-description')
    const buttons = grid.props.children.flat().filter(Boolean)
    assert.deepEqual(buttons.map((button) => button.key), ['3', '12', '8'])
    buttons[0].props.onClick()
    assert.deepEqual(commands, ['3'])
  }
})


test('age cards separate ability adjustments from choice buttons and hide the terminal menu', () => {
  submitted = false
  const creation = step({ step: 'age', state: 75, body: 'RAW AGE MENU', choices: [{ value: '2', label: 'Adolescent', adjustments: [{ ability: 'Dexterity', modifier: 2 }, { ability: 'Wisdom', modifier: -1 }] }] })
  const commands = []
  const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
  const html = renderToStaticMarkup(panel)
  assert.doesNotMatch(html, /RAW AGE MENU/)
  assert.match(html, /<dt>Dexterity<\/dt><dd>\+2<\/dd>/)
  assert.match(html, /<button[^>]*>Choose Adolescent<\/button>/)
})

test('writing editors preload text and save through the dedicated editor action', () => {
  for (const state of [11, 60, 66, 68, 70, 72, 74]) {
    submitted = false
    const edits = []
    const creation = step({ step: 'editor', state, canBack: false, title: 'Bonds', editorText: 'First line\r\n/s is literal', editorMaxBytes: 4000, body: 'RAW EDITOR HELP', choices: [] })
    const panel = context.CharacterCreationPanel({ creation, onRespond() { assert.fail('editor content must not be sent as commands') }, onEdit: (...args) => edits.push(args), renderText: (text) => text })
    const html = renderToStaticMarkup(panel)
    assert.match(html, /First line\n\/s is literal/)
    assert.doesNotMatch(html, /RAW EDITOR HELP/)
    const form = panel.props.children.find((child) => child?.type === 'form')
    form.props.onSubmit({ preventDefault() {} })
    assert.deepEqual(edits, [['save', 'First line\n/s is literal']])
  }
})

const backgroundDetails = {
  name: 'entertainer', description: 'You thrive in front of an audience.',
  skills: [{ name: 'Acrobatics', bonus: 2 }, { name: 'Perform', bonus: 2 }],
  ability: 'Gain access to the entertain command, allowing performances for gold.',
}

test('background confirmation renders structured MSDP details instead of captured terminal output', () => {
  submitted = false
  const creation = step({ step: 'confirm', state: 64, body: 'RAW TERMINAL OUTPUT MUST NOT APPEAR', background: backgroundDetails,
    choices: [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }] })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.match(html, /entertainer background/)
  assert.match(html, /You thrive in front of an audience/)
  assert.match(html, /<h4>Skill bonuses<\/h4><ul><li>\+2 to Acrobatics<\/li><li>\+2 to Perform<\/li><\/ul>/)
  assert.match(html, /<h4>Special ability<\/h4>/)
  assert.match(html, /Gain access to the entertain command/)
  assert.doesNotMatch(html, /RAW TERMINAL OUTPUT/)
  assert.match(html, /Choose this background archetype\?/)
  assert.match(html, /Yes/); assert.match(html, /No/); assert.match(html, /Previous/)
})

test('background MSDP validation fails closed and safely escapes field content', () => {
  for (const background of [undefined, {}, { ...backgroundDetails, skills: [{ name: 'Bad', bonus: '2' }] }]) {
    const creation = step({ step: 'confirm', state: 64, background, body: '---ENTERTAINER BACKGROUND---\nSkill Bonuses: +2 to Acrobatics\nSpecial Ability: must not parse' })
    const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
    assert.match(html, /Waiting for background details from the game server/)
    assert.doesNotMatch(html, /must not parse|ENTERTAINER|Acrobatics/)
  }
  const creation = step({ step: 'confirm', state: 64, background: { ...backgroundDetails, name: '<img src=x onerror=evil>' } })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/)
})

test('character detail guidance and examples appear above the editor using MSDP fields', () => {
  const creation = step({ step: 'editor', state: 70, choices: [], title: 'Ideals', editorText: '',
    guidance: { description: 'Ideals are beliefs that guide your choices.', examples: ['Freedom: oppose tyranny.', 'Duty: keep your promises.'] } })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.match(html, /About this character detail/)
  assert.match(html, /Ideals are beliefs that guide your choices/)
  assert.match(html, /<li>Freedom: oppose tyranny\.<\/li>/)
  assert.match(html, /<li>Duty: keep your promises\.<\/li>/)
  assert.ok(html.indexOf('About this character detail') < html.indexOf('<textarea'))
  assert.equal(step({ guidance: { description: 'Wrong', examples: [123] } }).guidance, undefined)
})

test('clicking an already selected background displays the server reason without submitting again', () => {
  const previous = context.useState
  let feedback = '', commands = []
  context.useState = (initial) => [typeof initial === 'boolean' ? false : feedback, (value) => { feedback = value }]
  try {
    const creation = step({ step: 'options', state: 62, choices: [{ value: '3', label: 'Background archetype', blockedReason: 'You have already chosen a background archetype. Respec to choose another.' }] })
    const props = { creation, onRespond: (command) => commands.push(command), renderText: (text) => text }
    const panel = context.CharacterCreationPanel(props)
    const row = panel.props.children.find((child) => child?.props?.['data-creation-step'] === 'options')
    const button = row.props.children.flat().find((child) => child?.props?.title?.includes('already chosen'))
    assert.ok(button)
    button.props.onClick()
    assert.deepEqual(commands, [])
    const html = renderToStaticMarkup(context.CharacterCreationPanel(props))
    assert.match(html, /role="alert">You have already chosen a background archetype/)
    assert.doesNotMatch(html, /Waiting for server/)
  } finally { context.useState = previous }
})

test('homeland choices come only from MSDP and submit exact region IDs', () => {
  submitted = false
  const commands = []
  const creation = step({ step: 'homeland', state: 51, body: '1) Abanasinia 2) Balifor\n10) Khur 11) Lemish',
    choices: [{ value: '1', label: 'Abanasinia' }, { value: '4', label: 'Blood Sea Isles' }] })
  const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
  const html = renderToStaticMarkup(panel)
  assert.match(html, /creation-homeland-choices/)
  assert.doesNotMatch(html, /Balifor|Khur|Lemish|1\) Abanasinia/)
  const row = panel.props.children.find((child) => child?.props?.['data-creation-step'] === 'homeland')
  row.props.children.flat().find((child) => Array.isArray(child?.props?.children) && child.props.children.some((label) => label?.props?.children === 'Blood Sea Isles')).props.onClick()
  assert.deepEqual(commands, ['4'])
  const empty = step({ step: 'homeland', state: 51, body: '1) Fake parsed choice', choices: [] })
  const emptyHtml = renderToStaticMarkup(context.CharacterCreationPanel({ creation: empty, onRespond() {}, renderText: (text) => text }))
  assert.match(emptyHtml, /Waiting for homeland choices/)
  assert.doesNotMatch(emptyHtml, /Fake parsed choice/)
})

test('homeland review renders structured history and language with safe confirmation buttons', () => {
  submitted = false
  const creation = step({ step: 'confirm', state: 52, body: 'RAW TERMINAL REGION REPORT', choices: [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }],
    homeland: { name: 'Blood Sea Isles', language: 'Kalinese', description: 'Island history from the game data. <script>evil</script>' } })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.match(html, /Homeland details/); assert.match(html, /Blood Sea Isles/)
  assert.match(html, /Language: <\/strong>Kalinese/)
  assert.match(html, /Island history from the game data/)
  assert.match(html, /Choose this homeland\?/)
  assert.doesNotMatch(html, /RAW TERMINAL REGION REPORT|<script>/)
  assert.match(html, /&lt;script&gt;/)
  assert.equal(step({ homeland: { name: 'Bad', language: 10 } }).homeland, undefined)
})

test('faction cards open an information modal before submitting the exact server ID', () => {
  const previous = context.useState
  const states = []; let index = 0
  context.useState = (initial) => {
    const slot = index++
    if (!(slot in states)) states[slot] = initial
    return [states[slot], (value) => { states[slot] = value }]
  }
  try {
    const commands = []
    const creation = step({ step: 'faction', state: 76, body: 'RAW FACTION MENU', choices: [
      { value: '0', label: 'Adventurer / No faction', description: 'Choose your own allies.' },
      { value: '17', label: 'Dragonarmies', description: 'Structured faction history. <script>evil</script>' },
    ] })
    const props = { creation, onRespond: (value) => commands.push(value), renderText: (text) => text }
    const render = () => { index = 0; return context.CharacterCreationPanel(props) }
    let panel = render()
    const section = panel.props.children.find((child) => child?.props?.['aria-label'] === 'Faction selection')
    const html = renderToStaticMarkup(panel)
    assert.match(html, /creation-faction-grid/)
    assert.match(html, /aria-haspopup="dialog"/)
    assert.doesNotMatch(html, /Structured faction history|RAW FACTION MENU|<details/)
    section.props.children[2].props.children[1].props.onClick()
    assert.deepEqual(commands, [])
    panel = render()
    const openedSection = panel.props.children.find((child) => child?.props?.['aria-label'] === 'Faction selection')
    const modal = openedSection.props.children[3]
    assert.equal(modal.props.choice.value, '17')
    const modalHtml = renderToStaticMarkup(modal)
    assert.match(modalHtml, /<dialog/)
    assert.match(modalHtml, /Structured faction history/)
    assert.match(modalHtml, /Back to factions/)
    assert.match(modalHtml, /Choose Dragonarmies/)
    assert.match(modalHtml, /&lt;script&gt;/)
    assert.doesNotMatch(modalHtml, /<script>/)
    modal.props.onClose()
    assert.deepEqual(commands, [])
    const closed = render().props.children.find((child) => child?.props?.['aria-label'] === 'Faction selection')
    assert.equal(closed.props.children[3], null)
    closed.props.children[2].props.children[1].props.onClick()
    const reopened = render().props.children.find((child) => child?.props?.['aria-label'] === 'Faction selection')
    reopened.props.children[3].props.onChoose()
    assert.deepEqual(commands, ['17'])
  } finally { context.useState = previous }
})

test('missing faction MSDP choices never fall back to parsing the text menu', () => {
  submitted = false
  const creation = step({ step: 'faction', state: 76, choices: [], body: '1) Bogus parsed faction' })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  assert.match(html, /Waiting for faction choices from the game server/)
  assert.doesNotMatch(html, /Bogus parsed faction/)
})

test('hometown and deity selection use structured MSDP choices and exact IDs', () => {
  for (const [kind, state, choice] of [
    ['hometown', 77, { value: '3', label: 'Solace', description: 'A free city with no direct allegiances.' }],
    ['deity', 78, { value: '12', label: 'Paladine', alignment: 'Lawful Good', alignmentGroup: 'good', description: 'Good dragons, protection' }],
  ]) {
    submitted = false
    const commands = []
    const creation = step({ step: kind, state, body: 'RAW TERMINAL TABLE\n1) Bogus inferred choice', choices: [choice] })
    const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
    const html = renderToStaticMarkup(panel)
    assert.match(html, kind === 'deity' ? /creation-deity-columns/ : /creation-detail-choices/)
    assert.ok(html.includes(choice.label) && html.includes(choice.description))
    if (choice.alignment) assert.match(html, /Lawful Good/)
    assert.doesNotMatch(html, /RAW TERMINAL TABLE|Bogus inferred choice/)
    if (kind === 'deity') {
      const columns = panel.props.children.find((child) => child?.props?.['aria-label'] === 'Deities by alignment')
      columns.props.children[0][0].props.children[1][0].props.onClick()
    } else {
      const row = panel.props.children.find((child) => child?.props?.['data-creation-step'] === kind)
      row.props.children.flat().filter((child) => child?.props?.onClick).at(-1).props.onClick()
    }
    assert.deepEqual(commands, [choice.value])
    const empty = step({ step: kind, state, choices: [], body: '1) Bogus inferred choice' })
    const emptyHtml = renderToStaticMarkup(context.CharacterCreationPanel({ creation: empty, onRespond() {}, renderText: (text) => text }))
    assert.ok(emptyHtml.includes(`Waiting for ${kind} choices from the game server.`))
    assert.doesNotMatch(emptyHtml, /Bogus inferred choice/)
  }
})

test('deity review renders structured faith details safely and never parses the old report', () => {
  submitted = false
  const creation = step({ step: 'confirm', state: 79, body: 'RAW DEITY REPORT', choices: [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }],
    deity: { name: 'Paladine', pantheon: 'Gods of Light', alignment: 'Lawful Good', portfolio: 'Good dragons, protection', description: 'A deity description. <script>evil</script>' } })
  const html = renderToStaticMarkup(context.CharacterCreationPanel({ creation, onRespond() {}, renderText: (text) => text }))
  for (const value of ['Deity details', 'Gods of Light', 'Lawful Good', 'Good dragons, protection', 'A deity description.', 'Choose this deity?', 'Yes', 'No', 'Previous']) assert.ok(html.includes(value), value)
  assert.doesNotMatch(html, /RAW DEITY REPORT|<script>/)
  assert.match(html, /&lt;script&gt;/)
  const missing = step({ step: 'confirm', state: 79, deity: { name: 'Bad' }, body: 'RAW DEITY REPORT' })
  const missingHtml = renderToStaticMarkup(context.CharacterCreationPanel({ creation: missing, onRespond() {}, renderText: (text) => text }))
  assert.match(missingHtml, /Waiting for deity details from the game server/)
  assert.doesNotMatch(missingHtml, /RAW DEITY REPORT/)
})

test('deities use three MSDP alignment groups with alphabetized names and exact selection IDs', () => {
  submitted = false
  const commands = []
  const choices = [
    { value: '8', label: 'Zivilyn', alignmentGroup: 'neutral' },
    { value: '2', label: 'Takhisis', alignmentGroup: 'evil' },
    { value: '4', label: 'Paladine', alignmentGroup: 'good', alignment: 'Misleading display text' },
    { value: '9', label: 'Gilean', alignmentGroup: 'neutral' },
  ]
  const creation = step({ step: 'deity', state: 78, choices })
  const panel = context.CharacterCreationPanel({ creation, onRespond: (value) => commands.push(value), renderText: (text) => text })
  const columns = panel.props.children.find((child) => child?.props?.['aria-label'] === 'Deities by alignment').props.children[0]
  assert.deepEqual(Array.from(columns, (column) => column.props['aria-label']), ['Good deities', 'Neutral deities', 'Evil deities'])
  const labels = columns.map((column) => column.props.children[1].map((button) => button.props.children[0].props.children))
  assert.deepEqual(JSON.parse(JSON.stringify(labels)), [['Paladine'], ['Gilean', 'Zivilyn'], ['Takhisis']])
  columns[2].props.children[1][0].props.onClick()
  assert.deepEqual(commands, ['2'])
  assert.equal(step({ choices: [{ value: '1', label: 'Bad', alignmentGroup: 'unknown' }] }).choices[0].alignmentGroup, undefined)
})
