import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Composer } from './Composer'
import { joinTranscript } from './useVoiceInput'
import { BUILTIN_SKILLS, filterSkillChoices, skillChoices } from '@/core/skills'
import { useComposerSkills } from '@/store/composerSkills'
import { userContextBlock } from '@/core/ai/userContext'

function Harness() {
  const [v, setV] = useState('')
  const [img, setImg] = useState<string[]>([])
  return <Composer value={v} onChange={setV} images={img} onImages={setImg} onSubmit={() => {}} mode="build" onMode={() => {}} />
}

describe('skills + voice helpers', () => {
  it('lists built-in skills and filters as you type', () => {
    const all = skillChoices([])
    expect(all.length).toBe(BUILTIN_SKILLS.length)
    expect(filterSkillChoices(all, 'supa')[0]?.id).toBe('builtin:fullstack-supabase')
    expect(filterSkillChoices(all, 'zzzzqq')).toEqual([])
  })
  it('joins interim speech onto the existing text with spacing', () => {
    expect(joinTranscript('hello', 'there ', 'wor')).toBe('hello there wor')
    expect(joinTranscript('', '', '')).toBe('')
    expect(joinTranscript('a ', 'b', '')).toBe('a b')
  })
  it('injects the attached skills into the system context for that request', () => {
    expect(userContextBlock({ instructions: '', memory: [], skills: [], turnSkills: [{ name: 'Dark mode', content: 'Add dark mode' }] })).toContain('Active skills for THIS request')
  })
})

describe('Composer v3.2', () => {
  beforeEach(() => useComposerSkills.setState({ picked: [] }))
  it('opens the / skills popover and attaches a removable skill pill', () => {
    render(<Harness />)
    const ta = screen.getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '/dark', selectionStart: 5 } })
    fireEvent.keyUp(ta, { target: { selectionStart: 5 } })
    expect(document.querySelector('[data-slash-menu]')).toBeTruthy()
    fireEvent.pointerDown(document.querySelector('[data-skill-option="builtin:dark"]')!)
    expect(document.querySelector('[data-skill-pill="builtin:dark"]')).toBeTruthy()
    expect(ta.value).toBe('')
    fireEvent.click(screen.getByLabelText('Remove skill Dark mode'))
    expect(document.querySelector('[data-skill-pill]')).toBeNull()
  })
  it('renders the 2-row layout: plus + mic, mode pill, model pill, circular send', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Add')).toBeTruthy(); expect(screen.getByLabelText('Voice input')).toBeTruthy(); expect(screen.getByLabelText('Mode').textContent).toContain('Build'); expect(screen.getByLabelText('Send')).toBeTruthy()
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).placeholder).toBe('Ask for a change... (@ files, / skills)')
  })
})
