import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const server = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}
function serverFixture() {
  let now = 0, tick, cleared = false
  const socket = new EventEmitter()
  Object.assign(socket, { readyState: 1, pings: 0, terminations: 0,
    ping() { this.pings++ }, terminate() { this.terminations++ } })
  const context = vm.createContext({ WebSocket: { OPEN: 1 }, Date: { now: () => now },
    WEB_SOCKET_PING_INTERVAL_MS: 15_000, WEB_SOCKET_PONG_TIMEOUT_MS: 90_000,
    setInterval(callback) { tick = callback; return 1 }, clearInterval() { cleared = true },
    console: { warn() {} },
  })
  vm.runInContext(ts.transpile(extract(server, 'startWebSocketHeartbeat')), context)
  const stop = context.startWebSocketHeartbeat(socket)
  return { socket, stop, cleared: () => cleared, tickAt(time) { now = time; tick() } }
}

test('idle sockets remain connected through automatic pong replies', () => {
  const f = serverFixture()
  for (let time = 15_000; time <= 600_000; time += 15_000) {
    f.tickAt(time)
    f.socket.emit('pong')
  }
  assert.equal(f.socket.terminations, 0)
  assert.equal(f.socket.pings, 40)
})

test('browser heartbeat or commands prove liveness even without control pongs', () => {
  const f = serverFixture()
  for (let time = 15_000; time <= 600_000; time += 15_000) {
    f.tickAt(time)
    if (time % 60_000 === 0) f.socket.emit('message', '{"type":"heartbeat"}')
  }
  assert.equal(f.socket.terminations, 0)
  f.stop()
  assert.equal(f.cleared(), true)
  assert.equal(f.socket.listenerCount('pong'), 0)
  assert.equal(f.socket.listenerCount('message'), 0)
})

test('truly unresponsive sockets expire, but a stalled host grants fresh response time', () => {
  const dead = serverFixture()
  for (let time = 15_000; time <= 105_000; time += 15_000) dead.tickAt(time)
  assert.equal(dead.socket.terminations, 1)
  const paused = serverFixture()
  paused.tickAt(15_000)
  paused.tickAt(300_000)
  assert.equal(paused.socket.terminations, 0)
  paused.socket.emit('pong')
  paused.tickAt(315_000)
  assert.equal(paused.socket.terminations, 0)
})

test('browser keeps the web transport alive and cleans up timers and resume listeners', () => {
  const windowEvents = new EventEmitter(), documentEvents = new EventEmitter()
  let tick, cleared = false
  const socket = { readyState: 1, sent: [], send(text) { this.sent.push(JSON.parse(text)) } }
  const context = vm.createContext({ WebSocket: { OPEN: 1 },
    window: { setInterval(callback, delay) { assert.equal(delay, 25_000); tick = callback; return 7 },
      clearInterval(timer) { assert.equal(timer, 7); cleared = true },
      addEventListener: windowEvents.on.bind(windowEvents), removeEventListener: windowEvents.off.bind(windowEvents) },
    document: { visibilityState: 'visible', addEventListener: documentEvents.on.bind(documentEvents), removeEventListener: documentEvents.off.bind(documentEvents) },
  })
  vm.runInContext(ts.transpile(extract(client, 'startBrowserHeartbeat')), context)
  const stop = context.startBrowserHeartbeat(socket)
  tick()
  windowEvents.emit('focus')
  windowEvents.emit('pageshow')
  documentEvents.emit('visibilitychange')
  assert.equal(socket.sent.length, 5)
  assert.ok(socket.sent.every((message) => message.type === 'heartbeat' && Object.keys(message).length === 1))
  context.document.visibilityState = 'hidden'
  documentEvents.emit('visibilitychange')
  socket.readyState = 3
  tick()
  assert.equal(socket.sent.length, 5)
  stop()
  assert.equal(cleared, true)
  assert.equal(windowEvents.eventNames().length, 0)
  assert.equal(documentEvents.eventNames().length, 0)
  assert.match(client, /stopHeartbeat = startBrowserHeartbeat\(socket\)/)
  assert.match(server, /message.type === 'heartbeat'\) \{\s*return/)
})
