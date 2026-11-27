import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { matchesQuery, scoreModel, subsequence } from '@/core/ai/modelSearch'
import type { EnrichedModel } from '@/core/ai/modelFetcher'
import type { Registry, RegProvider } from '@/core/ai/modelsDev'
import { useModels } from '@/store/models'
import { modelKey, RECENT_MAX, useModelPrefs } from '@/store/modelPrefs'
import { useApp } from '@/store/app'
import { ModelPicker } from './ModelPicker'
import SettingsDrawer, { SETTINGS_GROUPS } from '@/ui/SettingsDrawer'

const M = (o: Partial<EnrichedModel> & { id: string }): EnrichedModel => ({ name: o.id, source: 'catalog', ...o })

describe('picker search — fuzzy + capability keywords', () => {
  const gpt = M({ id: 'gpt-5', name: 'GPT-5', vision: true, reasoning: true, tool_call: true, cost: { input: 1.25, output: 10 } })
  const free = M({ id: 'meta/llama-3.3:free', name: 'Llama 3.3 (free)', cost: { input: 0, output: 0 } })
  it('matches name, id and provider', () => {
    expect(matchesQuery(gpt, 'OpenAI', 'gpt')).toBe(true); expect(matchesQuery(gpt, 'OpenAI', 'openai')).toBe(true); expect(matchesQuery(gpt, 'OpenAI', 'claude')).toBe(false)
  })
  it('understands vision / reasoning / tools / free', () => {
    expect(matchesQuery(gpt, 'OpenAI', 'vision')).toBe(true); expect(matchesQuery(gpt, 'OpenAI', 'reasoning tools')).toBe(true); expect(matchesQuery(gpt, 'OpenAI', 'free')).toBe(false)
    expect(matchesQuery(free, 'X', 'free')).toBe(true); expect(matchesQuery(free, 'X', 'vision')).toBe(false); expect(matchesQuery(M({ id: 'a' }), 'X', 'tools')).toBe(false)
  })
  it('combines terms and tolerates punctuation / subsequences', () => {
    expect(matchesQuery(gpt, 'OpenAI', 'gpt5 vision')).toBe(true); expect(matchesQuery(gpt, 'OpenAI', 'gpt5 free')).toBe(false)
    expect(matchesQuery(M({ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }), 'Anthropic', 'clsonnet')).toBe(true); expect(subsequence('abc', 'a1b2c3')).toBe(true); expect(subsequence('abd', 'abc')).toBe(false)
  })
  it('ranks exact < prefix < substring < fuzzy', () => {
    const m = M({ id: 'gpt-5', name: 'GPT-5' })
    expect([scoreModel(m, 'gpt-5'), scoreModel(m, 'gpt'), scoreModel(m, 't-5'), scoreModel(m, 'g5')]).toEqual([0, 1, 2, 3])
  })
})

describe('favorites & recents store', () => {
  beforeEach(() => { localStorage.clear(); useModelPrefs.setState({ favorites: [], recents: [] }) })
  it('stars/unstars and persists', () => {
    useModelPrefs.getState().toggleFavorite('openai', 'gpt-5'); expect(useModelPrefs.getState().isFavorite('openai', 'gpt-5')).toBe(true)
    expect(localStorage.getItem('unq.modelPrefs.v1')).toContain(modelKey('openai', 'gpt-5'))
    useModelPrefs.getState().toggleFavorite('openai', 'gpt-5'); expect(useModelPrefs.getState().favorites).toEqual([])
  })
  it('keeps only the last 3 recents, most recent first, no duplicates', () => {
    const s = useModelPrefs.getState()
    for (const m of ['a', 'b', 'c', 'd', 'b']) s.pushRecent('p', m)
    expect(useModelPrefs.getState().recents).toEqual(['p::b', 'p::d', 'p::c']); expect(RECENT_MAX).toBe(3)
  })
})

