import {
  ArrowRight,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Layers,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';
import type { AppConfig } from '../lib/types';

export function Hero({ config }: { config: AppConfig | null }) {
  return (
    <section className="relative pb-10 pt-10 sm:pt-14 lg:pb-16 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.06fr_0.94fr] lg:gap-14">
        <div className="animate-fade-up">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-orange/25 bg-brand-orange/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-amber">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-orange opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-orange" />
              </span>
              AI Video Studio
            </span>
            <span className="chip">Free to use interface</span>
          </div>

          <h1 className="max-w-xl font-display text-[2.55rem] font-semibold leading-[1.04] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4.15rem]">
            Words in.
            <br />
            <span className="text-gradient">Cinema out.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/55 sm:text-base">
            Create real AI video from a prompt or a single image. Choose 5 or 10 seconds,
            pick your frame, and follow every render from queue to download.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { icon: Wand2, label: 'Text to video' },
              { icon: ImageIcon, label: 'Image to video' },
              { icon: Zap, label: '5s / 10s' },
              { icon: Layers, label: '3 aspect ratios' },
            ].map((item) => (
              <span key={item.label} className="chip">
                <item.icon className="h-3 w-3 text-brand-amber/80" />
                {item.label}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href="#studio" className="btn-primary h-12 px-6 text-sm">
              <Sparkles className="h-4 w-4" />
              Open the studio
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href={config?.configured ? '#history' : '#setup'} className="btn-ghost h-12 px-5 text-sm font-medium">
              {config?.configured ? 'View real renders' : 'Connect video API'}
            </a>
          </div>

          <p className="mt-5 flex items-center gap-2 text-[11px] text-white/35">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
            Real renders only. No sample clips pretending to be results.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[460px] animate-fade-up lg:max-w-none" style={{ animationDelay: '120ms' }}>
          <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-gradient-to-tr from-brand-orange/15 via-brand-pink/10 to-brand-violet/20 blur-3xl" />
          <div className="glass animate-float relative rounded-[1.75rem] p-3 sm:p-4">
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400/70" />
                <span className="h-2 w-2 rounded-full bg-amber-300/70" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
              </div>
              <span className="font-mono text-[10px] tracking-wider text-white/30">studio.pipeline</span>
              <Clapperboard className="h-3.5 w-3.5 text-white/25" />
            </div>

            <div className="space-y-2.5 rounded-2xl border border-white/[0.06] bg-ink-950/55 p-3 sm:p-4">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-brand-amber/80">
                    01 / Describe
                  </span>
                  <span className="rounded-full bg-brand-orange/10 px-2 py-0.5 text-[9px] font-medium text-brand-amber/80">
                    prompt
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-white/65">
                  “Slow aerial shot over a neon-lit street after rain, reflections, drifting
                  fog, cinematic.”
                </p>
              </div>

              <div className="rounded-xl border border-brand-violet/20 bg-brand-violet/[0.055] p-3">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-brand-violet/90">
                    02 / Render
                  </span>
                  <span className="flex items-center gap-1.5 text-[9px] font-medium text-white/45">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-violet" />
                    processing
                  </span>
                </div>
                <div className="progress-track h-1.5">
                  <div className="progress-fill" style={{ width: '68%' }} />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[9px] text-white/35">
                  <span>rendering frames</span>
                  <span className="font-mono">10s · 9:16 · 720p</span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-emerald-400/[0.12] bg-emerald-400/[0.035] p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                  <Download className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-white/75">03 / Deliver</p>
                  <p className="text-[9px] text-white/35">MP4 saved server-side · ready to download</p>
                </div>
                <span className="rounded-full border border-emerald-400/20 px-2 py-0.5 text-[9px] font-medium text-emerald-300">
                  real
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 pt-3">
              <span className="flex items-center gap-1.5 text-[9px] text-white/30">
                <Film className="h-3 w-3" />
                Replicate · Seedance
              </span>
              <span className="flex items-center gap-1.5 text-[9px] text-white/30">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                server-side keys
              </span>
            </div>
          </div>

          <span className="absolute -right-2 top-16 rounded-full border border-white/10 bg-ink-850/95 px-3 py-1.5 text-[10px] font-medium text-white/60 shadow-xl backdrop-blur sm:-right-4">
            5s / 10s
          </span>
          <span className="absolute -left-2 bottom-14 rounded-full border border-white/10 bg-ink-850/95 px-3 py-1.5 text-[10px] font-medium text-white/60 shadow-xl backdrop-blur sm:-left-4">
            9:16 · 16:9 · 1:1
          </span>
        </div>
      </div>
    </section>
  );
}
