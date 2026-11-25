import { scaffoldFiles } from '@/core/vfs/scaffold'
import type { Template } from './types'

const APP = String.raw`export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">React + TypeScript + Tailwind</span>
      <h1 className="text-5xl font-semibold tracking-tight">Start something precise.</h1>
      <p className="text-muted">
        This is a blank canvas. Describe what you want in the chat, or edit <code className="rounded bg-surface px-1.5 py-0.5 text-sm">src/App.tsx</code> directly.
      </p>
      <button className="rounded-theme bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90">
        Get started
      </button>
    </main>
  )
}
`

export const blank: Template = {
  id: 'blank',
  name: 'Blank Starter',
  description: 'Clean React + TypeScript + Tailwind starter.',
  icon: 'square',
  tags: ['starter'],
  files: { ...scaffoldFiles('Blank Starter'), '/src/App.tsx': APP },
}
