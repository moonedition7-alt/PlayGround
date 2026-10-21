import { Layers, MonitorPlay, ShieldCheck, Timer, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Real output only',
    body: 'No demo clips, stock footage or simulated progress. Results come directly from the configured AI provider.',
    accent: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  },
  {
    icon: Timer,
    title: 'Async job pipeline',
    body: 'Jobs are queued, submitted and polled on the server. You can watch each stage and cancel a render at any time.',
    accent: 'text-brand-amber bg-brand-orange/10 border-brand-orange/20',
  },
  {
    icon: MonitorPlay,
    title: 'Built for every screen',
    body: 'A mobile-first dashboard with the same studio controls, live preview, downloads and history on any device.',
    accent: 'text-brand-violet bg-brand-violet/10 border-brand-violet/20',
  },
];

export function FeatureStrip() {
  return (
    <section className="border-y border-white/[0.055] py-10 lg:py-12">
      <div className="grid gap-6 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex gap-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${feature.accent}`}>
              <feature.icon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[12px] font-semibold text-white/85">{feature.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-white/35">{feature.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/[0.04] pt-6 text-[10px] text-white/25">
        <span className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-brand-amber/70" />
          Text &amp; image to video
        </span>
        <span className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 text-brand-violet/70" />
          9:16 · 16:9 · 1:1
        </span>
        <span className="flex items-center gap-1.5">
          <MonitorPlay className="h-3 w-3 text-brand-pink/70" />
          5s &amp; 10s MP4
        </span>
      </div>
    </section>
  );
}
