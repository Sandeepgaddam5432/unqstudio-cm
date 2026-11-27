import { describe, expect, it } from 'vitest'
import { parseRoute } from './app'

describe('hash routing', () => {
  it('resolves Home, Projects, Chats and project routes', () => {
    expect(parseRoute('')).toEqual({ projectId: null, view: 'home' })
    expect(parseRoute('#/')).toEqual({ projectId: null, view: 'home' })
    expect(parseRoute('#/projects')).toEqual({ projectId: null, view: 'projects' })
    expect(parseRoute('#/chats?x=1')).toEqual({ projectId: null, view: 'chats' })
    expect(parseRoute('#/p/abc%20d')).toEqual({ projectId: 'abc d', view: 'home' })
    expect(parseRoute('#/projectsx').view).toBe('home')
  })
})
