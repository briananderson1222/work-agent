import React from 'react';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  (
    {
      variant = 'default',
      size = 'md',
      removable,
      onRemove,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      borderRadius: '9999px',
      fontSize: size === 'sm' ? '0.75rem' : '0.875rem',
      fontWeight: 500,
      padding: size === 'sm' ? '0.125rem 0.5rem' : '0.25rem 0.75rem',
      whiteSpace: 'nowrap',
      ...style,
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      default: {
        background: 'var(--color-bg-secondary)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      },
      primary: {
        background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
        color: 'var(--color-primary)',
        border:
          '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)',
      },
      success: {
        background: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
        color: 'var(--color-success)',
        border:
          '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
      },
      warning: {
        background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
        color: 'var(--color-warning)',
        border:
          '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
      },
      error: {
        background: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
        color: 'var(--color-error)',
        border:
          '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
      },
    };

    return (
      <span
        ref={ref}
        style={{ ...baseStyles, ...variantStyles[variant] }}
        {...props}
      >
        {children}
        {removable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: 0,
              marginLeft: '0.25rem',
              fontSize: '1rem',
              lineHeight: 1,
              opacity: 0.7,
            }}
            aria-label="Remove"
          >
            ×
          </button>
        )}
      </span>
    );
  },
);

Pill.displayName = 'Pill';
