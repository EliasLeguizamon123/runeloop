import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; variant?: 'primary' | 'secondary' | 'ghost' }

export function Button({ asChild = false, variant = 'primary', className = '', ...props }: Props) {
  const Component = asChild ? Slot : 'button'
  return <Component data-slot="button" className={`button button-${variant} ${className}`} {...props} />
}
