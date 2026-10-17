import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'rightElement'> {
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      showPasswordLabel = 'Show password',
      hidePasswordLabel = 'Hide password',
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);

    const toggleVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setShowPassword((prev) => !prev);
    };

    const currentLabel = showPassword ? hidePasswordLabel : showPasswordLabel;

    return (
      <Input
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        disabled={disabled}
        className={className}
        rightElement={
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={disabled}
            aria-label={currentLabel}
            title={currentLabel}
            tabIndex={0}
            className={cn(
              'p-1 rounded text-intel-muted hover:text-intel-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intel-accent transition-colors duration-150 select-none flex items-center justify-center',
              disabled && 'pointer-events-none opacity-40'
            )}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Eye className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        }
        {...props}
      />
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
