import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text">{label}</label>
      )}
      <input
        ref={ref}
        className={`w-full rounded-lg border border-border bg-white px-3 py-2 text-sm 
          placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light
          ${error ? 'border-danger focus:border-danger focus:ring-red-100' : ''}
          ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
);
Input.displayName = 'Input';
