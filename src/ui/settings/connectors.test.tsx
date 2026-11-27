import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConnectorsHub } from './ConnectorsHub'
import { useApp } from '@/store/app'
import { useConnectors, connectorDefs } from '@/store/connectors'
import { testCustom, testExtra, validateCustom } from '@/core/connectors'

describe('connectors core', () => {
  it('validates custom connectors and tests reachability', async () => {
    expect(validateCustom({ name: '', url: 'https://x.io' })).toBeTruthy(); expect(validateCustom({ name: 'a', url: 'ftp://x' })).toBeTruthy(); expect(validateCustom({ name: 'a', url: 'https://x.io' })).toBeNull()
    expect((await testCustom({ kind: 'rest', url: 'https://x.io', header: 'Authorization' }, 's', (async () => new Response('', { status: 200 })) as unknown as typeof fetch)).ok).toBe(true)
    expect((await testCustom({ kind: 'rest', url: 'https://x.io', header: 'X' }, '', (() => Promise.reject(new Error('x'))) as unknown as typeof fetch)).ok).toBe(false)
  })
  it('checks key formats for branded connectors', async () => {
    expect((await testExtra('stripe', { publishableKey: 'sk_live_x' })).ok).toBe(false)
    expect((await testExtra('stripe', { publishableKey: 'pk_test_abc123' })).ok).toBe(true)
    expect((await testExtra('resend', { apiKey: 're_abc' })).ok).toBe(true)
  })
  it('ships 14 branded connectors', () => { expect(connectorDefs().map((d) => d.id)).toEqual(expect.arrayContaining(['github', 'gitlab', 'cloudflare', 'netlify', 'vercel', 'supabase', 'firebase', 'stripe', 'neon', 'upstash', 'resend', 'clerk', 'openai', 'anthropic'])) })
})

describe('ConnectorsHub', () => {
  beforeEach(() => { useApp.setState({ sheet: 'connectors' }); useConnectors.setState({ custom: [], disabled: {} }) })
  it('shows official full-colour brand tiles and opens a credential form on Connect', () => {
    render(<ConnectorsHub />)
    fireEvent.click(screen.getByRole('tab', { name: 'All connectors' }))
    expect(document.querySelector('[data-brand-tile="stripe"] svg[data-brand-colour="#635BFF"]')).toBeTruthy()
    expect(document.querySelector('[data-brand-tile="supabase"] svg[data-brand-colour="#3FCF8E"]')).toBeTruthy()
    fireEvent.click(document.querySelector('[data-connector-connect="stripe"]')!)
    expect(screen.getByLabelText('Stripe Publishable key')).toBeTruthy()
  })
  it('adds a custom connector', async () => {
    render(<ConnectorsHub />)
    fireEvent.click(document.querySelector('[data-add-custom]')!)
    fireEvent.change(screen.getByLabelText('Connector name'), { target: { value: 'Billing API' } })
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://api.example.com' } })
    fireEvent.click(document.querySelector('[data-custom-save]')!)
    await screen.findByText('Billing API')
    expect(useConnectors.getState().custom).toHaveLength(1)
  })
})
