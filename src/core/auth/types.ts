export type AuthProviderId = 'google' | 'github'

export interface AuthProfile { name: string; email?: string; avatar?: string; login?: string }

export interface AuthSession {
  provider: AuthProviderId
  token: string
  /** epoch ms; Google access tokens last ~1h, GitHub OAuth tokens do not expire. */
  expiresAt?: number
  profile: AuthProfile
}

/** Port implemented by each optional sign-in method. Guest mode never needs one. */
export interface IAuthProvider {
  readonly id: AuthProviderId
  isConfigured(): Promise<boolean>
  signIn(): Promise<AuthSession>
  signOut(): Promise<void>
  getSession(): AuthSession | null
}

export type SyncDirection = 'push' | 'pull'
