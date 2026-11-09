import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8')
function extract(name) {
  const start = source.indexOf(`function ${name}(`)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}
const context = vm.createContext({ starWarsMsdpVariableKeys: [], REQUIRED_MSDP_VARIABLES: [] })
vm.runInContext(ts.transpile(['getConfiguredMsdpVariables', 'resolveMsdpVariableKey', 'mapMsdpUpdate'].map(extract).join('\n')), context)
const variables = { scoreInfo: 'SCORE_INFO', whoInfo: 'WHO_INFO', characterCreation: 'CHARACTER_CREATION', roomContents: 'ROOM_CONTENTS', questAccepted: 'QUEST_ACCEPTED', loreInfo: 'LORE_INFO', roomQuests: 'ROOM_QUESTS', questComplete: 'QUEST_COMPLETE', helpInfo: 'HELP_INFO', questInfo: 'QUEST_INFO', graphicMap: '', wildernessGraphicMap: '', minimap: '' }

test('help MSDP reports require explicit per-MUD enablement', () => {
  assert.equal(context.getConfiguredMsdpVariables(variables, false).includes('HELP_INFO'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes('HELP_INFO'), true)
  assert.equal(context.getConfiguredMsdpVariables(variables, true, false).includes('HELP_INFO'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, false).includes('QUEST_INFO'), true)
})

test('help responses preserve their JSON content through state mapping', () => {
  const payload = JSON.stringify({ id: '1', topic: 'fire', body: 'Help <script> text', truncated: false })
  const update = context.mapMsdpUpdate('HELP_INFO', payload, variables)
  assert.equal(update.helpInfo, payload)
})


test('completion events are subscribed with web modals and preserve payloads', () => {
  assert.equal(context.getConfiguredMsdpVariables(variables, false).includes('QUEST_COMPLETE'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes('QUEST_COMPLETE'), true)
  const payload = JSON.stringify({ id: 'done-1', name: 'Quest', body: 'Done', rewards: { Experience: 42 } })
  assert.equal(context.mapMsdpUpdate('QUEST_COMPLETE', payload, variables).questComplete, payload)
})


test('room quest availability is opt-in and survives state mapping', () => {
  assert.equal(context.getConfiguredMsdpVariables(variables, false).includes('ROOM_QUESTS'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes('ROOM_QUESTS'), true)
  const payload = JSON.stringify({ room: 1005, quests: [{ id: 100, name: 'Quest' }] })
  assert.equal(context.mapMsdpUpdate('ROOM_QUESTS', payload, variables).roomQuests, payload)
})


test('lore responses require web opt-in and preserve the complete output', () => {
  assert.equal(context.getConfiguredMsdpVariables(variables, false).includes('LORE_INFO'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes('LORE_INFO'), true)
  const payload = JSON.stringify({ id: 'lore-1', topic: 'guard', body: 'Name: Guard\nLevel: 10', truncated: false })
  assert.equal(context.mapMsdpUpdate('LORE_INFO', payload, variables).loreInfo, payload)
})


test('quest acceptance events are subscribed and mapped with completion events', () => {
  for (const variable of ['QUEST_ACCEPTED', 'QUEST_COMPLETE']) {
    assert.equal(context.getConfiguredMsdpVariables(variables, false).includes(variable), false)
    assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes(variable), true)
  }
  const payload = JSON.stringify({ id: 'accepted-1', name: 'Quest', body: 'Instructions', time: -1, commands: [] })
  assert.equal(context.mapMsdpUpdate('QUEST_ACCEPTED', payload, variables).questAccepted, payload)
})


test('Krynn room contents reports are subscribed and mapped intact', () => {
  assert.equal(context.getConfiguredMsdpVariables(variables, false).includes('ROOM_CONTENTS'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes('ROOM_CONTENTS'), true)
  const payload = JSON.stringify({ room: 1005, entries: [{ target: '}o100', kind: 'object', name: 'a sword', takeable: true }] })
  assert.equal(context.mapMsdpUpdate('ROOM_CONTENTS', payload, variables).roomContents, payload)
})


test('character creation is Krynn opt-in and preserves account-filtered choices', () => {
  assert.equal(context.getConfiguredMsdpVariables(variables, false).includes('CHARACTER_CREATION'), false)
  assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes('CHARACTER_CREATION'), true)
  const payload = JSON.stringify({ id: 'create-1', active: true, step: 'race', choices: [{ value: 'human', label: 'Human' }] })
  assert.equal(context.mapMsdpUpdate('CHARACTER_CREATION', payload, variables).characterCreation, payload)
})


test('score and who use opt-in MSDP reports and retain native records through the proxy', () => {
  for (const [key, variable] of [['scoreInfo', 'SCORE_INFO'], ['whoInfo', 'WHO_INFO']]) {
    assert.equal(context.getConfiguredMsdpVariables(variables, false, false).includes(variable), false)
    assert.equal(context.getConfiguredMsdpVariables(variables, false, true).includes(variable), true)
    const payload = JSON.stringify({ id: variable, topic: key, body: 'Fallback', fields: [{ section: 'Native', label: 'Value', value: '42' }], players: [] })
    assert.equal(context.mapMsdpUpdate(variable, payload, variables)[key], payload)
  }
})
