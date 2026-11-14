import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { StringDecoder } from 'node:string_decoder'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const server = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
const shared = readFileSync(new URL('../shared/clan-progress.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '')
const contentShared = readFileSync(new URL('../shared/clan-content.ts', import.meta.url), 'utf8').replaceAll('export ', '')
const servicesComponent = readFileSync(new URL('../src/ClanServices.tsx', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '')
const mud = readFileSync(new URL('../shared/mud.ts', import.meta.url), 'utf8').replaceAll('export ', '')
const component = readFileSync(new URL('../src/ClanPanel.tsx', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '')
const report = JSON.parse(readFileSync(new URL('fixtures/clan-progress.json', import.meta.url), 'utf8'))
const wire = Buffer.from(readFileSync(new URL('fixtures/clan-progress.msdp.b64', import.meta.url), 'utf8').trim(), 'base64')
function extract(name) { const start = server.indexOf(`function ${name}(`); return server.slice(start, server.indexOf('\n}', start) + 2) }
const ctx = vm.createContext({ React, ...Object.fromEntries(['useState', 'useRef', 'useEffect', 'useMemo'].map((k) => [k, React[k]])), sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, crypto: { getRandomValues: (a) => a.fill(17) }, Buffer, StringDecoder,
  setInterval, clearInterval, setTimeout, clearTimeout,
  IAC: 255, DONT: 254, DO: 253, WONT: 252, WILL: 251, SB: 250, SE: 240,
  TELOPT_MSDP: 69, MSDP_VAR: 1, MSDP_VAL: 2, MSDP_ARRAY_OPEN: 5, MSDP_ARRAY_CLOSE: 6, MSDP_TABLE_OPEN: 3, MSDP_TABLE_CLOSE: 4,
  CONTROL_BYTES: new Set([1,2,3,4,5,6]), REQUIRED_MSDP_VARIABLES: [], WEB_CLIENT_NAME: 'LuminariWebClient',
})
const parser = server.slice(server.indexOf('class TelnetParser'), server.indexOf('function isValidAutoLoginValue'))
vm.runInContext(ts.transpile(`${mud}\n${contentShared}\n${shared}\n${parser}\n${['parseMsdpPayload','readValue','readScalar','normalizeScalar','getConfiguredMsdpVariables','resolveMsdpVariableKey','mapMsdpUpdate'].map(extract).join('\n')}\n${servicesComponent}\n${component}\nglobalThis.Parser = TelnetParser;globalThis.variableMap = defaultMsdpVariables`, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }), ctx)
const plain = (o) => JSON.parse(JSON.stringify(o))
const clone = () => structuredClone(report)
function nodes(node, predicate) { if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((c) => nodes(c, predicate))] }

test('actual C MSDPSend frame survives fragmented telnet, mapping and normalization', () => {
  const events = [], parser = new ctx.Parser({ write() {} }, { onText() {}, onMsdp: (key, value) => events.push([key, value]), onMsdpReady() {} })
  for (let i = 0; i < wire.length; i += 11) parser.push(wire.subarray(i, i + 11))
  assert.equal(events.length, 1)
  assert.equal(events[0][0], 'CLAN_PROGRESS')
  const state = ctx.mapMsdpUpdate(...events[0], ctx.variableMap)
  assert.deepEqual(plain(state.clanProgress), plain(ctx.parseClanProgress(report)))
  assert.equal(state.clanProgress.favor.eighths, '801')
  const remapped = ctx.normalizeMsdpVariableMap({ clanProgress: ' clan_progress ' })
  assert.equal(remapped.clanProgress, 'clan_progress')
  assert.equal(ctx.mapMsdpUpdate('CLAN_PROGRESS', events[0][1], remapped).clanProgress.status, 'ready')
})

test('only Krynn subscribes, including configuration refresh and copyover renegotiation', () => {
  const variables = ctx.normalizeMsdpVariableMap({})
  for (const [starWars, help, krynn] of [[false,false,false],[false,true,false],[true,true,true]]) assert.equal(ctx.getConfiguredMsdpVariables(variables,starWars,help,krynn).includes('CLAN_PROGRESS'),false)
  assert.equal(ctx.getConfiguredMsdpVariables(variables,false,true,true).includes('CLAN_PROGRESS'),true)
  assert.match(server, /getConfiguredMsdpVariables\(this.msdpVariables, this.starWarsMode, this.helpModalsEnabled, this.isKrynnConnection\)/)
  assert.match(server, /state: \{ clanProgress: null \}/)
})

test('missing, old, oversized and malformed reports clear actions without throwing', () => {
  for (const value of [undefined, null, '{broken', {}, { ...report, version: 2 }, 'x'.repeat(49153)]) assert.equal(ctx.parseClanProgress(value), null)
  const bad = clone(); bad.buffs[0].tiers[0].slots[0].replace_activation_uid = 'x\nquit'; assert.equal(ctx.parseClanProgress(bad), null)
  const badInt = clone(); badInt.clan.influence_eighths = 9007199254740992; assert.equal(ctx.parseClanProgress(badInt), null)
  const denied = clone(); denied.may_manage = false; assert.equal(ctx.parseClanProgress(denied), null)
  assert.equal(ctx.mapMsdpUpdate('CLAN_PROGRESS','{broken',ctx.variableMap).clanProgress,null)
  assert.equal(ctx.parseClanProgress({ version: 1, status: 'non_member', reason: 'Accepted membership required.', server_time: 1 }).status,'non_member')
})

test('exact eighth-point currencies and plain escaped labels remain safe', () => {
  assert.equal(ctx.clanPoints('801'),'100.125')
  assert.equal(ctx.clanPoints('9007199254740993'),'1125899906842624.125')
  const value = clone(); value.clan.name='\tR<script>alert(1)</script>\tn';value.buffs[0].name='\u001b[31m<img src=x onerror=evil>';value.next_unlocks[0].name='<svg onload=evil>'
  const html=renderToStaticMarkup(React.createElement(ctx.ClanPanel,{value,connected:true,receivedAt:Date.now(),onAction(){}}))
  assert.match(html,/Lifetime Influence/);assert.match(html,/Influence/);assert.match(html,/100\.125/);assert.match(html,/Next unlocks/)
  assert.doesNotMatch(html,/<script>|<img|<svg/);assert.match(html,/&lt;script&gt;/)
})

test('readonly, disconnected, unavailable and stale panels do not enable actions', () => {
  const value=clone();value.may_manage=false
  for(const b of value.buffs){b.cancel.enabled=false;b.cancel.reasons=['Permission required.'];for(const t of b.tiers)for(const s of t.slots){s.enabled=false;s.reasons=['Permission required.']}}
  let html=renderToStaticMarkup(React.createElement(ctx.ClanPanel,{value,connected:true,receivedAt:Date.now(),onAction(){}}))
  assert.match(html,/delegated rank/);assert.doesNotMatch(html,/<button(?![^>]*disabled)[^>]*>Review activation/)
  html=renderToStaticMarkup(React.createElement(ctx.ClanPanel,{value:report,connected:true,receivedAt:0,onAction(){}}));assert.match(html,/Actions are paused/)
  html=renderToStaticMarkup(React.createElement(ctx.ClanPanel,{value:report,connected:false,onAction(){}}));assert.doesNotMatch(html,/Lifetime Influence/)
  html=renderToStaticMarkup(React.createElement(ctx.ClanPanel,{value:{version:1,status:'unavailable',reason:'Storage unavailable',server_time:1},connected:true,onAction(){}}));assert.match(html,/Storage unavailable/);assert.doesNotMatch(html,/<button/)
})

test('buff intents whitelist commands and retain exact original retry identity', () => {
  const view=ctx.parseClanProgress(report), op='f'.repeat(32)
  const intent=ctx.newBuffIntent(view,1,1,1,'activate',op)
  assert.ok(intent)
  const command=ctx.buffIntentCommand(intent)
  assert.equal(command,`clan buffs activate 1 1 1 ${op} ${report.clan.uid}`)
  assert.equal(ctx.buffIntentCommand(JSON.parse(JSON.stringify(intent))),command)
  assert.equal(ctx.buffIntentCommand({...intent,activation:'x\nquit'}),null)
  assert.equal(ctx.buffIntentCommand({...intent,family:99}),null)
  assert.equal(ctx.buffIntentCommand({...intent,operation:'x\nquit'}),null)
  assert.equal(ctx.newBuffIntent({...view,may_manage:false},1,1,1,'activate',op),null)
  assert.equal(ctx.newBuffIntent(view,1,3,1,'activate',op),null)
})

test('confirmation double clicks and retries send the same receipt command', () => {
  const view=ctx.parseClanProgress(report), states=[], refs=[], storage=new Map(), sent=[]
  let stateIndex=0,refIndex=0
  ctx.sessionStorage={getItem:(k)=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:(k)=>storage.delete(k)}
  ctx.useState=(init)=>{const i=stateIndex++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],(v)=>{states[i]=v}]}
  ctx.useRef=(init)=>{const i=refIndex++;refs[i]??={current:init};return refs[i]}
  const render=()=>{stateIndex=0;refIndex=0;return ctx.ClanDetails({view,fresh:true,onAction:(s)=>sent.push(s)})}
  let panel=render(),card=nodes(panel,(n)=>typeof n.type==='function'&&n.type.name==='BuffCard')[0]
  card.props.onChoose(1,1,1,'activate')
  panel=render();const confirm=nodes(panel,(n)=>n.type==='button'&&React.Children.toArray(n.props.children).join('')==='Confirm activation')[0]
  confirm.props.onClick();confirm.props.onClick();assert.equal(sent.length,1)
  panel=render();nodes(panel,(n)=>n.type==='button'&&n.props.children==='Retry same operation')[0].props.onClick()
  assert.equal(sent[1],sent[0]);assert.equal(storage.size,1)
  // A remount recovers the original intent from session storage.
  states.length=0;refs.length=0;panel=render();nodes(panel,(n)=>n.type==='button'&&n.props.children==='Retry same operation')[0].props.onClick();assert.equal(sent[2],sent[0])
  ctx.useState=React.useState;ctx.useRef=React.useRef
})

