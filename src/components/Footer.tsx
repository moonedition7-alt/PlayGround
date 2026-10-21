import { Film, ShieldCheck } from 'lucide-react';

export function Footer({ configured }: { configured: boolean }) {
  return (
    <footer className="relative border-t border-white/[0.06] py-10 pb-24 md:pb-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <a href="#studio" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl gradient-brand">
                <Film className="h-4 w-4 text-white" />
              </span>
              <span className="font-display text-sm font-semibold text-white">
                Info Ranga <span className="text-gradient">AI</span>
              </span>
            </a>
            <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-white/30">
              A focused AI video studio for turning prompts and images into real downloadable
              videos. Server-side API keys, asynchronous jobs, honest previews.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[11px]">
            <a href="#studio" className="text-white/40 transition hover:text-white">Studio</a>
            <a href="#history" className="text-white/40 transition hover:text-white">History</a>
            <a href="#setup" className="text-white/40 transition hover:text-white">API setup</a>
            <a
              href="https://replicate.com/docs"
              target="_blank"
              rel="noreferrer"
              className="text-white/40 transition hover:text-white"
            >
              Provider docs
            </a>
          </div>
        </div>

        <div className="divider" />

        <div className="flex flex-col gap-2 text-[10px] text-white/25 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Info Ranga AI. Built with React, Tailwind CSS, Node.js and Express.</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className={configured ? 'h-3 w-3 text-emerald-400/70' : 'h-3 w-3 text-brand-amber/70'} />
            {configured ? 'Replicate connected · keys stay server-side' : 'Generation disabled until an API key is configured'}
          </span>
        </div>
      </div>
    </footer>
  );
}
