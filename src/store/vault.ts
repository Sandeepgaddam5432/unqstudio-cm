import { create } from 'zustand'
import { Vault } from '@/core/ai/vault'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { useSettings } from './settings'

let _vault: Vault | null = null
export const vault = (): Vault => (_vault ??= new Vault(getAdapter()))

interface VaultState {
  ready: boolean
  encrypted: boolean
  locked: boolean
  rev: number
  unlockOpen: boolean
  init: () => Promise<void>
  unlock: (pass: string) => Promise<void>
  lock: () => void
  setSecret: (name: string, value: string) => Promise<void>
  removeSecret: (name: string) => Promise<void>
  enable: (pass: string) => Promise<void>
  disable: () => Promise<void>
  setUnlockOpen: (v: boolean) => void
}

const snap = () => ({ encrypted: vault().encrypted, locked: vault().locked })

export const useVault = create<VaultState>((set, get) => ({
  ready: false, encrypted: false, locked: false, rev: 0, unlockOpen: false,
  init: async () => {
    await vault().load()
    useSettings.getState().set({ vaultEncrypted: vault().encrypted })
    set({ ready: true, ...snap(), rev: get().rev + 1 })
  },
  unlock: async (pass) => { await vault().unlock(pass); set({ ...snap(), rev: get().rev + 1, unlockOpen: false }) },
  lock: () => { vault().lock(); set({ ...snap(), rev: get().rev + 1 }) },
  setSecret: async (name, value) => { await vault().set(name, value); set({ rev: get().rev + 1 }) },
  removeSecret: async (name) => { await vault().delete(name); set({ rev: get().rev + 1 }) },
  enable: async (pass) => { await vault().enableEncryption(pass); useSettings.getState().set({ vaultEncrypted: true }); set({ ...snap(), rev: get().rev + 1 }) },
  disable: async () => { await vault().disableEncryption(); useSettings.getState().set({ vaultEncrypted: false }); set({ ...snap(), rev: get().rev + 1 }) },
  setUnlockOpen: (unlockOpen) => set({ unlockOpen }),
}))

export const getSecret = (name: string) => vault().get(name)
export const providerSecretName = (providerId: string) => `provider:${providerId}`
