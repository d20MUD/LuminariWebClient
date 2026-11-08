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
const variables = { helpInfo: 'HELP_INFO', questInfo: 'QUEST_INFO', graphicMap: '', wildernessGraphicMap: '', minimap: '' }

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
