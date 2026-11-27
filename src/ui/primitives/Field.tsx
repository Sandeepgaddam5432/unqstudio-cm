import { Children, type ChangeEvent, forwardRef, isValidElement, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'
import { SelectSheet, type SelectOption } from './SelectSheet'
import { cn } from '@/lib/cn'

const base =
  'w-full rounded-lg border border-line bg-subtle px-3 text-sm text-fg placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(base, 'h-9', className)} {...p} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(base, 'py-2 leading-relaxed resize-none', className)} {...p} />
})

/**
 * Custom select (no native OS dropdown). API-compatible with the old `<select>` wrapper: pass `<option>` / `<optgroup>`
 * children and an `onChange` that reads `e.target.value`.
 */
export function Select({ className, children, value, onChange, disabled, 'aria-label': ariaLabel }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value'> & { value?: string | number | readonly string[] }) {
  const options: SelectOption[] = []
  const walk = (nodes: ReactNode, group?: string) => Children.forEach(nodes, (n) => {
    if (!isValidElement(n)) return
    const props = n.props as { value?: string | number; children?: ReactNode; label?: string; disabled?: boolean }
    if (n.type === 'optgroup') walk(props.children, props.label)
    else if (n.type === 'option') {
      const label = typeof props.children === 'string' || typeof props.children === 'number' ? String(props.children) : props.children
      options.push({ value: String(props.value ?? label), label, group, disabled: props.disabled })
    }
  })
  walk(children)
  return <SelectSheet className={className} disabled={disabled} aria-label={ariaLabel ?? 'Select'} value={String(value ?? '')} options={options}
    onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)} />
}

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between', className)}>
      <label className="text-xs font-medium text-muted">{children}</label>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border border-line transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-subtle',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-4 bg-accent-fg' : 'bg-faint',
        )}
      />
    </button>
  )
}
