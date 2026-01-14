import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, style, ...props }, ref) => {
    const baseStyles: React.CSSProperties = {
      border: 'none',
      borderRadius: '0.375rem',
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      fontSize: size === 'sm' ? '0.75rem' : size === 'lg' ? '1rem' : '0.875rem',
      fontWeight: 500,
      padding: size === 'sm' ? '0.25rem 0.75rem' : size === 'lg' ? '0.75rem 1.5rem' : '0.5rem 1rem',
      transition: 'all 0.2s ease',
      opacity: disabled || loading ? 0.5 : 1,
      ...style,
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        background: 'var(--color-primary)',
        color: 'white',
      },
      secondary: {
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      },
      success: {
        background: 'var(--color-success)',
        color: 'white',
      },
      ghost: {
        background: 'transparent',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
      },
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={{ ...baseStyles, ...variantStyles[variant] }}
        {...props}
      >
        {loading ? 'Loading...' : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
