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
const context = vm.createContext({ React, useEffect: () => {}, useRef: () => ({ current: null }), useState: (initial) => [typeof initial === 'boolean' ? submitted : initial, (value) => { if (typeof value === 'boolean') submitted = value }] })
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
  assert.match(html, /Use \/s to save/)
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
  assert.match(fallback, /<input/)
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
