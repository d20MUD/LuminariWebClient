import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { creationNameGuidance, creationPortrait, creationPromptChoices } from './character-creation.ts'
import type { CreationStep } from './character-creation.ts'

export function CharacterCreationPanel({ creation, onRespond, renderText, renderInfo = renderText }: {
  creation: CreationStep; onRespond: (value: string) => void; renderText: (text: string) => ReactNode; renderInfo?: (text: string) => ReactNode
}) {
  const [response, setResponse] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const grid = creation.step === 'race' || creation.step === 'class'
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel || (!grid && creation.step !== 'confirm' && creation.step !== 'roleplay' && creation.state !== 62)) return
    const dialog = panel.closest('dialog')
    if (dialog) dialog.scrollTop = 0
    panel.querySelector<HTMLElement>('.creation-step-heading h2')?.focus({ preventScroll: true })
  }, [creation.id, creation.step, creation.state, grid])
  // Race/class choices always come from the authenticated server, never prompt inference.
  const reportedChoices = creation.step === 'name' ? [] : creation.choices.length || grid ? creation.choices : creationPromptChoices(creation.body)
  const choices = creation.step === 'class' ? [...reportedChoices].sort((a, b) => a.label.localeCompare(b.label)) : reportedChoices
  const characterOptions = creation.state === 62 && choices.length > 0
  const raceOrClassInfo = creation.state === 36 || creation.state === 38
  const nameGuidance = creation.step === 'name' ? creationNameGuidance(creation.body) : null
  const simpleChoice = characterOptions || ['confirm', 'gender', 'continue', 'roleplay'].includes(creation.step) || creation.state === 49 || creation.state === 37
  const send = (value: string) => { if (!submitted) { setSubmitted(true); onRespond(value) } }
  return <div ref={panelRef} className="character-creation-panel">
    <div className="creation-step-heading"><span>CREATE A CHARACTER</span><h2 tabIndex={-1}>{renderText(creation.title)}</h2>{creation.name ? <p>{renderText(creation.name)}</p> : null}</div>
    {grid ? <p>{creation.step === 'race' ? 'Only races available to your account are shown.' : 'Choose an eligible starting class for your character.'} Select a portrait to review the details before confirming.</p>
      : characterOptions ? null : <article className="help-details-body creation-prompt">{nameGuidance ? <>
          {renderText(nameGuidance.before)}
          {nameGuidance.criteria.length ? <ol className="creation-name-guidelines" aria-label="Character naming criteria">
            {nameGuidance.criteria.map((criterion, index) => <li key={index}>{renderText(criterion)}</li>)}
          </ol> : null}
          {nameGuidance.after ? renderText(nameGuidance.after) : null}
        </> : raceOrClassInfo ? renderInfo(creation.body) : renderText(creation.body)}</article>}
    {grid ? <details className="creation-feedback" open={/invalid|not a race|not a class|not unlocked|not available/i.test(creation.body)}><summary>Instructions and feedback</summary><article className="help-details-body">{renderText(creation.body)}</article></details> : null}
    {creation.state === 37 ? <p>Choosing an alignment creates your character. Use Previous to revise earlier choices first.</p> : null}
    {choices.length ? <div data-creation-step={creation.step} className={grid ? 'creation-choice-grid' : `creation-choice-list${simpleChoice ? ' creation-choice-list-compact' : ''}${characterOptions ? ' creation-options-menu' : ''}`}>
      {simpleChoice && creation.canBack ? <button type="button" className="creation-previous" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button> : null}
      {choices.map((choice) => <button type="button" key={choice.value} disabled={submitted} className={grid ? 'creation-choice-card' : ''} onClick={() => send(choice.value)}>
        {grid ? <img src={creationPortrait(creation.step, choice.label)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}
        <span className="creation-choice-label">{renderText(choice.label)}</span>
        {creation.step !== 'race' && choice.description ? <span className="creation-choice-description">{renderText(choice.description)}</span> : null}
      </button>)}
    </div> : null}
    {grid && !choices.length ? <p role="status">No eligible choices were reported. Use Previous to return to the preceding step.</p> : null}

    {grid && creation.canBack ? <div className="creation-navigation">
      <button type="button" className="creation-previous" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button>
    </div> : null}
    {!simpleChoice && !grid ? <form className="creation-response" onSubmit={(event) => { event.preventDefault(); send(response) }}>
      <label htmlFor="creation-response">{creation.step === 'name' ? 'Character name' : creation.step === 'editor' ? 'Text or editor command' : choices.length ? 'Or enter a response' : 'Your response'}</label>
      <div className={`creation-response-row${creation.step === 'editor' ? ' creation-response-editor' : ''}`}>
      {creation.step === 'editor'
        ? <textarea id="creation-response" rows={5} value={response} disabled={submitted} onChange={(event) => setResponse(event.target.value)} />
        : <input id="creation-response" value={response} disabled={submitted} autoComplete="off" maxLength={512} required={creation.step === 'name'} onChange={(event) => setResponse(event.target.value)} autoFocus />}
      <div className="creation-navigation">
        {creation.canBack ? <button type="button" className="creation-previous" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button> : null}
        <button type="submit" disabled={submitted}>{submitted ? 'Waiting…' : 'Continue'}</button>
      </div>
      </div>
    </form> : submitted ? <p role="status">Waiting for server…</p> : null}
    {creation.truncated ? <p>This response was shortened to the display limit.</p> : null}
  </div>
}