test('compact layout wraps and narrows without HTML insertion paths', () => {
  const css=readFileSync(new URL('../src/App.css',import.meta.url),'utf8')
  assert.match(css,/@media \(max-width: 480px\).*\.clan-balances/s)
  assert.match(css,/\.clan-choices.*flex-wrap: wrap/s)
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
  assert.match(app, /tab.id !== 'clan'/);assert.doesNotMatch(component,/dangerouslySetInnerHTML/)
})

test('service commands accept only fixed verbs and validated identities', () => {
  const a = { kind: 'delivery_confirm', id: 'a'.repeat(32), enabled: true, label: 'Claim', reasons: [] }
  assert.equal(ctx.clanServiceCommand(a), `clan deliveries confirm ${a.id}`)
  assert.equal(ctx.clanServiceCommand({ ...a, id: 'a'.repeat(32) + '\nquit' }), null)
  assert.equal(ctx.clanServiceCommand({ ...a, kind: 'raw', id: 'clan award 10000' }), null)
  assert.equal(ctx.clanServiceCommand({ ...a, kind: 'quartermaster_buy', id: 'field-map\nquit' }), null)
  assert.equal(ctx.clanServiceCommand({ ...a, kind: 'quartermaster_confirm', id: 'field-map', token: 'b'.repeat(32) }), `clan quartermaster confirm field-map ${'b'.repeat(32)}`)
  assert.equal(ctx.clanServiceCommand({ ...a, kind: 'quartermaster_confirm', id: 'field-map', token: '0'.repeat(32) }), null)
  assert.equal(ctx.clanServiceCommand({ ...a, kind: 'expedition_claim' }), `clan expeditions claim ${a.id}`)
})

