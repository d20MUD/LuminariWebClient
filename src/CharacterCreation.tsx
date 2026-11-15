import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { creationNameGuidance, creationPortrait, creationPromptChoices } from './character-creation.ts'
import type { CreationChoice, CreationStep } from './character-creation.ts'

export function CharacterCreationPanel({ creation, onRespond, onEdit, renderText, renderInfo = renderText }: {
  creation: CreationStep; onEdit?: (action: 'save' | 'cancel', text: string) => void; onRespond: (value: string) => void; renderText: (text: string) => ReactNode; renderInfo?: (text: string) => ReactNode
}) {
  const [response, setResponse] = useState(creation.editorText?.replace(/\r\n?/g, '\n') ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [choiceFeedback, setChoiceFeedback] = useState('')
  const [factionInfoId, setFactionInfoId] = useState<string | null>(null)
  const shortDescription = creation.step === 'short-description' || (creation.state >= 53 && creation.state <= 59)
  const hometown = creation.state === 77 || creation.step === 'hometown'
  const deitySelection = creation.state === 78 || creation.step === 'deity'
  const deityReview = creation.state === 79
  const detailChoices = hometown || deitySelection
  const faction = creation.state === 76 || creation.step === 'faction'
  const homeland = creation.state === 51 || creation.step === 'homeland'
  const homelandReview = creation.state === 52
  const age = creation.step === 'age' || creation.state === 75
  const editor = creation.step === 'editor'
  const textEntry = creation.step === 'name' || creation.step === 'editor'
  const grid = creation.step === 'race' || creation.step === 'class'
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel || (!grid && creation.step !== 'confirm' && creation.step !== 'roleplay' && !shortDescription && creation.state !== 62)) return
    const dialog = panel.closest('dialog')
    if (dialog) dialog.scrollTop = 0
    panel.querySelector<HTMLElement>('.creation-step-heading h2')?.focus({ preventScroll: true })
  }, [creation.id, creation.step, creation.state, grid, shortDescription])
  // Race/class choices always come from the authenticated server, never prompt inference.
  const reportedChoices = creation.step === 'name' ? [] : creation.choices.length || grid || shortDescription || age || editor || homeland || homelandReview || faction || detailChoices || deityReview ? creation.choices : creationPromptChoices(creation.body)
  const choices = creation.step === 'class' || (shortDescription && creation.state >= 54 && creation.state <= 57) ? [...reportedChoices].sort((a, b) => a.label.localeCompare(b.label)) : reportedChoices
  const factionInfo = faction ? choices.find((choice) => choice.value === factionInfoId) : undefined
  const characterOptions = (creation.state === 62 || creation.state === 63) && choices.length > 0
  const raceOrClassInfo = creation.state === 36 || creation.state === 38
  const backgroundInfo = creation.state === 64 ? creation.background : undefined
  const nameGuidance = creation.step === 'name' ? creationNameGuidance(creation.body) : null
  const simpleChoice = !textEntry && !grid
  const textBytes = new TextEncoder().encode(response.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')).length
  const tooLong = editor && creation.editorMaxBytes !== undefined && textBytes > creation.editorMaxBytes
  const send = (value: string) => { if (!submitted) { setSubmitted(true); onRespond(value) } }
  return <div ref={panelRef} className="character-creation-panel">
    <div className="creation-step-heading"><span>CREATE A CHARACTER</span><h2 tabIndex={-1}>{renderText(creation.title)}</h2>{creation.name ? <p>{renderText(creation.name)}</p> : null}</div>
    {creation.guidance ? <aside className="creation-field-guidance" aria-label="About this character detail">
      <p>{renderText(creation.guidance.description)}</p>
      {creation.guidance.examples.length ? <><strong>Examples</strong><ul>{creation.guidance.examples.map((example, index) => <li key={index}>{renderText(example)}</li>)}</ul></> : null}
    </aside> : null}
    {choiceFeedback ? <p className="creation-choice-feedback" role="alert">{choiceFeedback}</p> : null}
    {grid ? <p>{creation.step === 'race' ? 'Only races available to your account are shown.' : 'Choose an eligible starting class for your character.'} Select a portrait to review the details before confirming.</p>
      : shortDescription || characterOptions || age || editor || homeland || homelandReview || faction || detailChoices || deityReview || creation.step === 'writing-intro' ? null : <article className="help-details-body creation-prompt">{nameGuidance ? <>
          {renderText(nameGuidance.before)}
          {nameGuidance.criteria.length ? <ol className="creation-name-guidelines" aria-label="Character naming criteria">
            {nameGuidance.criteria.map((criterion, index) => <li key={index}>{renderText(criterion)}</li>)}
          </ol> : null}
          {nameGuidance.after ? renderText(nameGuidance.after) : null}
        </> : creation.state === 64 ? backgroundInfo ? <section className="creation-background-info" aria-label="Background archetype details">
          <h3>{backgroundInfo.name} background</h3>
          <div className="creation-background-description">{renderText(backgroundInfo.description)}</div>
          <div className="creation-background-benefits">
            <section><h4>Skill bonuses</h4><ul>{backgroundInfo.skills.map((skill, index) => <li key={index}>{skill.bonus > 0 ? '+' : ''}{skill.bonus} to {renderText(skill.name)}</li>)}</ul></section>
            <section><h4>Special ability</h4>{renderText(backgroundInfo.ability)}</section>
          </div>
          <p className="creation-background-confirm">Choose this background archetype?</p>
        </section> : <p role="status">Waiting for background details from the game server.</p> : raceOrClassInfo ? renderInfo(creation.body) : renderText(creation.body)}</article>}
    {detailChoices ? <section className="creation-detail-intro" aria-label={hometown ? 'Hometown selection' : 'Deity selection'}>
      <p>{hometown ? 'Choose the city your character calls home.' : 'Choose a deity to review their faith and history before confirming.'}</p>
      {!choices.length ? <p role="status">Waiting for {hometown ? 'hometown' : 'deity'} choices from the game server.</p> : null}
    </section> : null}
    {deityReview ? creation.deity ? <section className="creation-deity-info" aria-label="Deity details">
      <h3>{renderText(creation.deity.name)}</h3>
      <dl><dt>Pantheon</dt><dd>{renderText(creation.deity.pantheon)}</dd>
        <dt>Alignment</dt><dd>{renderText(creation.deity.alignment)}</dd>
        <dt>Portfolio</dt><dd>{renderText(creation.deity.portfolio)}</dd></dl>
      <div>{renderText(creation.deity.description)}</div>
      <p className="creation-background-confirm">Choose this deity?</p>
    </section> : <p role="status">Waiting for deity details from the game server.</p> : null}
    {faction ? <section className="creation-faction-options" aria-label="Faction selection">
      <p>Select a card to learn about a faction before choosing.</p>
      {!choices.length ? <p role="status">Waiting for faction choices from the game server.</p> : null}
      <div className="creation-faction-grid">{choices.map((choice) => <button type="button" className="creation-faction-card" key={choice.value} disabled={submitted} aria-haspopup="dialog" onClick={() => setFactionInfoId(choice.value)}>
        <strong>{renderText(choice.label)}</strong>
        <span>View details</span>
      </button>)}</div>
      {factionInfo ? <FactionInfoModal choice={factionInfo} submitted={submitted} renderText={renderText} onClose={() => setFactionInfoId(null)} onChoose={() => { send(factionInfo.value); setFactionInfoId(null) }} /> : null}
    </section> : null}
    {deitySelection ? <section className="creation-deity-columns" aria-label="Deities by alignment">
      {(['good', 'neutral', 'evil'] as const).map((group) => <section className="creation-deity-column" aria-label={`${group[0].toUpperCase()}${group.slice(1)} deities`} key={group}>
        <h3>{group[0].toUpperCase() + group.slice(1)}</h3>
        {choices.filter((choice) => choice.alignmentGroup === group).sort((a, b) => a.label.localeCompare(b.label)).map((choice) => <button type="button" key={choice.value} disabled={submitted} title={choice.alignment} onClick={() => send(choice.value)}>
          <span className="creation-choice-label">{renderText(choice.label)}</span>
          <span className="creation-choice-description">{renderText(choice.description)}</span>
        </button>)}
      </section>)}
      {choices.some((choice) => !choice.alignmentGroup) ? <p className="creation-deity-pending" role="status">Waiting for deity alignment data from the game server.</p> : null}
    </section> : null}
    {homeland ? <section className="creation-homeland-intro" aria-label="Homeland selection">
      <p>Select a region to review its history and language before confirming.</p>
      {!choices.length ? <p role="status">Waiting for homeland choices from the game server.</p> : null}
    </section> : null}
    {homelandReview ? creation.homeland ? <section className="creation-homeland-info" aria-label="Homeland details">
      <h3>{renderText(creation.homeland.name)}</h3>
      <p><strong>Language: </strong>{renderText(creation.homeland.language)}</p>
      <div>{renderText(creation.homeland.description)}</div>
      <p className="creation-background-confirm">Choose this homeland?</p>
    </section> : <p role="status">Waiting for homeland details from the game server.</p> : null}
    {shortDescription ? <section className="creation-description-builder" aria-label="Short description">
      {creation.descriptionPreview ? <div className="creation-description-preview"><span>Your short description</span><p>{renderText(creation.descriptionPreview)}</p></div> : null}
      <p>{creation.state === 54 || creation.state === 55 ? 'Choose a feature to describe.'
        : creation.state === 56 || creation.state === 57 ? 'Choose the description that best fits your character.'
        : creation.state === 59 ? 'Save your description, start over, or add another feature if available.'
        : 'Continue to choose or review your description.'}</p>
      {creation.body.split(/\r?\n/).filter((line) => /out of range|cannot select|not a valid|cannot cancel/i.test(line)).map((line, index) => <p role="alert" key={index}>{renderText(line)}</p>)}
      {!choices.length ? <p role="status">Waiting for descriptor choices from the game server.</p> : null}
    </section> : null}
    {grid ? <details className="creation-feedback" open={/invalid|not a race|not a class|not unlocked|not available/i.test(creation.body)}><summary>Instructions and feedback</summary><article className="help-details-body">{renderText(creation.body)}</article></details> : null}
    {creation.state === 37 ? <p>Choosing an alignment creates your character. Use Previous to revise earlier choices first.</p> : null}
    {age ? <section className="creation-age-options" aria-label="Character age">
      <p>Choose your character's age. Numerical ages vary by race. Adjustments apply during first-level study; later changes require a respec.</p>
      <div className="creation-age-grid">{choices.map((choice) => <section key={choice.value} className="creation-age-card">
        <h3>{choice.label}</h3>
        <dl>{choice.adjustments?.map((adjustment) => <div key={adjustment.ability}><dt>{adjustment.ability}</dt><dd>{adjustment.modifier > 0 ? '+' : ''}{adjustment.modifier}</dd></div>)}</dl>
        <button type="button" disabled={submitted} onClick={() => send(choice.value)}>Choose {choice.label}</button>
      </section>)}</div>
      {creation.canBack ? <button type="button" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button> : null}
    </section> : null}
    {choices.length && !age && !editor && !faction && !deitySelection ? <div data-creation-step={creation.step} className={grid ? 'creation-choice-grid' : `creation-choice-list${simpleChoice ? ' creation-choice-list-compact' : ''}${characterOptions ? ' creation-options-menu' : ''}${shortDescription ? ' creation-descriptor-choices' : ''}${homeland ? ' creation-homeland-choices' : ''}${detailChoices ? ' creation-detail-choices' : ''}`}>
      {simpleChoice && creation.canBack ? <button type="button" className="creation-previous" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button> : null}
      {choices.map((choice) => <button type="button" key={choice.value} disabled={submitted} className={grid ? 'creation-choice-card' : ''} title={choice.blockedReason} aria-disabled={submitted || !!choice.blockedReason} onClick={() => { if (choice.blockedReason) setChoiceFeedback(choice.blockedReason); else { setChoiceFeedback(''); send(choice.value) } }}>
        {grid ? <img src={creationPortrait(creation.step, choice.label)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}
        <span className="creation-choice-label">{renderText(choice.label)}</span>
        {choice.alignment ? <span className="creation-choice-alignment">{renderText(choice.alignment)}</span> : null}
        {creation.step !== 'race' && choice.description ? <span className="creation-choice-description">{renderText(choice.description)}</span> : null}
      </button>)}
    </div> : null}
    {grid && !choices.length ? <p role="status">No eligible choices were reported. Use Previous to return to the preceding step.</p> : null}

    {(grid || faction || deitySelection || (!textEntry && !choices.length)) && creation.canBack ? <div className="creation-navigation">
      <button type="button" className="creation-previous" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button>
    </div> : null}
    {textEntry ? <form className="creation-response" onSubmit={(event) => { event.preventDefault(); if (editor) { if (!tooLong && onEdit) { setSubmitted(true); onEdit('save', response) } } else send(response) }}>
      <label htmlFor="creation-response">{creation.step === 'name' ? 'Character name' : creation.title}</label>
      <div className={`creation-response-row${creation.step === 'editor' ? ' creation-response-editor' : ''}`}>
      {creation.step === 'editor'
        ? <textarea id="creation-response" rows={12} value={response} disabled={submitted || creation.editorBusy} onChange={(event) => setResponse(event.target.value)} />
        : <input id="creation-response" value={response} disabled={submitted} autoComplete="off" maxLength={512} required={creation.step === 'name'} onChange={(event) => setResponse(event.target.value)} autoFocus />}
      <div className="creation-navigation">
        {creation.canBack ? <button type="button" className="creation-previous" disabled={submitted} onClick={() => send('@creation-back')}>← Previous</button> : null}
        {editor ? <button type="button" disabled={submitted || creation.editorBusy} onClick={() => { setSubmitted(true); onEdit?.('cancel', '') }}>Cancel</button> : null}
        <button type="submit" disabled={submitted || creation.editorBusy || tooLong}>{submitted || creation.editorBusy ? 'Saving…' : editor ? 'Save' : 'Continue'}</button>
      </div>
      </div>
      {editor ? <p role="status">{textBytes} / {creation.editorMaxBytes ?? '—'} bytes{tooLong ? ' — shorten your text before saving.' : ''}</p> : null}
      {creation.editorError ? <p role="alert">Your text could not be saved. Cancel to restore the previous version.</p> : null}
    </form> : submitted ? <p role="status">Waiting for server…</p> : null}
    {creation.truncated ? <p>This response was shortened to the display limit.</p> : null}
  </div>
}


function FactionInfoModal({ choice, submitted, renderText, onClose, onChoose }: {
  choice: CreationChoice; submitted: boolean; renderText: (text: string) => ReactNode; onClose: () => void; onChoose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { dialog?.close() }
  }, [])
  return <dialog ref={dialogRef} className="panel creation-faction-modal" aria-labelledby="creation-faction-info-title"
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onClose={(event) => { event.stopPropagation(); if (!event.currentTarget.open) onClose() }}
    onClick={(event) => {
      event.stopPropagation()
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <h2 id="creation-faction-info-title">{renderText(choice.label)}</h2>
    <article className="creation-faction-description">{renderText(choice.description)}</article>
    <footer>
      <button type="button" onClick={onClose} autoFocus>Back to factions</button>
      <button type="button" disabled={submitted} onClick={onChoose}>Choose {renderText(choice.label)}</button>
    </footer>
  </dialog>
}
