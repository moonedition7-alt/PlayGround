import { Film, KeyRound, Sparkles } from 'lucide-react';
import type { AppConfig } from '../lib/types';

const NAV = [
  { href: '#studio', label: 'Studio' },
  { href: '#history', label: 'History' },
  { href: '#setup', label: 'Setup' },
];

export function Header({ config }: { config: AppConfig | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <a href="#studio" className="group flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl gradient-brand shadow-[0_10px_30px_-10px_rgba(255,106,61,0.8)]">
            <Film className="h-5 w-5 text-white" strokeWidth={2.2} />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-ink-950">
              <Sparkles className="h-2.5 w-2.5 text-brand-amber" />
            </span>
          </span>
          <span className="leading-none">
            <span className="block font-display text-[17px] font-semibold tracking-tight text-white">
              Info Ranga <span className="text-gradient">AI</span>
            </span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.22em] text-white/35">
              AI Video Studio
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] p-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/55 sm:inline-flex">
            <span
              className={
                config?.configured
                  ? 'h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                  : 'h-1.5 w-1.5 rounded-full bg-brand-amber shadow-[0_0_10px_rgba(255,177,92,0.9)]'
              }
            />
            {config === null
              ? 'Checking API'
              : config.configured
                ? 'API connected'
                : 'Setup required'}
          </span>
          <a
            href="#setup"
            className="btn-ghost h-9 px-3 text-[12px] font-semibold sm:px-4"
            aria-label="API setup"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">API Setup</span>
          </a>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const items = [
    { href: '#studio', label: 'Studio', icon: Sparkles },
    { href: '#history', label: 'History', icon: Film },
    { href: '#setup', label: 'Setup', icon: KeyRound },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/85 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium text-white/45 transition active:bg-white/5 active:text-white"
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
