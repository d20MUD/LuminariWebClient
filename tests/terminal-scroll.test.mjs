import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function fixture() {
  let enabled = true
  let cleared = 0
  let nextFrame = 0
  let top = 600
  let observer
  const listeners = new Map()
  const frames = new Map()
  const viewport = {
    scrollHeight: 1000, clientHeight: 400,
    get scrollTop() { return top },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)) },
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type) { listeners.delete(type) },
  }
  const context = vm.createContext({ exports: {},
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
    ResizeObserver: class {
      constructor(callback) { observer = this; this.callback = callback; this.elements = [] }
      observe(element) { this.elements.push(element) }
      disconnect() { this.disconnected = true }
    },
  })
  const source = readFileSync(new URL('../src/terminal-scroll.ts', import.meta.url), 'utf8')
  vm.runInContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS }), context)
  const content = {}
  const controller = context.exports.createTerminalScrollController(viewport, content, {
    autoScrollEnabled: () => enabled, onBottom: () => { cleared++ },
  })
  return { viewport, controller, observer, frames, listeners,
    scrollTo(value) { viewport.scrollTop = value; listeners.get('scroll')?.() },
    flushFrame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback() },
    setEnabled(value) { enabled = value },
    cleared: () => cleared,
  }
}

test('new output follows across successive chunks and late wrapping', () => {
  const f = fixture()
  f.viewport.scrollHeight += 100
  assert.equal(f.controller.isFollowing(), true)
  f.controller.followOutput()
  assert.equal(f.viewport.scrollTop, 700)
  f.viewport.scrollHeight += 150
  f.flushFrame()
  assert.equal(f.viewport.scrollTop, 850)
  f.viewport.scrollHeight += 200
  f.observer.callback()
  assert.equal(f.viewport.scrollTop, 1050)
})

test('viewport resizing cannot be mistaken for scrolling up into history', () => {
  const f = fixture()
  f.viewport.clientHeight = 200
  f.listeners.get('scroll')()
  assert.equal(f.controller.isFollowing(), true)
  f.observer.callback()
  assert.equal(f.viewport.scrollTop, 800)
  assert.equal(f.observer.elements.length, 2)
})

test('manual scrollback survives output, resizes, and pending animation frames', () => {
  const f = fixture()
  f.scrollTo(300)
  assert.equal(f.controller.isFollowing(), false)
  f.viewport.scrollHeight += 200
  f.controller.followOutput()
  f.viewport.clientHeight = 200
  f.observer.callback()
  f.flushFrame()
  assert.equal(f.viewport.scrollTop, 300)
})

test('scrolling back to the bottom resumes following', () => {
  const f = fixture()
  f.scrollTo(300)
  f.scrollTo(600)
  assert.equal(f.controller.isFollowing(), true)
  f.viewport.scrollHeight += 200
  f.controller.followOutput()
  assert.equal(f.viewport.scrollTop, 800)
})

test('auto-scroll off stays put, but explicit jump still works', () => {
  const f = fixture()
  f.setEnabled(false)
  f.viewport.scrollHeight += 200
  f.controller.followOutput()
  f.observer.callback()
  f.flushFrame()
  assert.equal(f.viewport.scrollTop, 600)
  f.controller.jumpToBottom()
  assert.equal(f.viewport.scrollTop, 800)
  assert.equal(f.controller.isFollowing(), false)
})

test('cleanup removes observers, scroll listeners, and scheduled frames', () => {
  const f = fixture()
  assert.equal(f.frames.size, 1)
  f.controller.destroy()
  assert.equal(f.observer.disconnected, true)
  assert.equal(f.listeners.size, 0)
  assert.equal(f.frames.size, 0)
})
