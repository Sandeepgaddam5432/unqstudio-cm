import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button, Input, Modal } from '@/ui/primitives'
import { useVault } from '@/store/vault'
import { toast } from '@/store/toast'

export function VaultUnlock() {
  const { unlockOpen, setUnlockOpen, unlock } = useVault()
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    try { await unlock(pass); setPass(''); setErr(''); toast.success('Vault unlocked') } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <Modal open={unlockOpen} onClose={() => setUnlockOpen(false)} size="sm" title={<span className="flex items-center gap-2"><Lock size={15} />Unlock key vault</span>} description="Enter your passphrase to decrypt your API keys for this session."
      footer={<><Button variant="ghost" onClick={() => setUnlockOpen(false)}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!pass}>Unlock</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Input autoFocus type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr('') }} placeholder="Passphrase" />
        {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      </form>
    </Modal>
  )
}