const bigRegistry = (): Registry => ({ version: 1, generatedAt: 't', source: 'x', providers: Array.from({ length: 320 }, (_, i): RegProvider => ({
  id: `prov${i}`, name: `Provider ${i}`, api: `https://p${i}.example.com/v1`, logo: '', kind: 'openai', compat: 'browser-ready',
  models: Array.from({ length: 30 }, (_, j) => ({ id: `model-${i}-${j}`, name: `Model ${i}-${j}`, context: 128000, vision: j % 2 === 0, reasoning: j % 3 === 0 })),
})) })

describe('ModelPicker (virtualized)', () => {
  beforeEach(() => { localStorage.clear(); useModelPrefs.setState({ favorites: [], recents: [] }); useModels.setState({ registry: bigRegistry(), registryStatus: 'ready', syncedAt: Date.now() }) })

  it('renders every filter pill and the Add Custom Provider footer', () => {
    render(<ModelPicker close={() => {}} />)
    for (const n of ['Recommended', 'Configured', 'Favorites ⭐', 'Custom', 'All Providers']) expect(screen.getByRole('tab', { name: n })).toBeTruthy()
    expect(screen.getByTestId('picker-add-custom')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Refresh Catalog' })).toBeTruthy()
  })

  it('All Providers: 300+ providers but only a window of DOM rows', () => {
    const { container } = render(<ModelPicker close={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'All Providers' }))
    const heads = container.querySelectorAll('[data-provider-group]').length
    expect(heads).toBeGreaterThan(5); expect(heads).toBeLessThan(60)
    const h = Number((container.querySelector('#mp-rows') as HTMLElement).style.height.replace('px', ''))
    expect(h).toBeGreaterThan(320 * 30)
  })

  it('searching 9.6k models yields a capped, windowed result list with capability filtering', async () => {
    const { container } = render(<ModelPicker close={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'All Providers' }))
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'model vision reasoning' } })
    await waitFor(() => expect(container.querySelectorAll('[data-model-row]').length).toBeGreaterThan(0))
    expect(container.querySelectorAll('[data-model-row]').length).toBeLessThan(60)
    expect(screen.getByText(/results? \(showing 300\)/)).toBeTruthy()
  })

  it('starring a model persists it and lists it under Favorites', async () => {
    const { container } = render(<ModelPicker close={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'All Providers' }))
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'Model 3-4' } })
    await waitFor(() => expect(container.querySelector('[data-model-row="prov3::model-3-4"]')).toBeTruthy())
    fireEvent.click(within(container.querySelector('[data-model-row="prov3::model-3-4"]') as HTMLElement).getByRole('button', { name: /Star Model 3-4/ }))
    expect(useModelPrefs.getState().favorites).toEqual(['prov3::model-3-4'])
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites ⭐' }))
    await waitFor(() => expect(container.querySelector('[data-model-row="prov3::model-3-4"]')).toBeTruthy())
  })

  it('empty Favorites tab explains how to add one', () => {
    render(<ModelPicker close={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Favorites ⭐' }))
    expect(screen.getByText(/Star ⭐ any model/)).toBeTruthy()
  })
})

describe('Settings drawer — categorised navigation', () => {
  it('exposes the 5 groups and 9 sections, mobile selector included', () => {
    expect(SETTINGS_GROUPS.map((g) => g.label)).toEqual(['AI & Models', 'Workspace', 'Account', 'Integrations', 'System'])
    expect(SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.label))).toEqual(['Providers Hub', 'Prompt Rules', 'Chat & Editor', 'Appearance', 'Sign In & Cloud Sync', 'Connections', 'Plugins & MCP', 'Data & Storage', 'Debug & Logs'])
    act(() => useApp.setState({ settingsOpen: true, settingsTab: 'appearance' }))
    render(<SettingsDrawer />)
    expect(screen.getByRole('tab', { name: 'Appearance', selected: true })).toBeTruthy()
    expect(screen.getByLabelText('Settings section')).toBeTruthy()
    act(() => useApp.setState({ settingsOpen: false }))
  })
  it('legacy "general" id still resolves (to Chat & Editor)', () => {
    act(() => useApp.setState({ settingsOpen: true, settingsTab: 'general' }))
    render(<SettingsDrawer />)
    expect(screen.getByRole('tab', { name: 'Chat & Editor', selected: true })).toBeTruthy()
    act(() => useApp.setState({ settingsOpen: false }))
  })
})
