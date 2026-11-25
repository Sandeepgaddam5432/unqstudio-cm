import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-fg text-bg hover:opacity-90 active:opacity-80',
  accent: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'bg-subtle text-fg border border-line hover:border-line-strong hover:bg-raised',
  ghost: 'text-muted hover:text-fg hover:bg-subtle',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
}
const sizes: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-md',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background,opacity,transform,border-color,color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        active && 'bg-subtle text-fg',
        className,
      )}
      {...rest}
    />
  )
})
