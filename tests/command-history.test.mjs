import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the actual input handler, keeping React state between key events.
function fixture(history, draft = '') {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('  function handleCommandKeyDown(')
  const end = source.indexOf('\n  function updateAlias(', start)
  const context = vm.createContext({ commandHistory: history, command: draft,
    historyIndex: null, historyDraft: '',
  })
  context.setCommand = value => { context.command = value }
  context.setHistoryIndex = value => { context.historyIndex = value }
  context.setHistoryDraft = value => { context.historyDraft = value }
  vm.runInContext(ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 }), context)
  return {
    key(key, modifiers = {}) {
      let prevented = false
      context.handleCommandKeyDown({ key, ...modifiers, preventDefault() { prevented = true } })
      return prevented
    },
    edit(text) { context.command = text; context.historyIndex = null; context.historyDraft = text },
    get command() { return context.command },
  }
}

test('Up finds newest matching prefix and keeps that prefix for older matches', () => {
  const f = fixture(['reload bow', 'look', 'reload crossbow', 'score'], 'reload')
  assert.equal(f.key('ArrowUp'), true)
  assert.equal(f.command, 'reload crossbow')
  f.key('ArrowUp'); assert.equal(f.command, 'reload bow')
  f.key('ArrowUp'); assert.equal(f.command, 'reload bow')
  f.key('ArrowDown'); assert.equal(f.command, 'reload crossbow')
  f.key('ArrowDown'); assert.equal(f.command, 'reload')
  assert.equal(f.key('ArrowDown'), false)
})

test('empty draft browses all commands and is restored after Down', () => {
  const f = fixture(['look', 'score'])
  f.key('ArrowUp'); assert.equal(f.command, 'score')
  f.key('ArrowUp'); assert.equal(f.command, 'look')
  f.key('ArrowDown'); assert.equal(f.command, 'score')
  f.key('ArrowDown'); assert.equal(f.command, '')
})

test('matching ignores case and outer whitespace, preserving original draft', () => {
  const f = fixture(['say reload', ' Reload Crossbow ', 'look'], '  RELOAD ')
  f.key('ArrowUp'); assert.equal(f.command, ' Reload Crossbow ')
  f.key('ArrowDown'); assert.equal(f.command, '  RELOAD ')
})

test('no matches and empty history leave typed text unchanged', () => {
  for (const history of [[], ['look', 'say reload']]) {
    const f = fixture(history, 'reload')
    f.key('ArrowUp'); assert.equal(f.command, 'reload')
    f.key('ArrowDown'); assert.equal(f.command, 'reload')
  }
})

test('editing recalled text starts a new prefix search; modified arrows are ignored', () => {
  const f = fixture(['reload bow', 'look statue', 'reload crossbow'], 'reload')
  f.key('ArrowUp'); f.edit('look')
  f.key('ArrowUp'); assert.equal(f.command, 'look statue')
  f.key('ArrowDown'); assert.equal(f.command, 'look')
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    assert.equal(f.key('ArrowUp', { [modifier]: true }), false)
    assert.equal(f.command, 'look')
  }
})

test('Tab completion continues to select the latest prefix match', () => {
  const f = fixture(['reload bow', 'reload crossbow', 'look'], 'reload')
  assert.equal(f.key('Tab'), true)
  assert.equal(f.command, 'reload crossbow')
})
