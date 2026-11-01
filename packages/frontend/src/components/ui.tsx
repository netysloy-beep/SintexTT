import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'ghost';
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-500 text-white active:bg-brand-600 disabled:bg-slate-300 dark:disabled:bg-slate-700',
    danger: 'bg-rose-500 text-white active:bg-rose-600 disabled:bg-slate-300',
    ghost: 'bg-slate-100 text-slate-700 active:bg-slate-200 dark:bg-slate-700 dark:text-slate-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' }) {
  const tones: Record<string, string> = {
    default: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
    bad: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="mx-auto w-full max-w-md space-y-4 px-4 pb-24 pt-4"
    >
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      {children}
    </motion.div>
  );
}

export function Loading({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400" role="status">
      <motion.div
        className="mr-3 h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
      />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="text-center">
      <div className="text-3xl">📭</div>
      <p className="mt-2 font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="text-center">
      <div className="text-3xl">⚠️</div>
      <p className="mt-2 font-semibold text-rose-600">{message}</p>
      <div className="mt-3">
        <Button onClick={onRetry} variant="ghost">Повторить</Button>
      </div>
    </Card>
  );
}