test('actual production service report retains saved progress, locks and safe rendering', () => {
  const input = JSON.parse(readFileSync(new URL('fixtures/clan-services.json', import.meta.url), 'utf8'))
  const view = ctx.parseClanProgress(input)
  assert.equal(view?.content?.context_ready, true)
  assert.equal(view.content.contracts[1].active.progress, 7)
  assert.equal(view.content.expedition.active.objectives[0].progress, 1)
  assert.equal(view.content.expedition.active.personal_required, 11)
  assert.equal(view.content.quartermaster.choices.length, 7)
  const html = renderToStaticMarkup(React.createElement(ctx.ClanServices, { content: view.content, fresh: true, onAction() {} }))
  assert.match(html, /Saved fresh base units/)
  assert.match(html, /7\/20/)
  assert.match(html, /final-event participation/)
  assert.match(html, /Favor is an eligibility requirement/)
  const stale = renderToStaticMarkup(React.createElement(ctx.ClanServices, { content: view.content, fresh: false, onAction() { throw Error('stale') } }))
  assert.equal((stale.match(/<button/g) ?? []).length, (stale.match(/<button disabled=""/g) ?? []).length)
  for (const mutate of [
    (c) => { c.quartermaster.choices[0].actions[0].kind = 'send_raw' },
    (c) => { c.contracts[0].notes = Array(17).fill('x') },
    (c) => { c.expedition.active.objectives[0].progress = -1 },
    (c) => { c.quartermaster.choices[0].actions[0].enabled = true; c.quartermaster.choices[0].actions[0].reasons = ['blocked'] },
  ]) {
    const bad = structuredClone(input); mutate(bad.content)
    const parsed = ctx.parseClanProgress(bad)
    assert.equal(parsed?.status, 'ready')
    assert.equal(parsed.content, undefined)
  }
  const absent = structuredClone(input); delete absent.content
  assert.equal(ctx.parseClanProgress(absent)?.status, 'ready')
})

test('service review sends the server-issued confirmation identity through the command callback', () => {
  const states = [], sent = []; let index = 0
  ctx.useState = (initial) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = v }] }
  const action = { kind: 'quartermaster_confirm', id: 'field-map', token: 'a'.repeat(32), enabled: true, reasons: [], label: 'Confirm purchase' }
  const render = (fresh = true) => { index = 0; return ctx.Actions({ actions: [action], fresh, onAction: (s) => sent.push(s) }) }
  const button = (tree) => nodes(tree, (n) => n.type === 'button')[0]
  button(render()).props.onClick(); assert.equal(sent.length, 0)
  const confirmed = button(render()); confirmed.props.onClick(); confirmed.props.onClick()
  assert.deepEqual(sent, Array(2).fill(`clan quartermaster confirm field-map ${action.token}`))
  assert.equal(button(render(false)).props.disabled, true)
  ctx.useState = React.useState
})
