import {
  AlertTriangle,
  Check,
  CircleSlash,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { AppConfig, Job } from '../lib/types';
import { aspectValue, cn, shortModelName, timeAgo } from '../lib/utils';

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);

const STATUS_LABEL: Record<Job['status'], string> = {
  queued: 'Queued',
  starting: 'Starting',
  processing: 'Rendering',
  downloading: 'Saving',
  succeeded: 'Ready',
  failed: 'Failed',
  canceled: 'Canceled',
};

function frameClass(ratio: string): string {
  if (ratio === '9:16') return 'w-[min(100%,290px)] aspect-[9/16]';
  if (ratio === '1:1') return 'w-[min(100%,400px)] aspect-square';
  return 'w-full aspect-video';
}

function StatusPill({ status }: { status: Job['status'] }) {
  const tone =
    status === 'succeeded'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
      : status === 'failed'
        ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
        : status === 'canceled'
          ? 'border-white/10 bg-white/5 text-white/45'
          : 'border-brand-violet/25 bg-brand-violet/10 text-brand-violet';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold', tone)}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'succeeded' && 'bg-emerald-400',
          status === 'failed' && 'bg-rose-400',
          status === 'canceled' && 'bg-white/40',
          !['succeeded', 'failed', 'canceled'].includes(status) && 'animate-pulse bg-brand-violet',
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PreviewPanel({
  config,
  job,
  submitting,
  onCancel,
  onCopy,
  onRetry,
  onSetup,
}: {
  config: AppConfig | null;
  job: Job | null;
  submitting: boolean;
  onCancel: (id: string) => void;
  onCopy: (prompt: string) => void;
  onRetry: (job: Job) => void;
  onSetup: () => void;
}) {
  const configured = Boolean(config?.configured);
  const rendering =
    Boolean(job) &&
    !TERMINAL.has(job!.status) &&
    ['queued', 'starting', 'processing', 'downloading'].includes(job!.status);

  return (
    <div id="preview" className="glass scroll-mt-24 rounded-3xl p-4 sm:p-6 lg:sticky lg:top-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-violet/10 text-brand-violet">
            <Play className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">Preview</h2>
        </div>
        {job ? (
          <StatusPill status={job.status} />
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-white/35">
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            Idle
          </span>
        )}
      </div>

      {submitting && !job && (
        <div className="mx-auto flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-black/40">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full border border-brand-orange/30" />
            <span className="flex h-11 w-11 items-center justify-center rounded-full gradient-brand">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/80">Submitting your render</p>
            <p className="mt-1 text-[11px] text-white/35">Handing the job to Replicate securely…</p>
          </div>
        </div>
      )}

      {!submitting && !job && !configured && (
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-brand-amber/25 bg-brand-amber/[0.035] px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-amber/20 bg-brand-amber/10 text-brand-amber">
            <KeyRound className="h-6 w-6" />
          </span>
          <h3 className="mt-5 font-display text-lg font-semibold text-white">Connect a real video API</h3>
          <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-white/40">
            The studio is ready. Add your Replicate API key on the server to start rendering real
            videos. No simulated results will ever be shown here.
          </p>
          <button type="button" onClick={onSetup} className="btn-primary mt-6 h-10 px-5 text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            View setup instructions
          </button>
        </div>
      )}

      {!submitting && !job && configured && (
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-black/20 px-6 py-10 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <span className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-white/15" />
            <span className="absolute inset-3 rounded-full border border-brand-violet/20" />
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-brand-orange/20 to-brand-violet/20 text-brand-amber">
              <Film className="h-5 w-5" />
            </span>
          </div>
          <h3 className="mt-5 font-display text-lg font-semibold text-white">Ready when you are</h3>
          <p className="mt-2 max-w-[15rem] text-[12px] leading-relaxed text-white/40">
            Write a prompt, choose your frame, and your real render will appear here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            <span className="chip">5s / 10s</span>
            <span className="chip">MP4 download</span>
            <span className="chip">Real output</span>
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-[10px] text-white/25">
            <ShieldCheck className="h-3 w-3 text-emerald-400/60" />
            No stock clips, no fake demos
          </p>
        </div>
      )}

      {job && rendering && (
        <div>
          <div
            className={cn(
              'relative mx-auto overflow-hidden rounded-2xl border border-white/10 bg-ink-900',
              frameClass(job.aspectRatio),
            )}
          >
            <div className="absolute inset-0 animate-gradient bg-[linear-gradient(135deg,rgba(255,122,24,0.18),rgba(244,92,138,0.14),rgba(139,92,246,0.2),rgba(255,122,24,0.18))]" />
            <div className="grid-overlay absolute inset-0 opacity-40" />
            <div className="absolute -left-10 top-1/3 h-40 w-40 rounded-full bg-brand-orange/20 blur-3xl" />
            <div className="absolute -right-10 bottom-1/4 h-40 w-40 rounded-full bg-brand-violet/25 blur-3xl" />

            <div className="relative flex h-full flex-col items-center justify-center px-5 py-6 text-center">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 rounded-full border border-white/10" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-orange/80 border-r-brand-violet/60" />
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <Film className="h-5 w-5 text-white/80" />
                </span>
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-amber/80">
                {job.stage}
              </p>
              <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-white">
                {Math.min(99, Math.max(1, job.progress))}
                <span className="ml-0.5 text-lg text-white/40">%</span>
              </p>

              <div className="mt-4 w-full max-w-[240px]">
                <div className="progress-track h-1.5">
                  <div className="progress-fill" style={{ width: `${Math.max(2, job.progress)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[9px] text-white/35">
                  <span>{job.duration}s · {job.aspectRatio} · {job.resolution}</span>
                  <span>
                    {job.etaSeconds && job.etaSeconds > 0
                      ? `~${job.etaSeconds}s left`
                      : job.status === 'downloading'
                        ? 'saving…'
                        : 'finishing…'}
                  </span>
                </div>
              </div>

              <div className="mt-5 w-full max-w-[240px] space-y-1.5 text-left">
                {[
                  { label: 'Submitted to Replicate', done: job.progress >= 5 },
                  { label: 'Rendering frames', done: ['downloading', 'succeeded'].includes(job.status), active: ['starting', 'processing'].includes(job.status) },
                  { label: 'Saving MP4', done: job.status === 'succeeded', active: job.status === 'downloading' },
                ].map((step) => (
                  <div key={step.label} className="flex items-center gap-2 text-[10px]">
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full border',
                        step.done
                          ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                          : step.active
                            ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-amber'
                            : 'border-white/10 bg-white/5 text-white/20',
                      )}
                    >
                      {step.done ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      ) : step.active ? (
                        <span className="h-1 w-1 animate-pulse rounded-full bg-brand-amber" />
                      ) : (
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                      )}
                    </span>
                    <span className={cn(step.done || step.active ? 'text-white/60' : 'text-white/25')}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-[0.16em] text-white/30">Prompt</span>
              <button
                type="button"
                onClick={() => onCopy(job.prompt)}
                className="text-white/30 transition hover:text-white"
                aria-label="Copy prompt"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/45">{job.prompt}</p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] text-white/25">
              <Loader2 className="h-3 w-3 animate-spin" />
              Live job · real render in progress
            </p>
            <button
              type="button"
              onClick={() => onCancel(job.id)}
              className="btn-ghost h-8 px-3 text-[10px]"
            >
              <CircleSlash className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {job && job.status === 'succeeded' && job.videoUrl && (
        <div>
          <div
            className={cn(
              'mx-auto overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_25px_60px_-30px_rgba(139,92,246,0.55)]',
              frameClass(job.aspectRatio),
            )}
          >
            <video
              key={job.id}
              src={job.videoUrl}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            >
              Your browser does not support video playback.
            </video>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="chip">{job.duration}s</span>
            <span className="chip">{job.aspectRatio}</span>
            <span className="chip">{job.resolution}</span>
            <span className="chip">
              {job.mode === 'image' ? (
                <ImageIcon className="h-3 w-3 text-brand-violet/80" />
              ) : (
                <Wand2 className="h-3 w-3 text-brand-orange/80" />
              )}
              {job.mode === 'image' ? 'Image to video' : 'Text to video'}
            </span>
            <span className="chip">{shortModelName(job.model)}</span>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-[0.16em] text-white/30">
                Prompt · {timeAgo(job.createdAt)}
              </span>
              <button
                type="button"
                onClick={() => onCopy(job.prompt)}
                className="flex items-center gap-1 text-[10px] text-white/35 transition hover:text-white"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-white/50">{job.prompt}</p>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <a href={job.downloadUrl ?? '#'} download className="btn-primary h-11 px-4 text-xs">
              <Download className="h-3.5 w-3.5" />
              Download MP4
            </a>
            <a href="#studio" className="btn-ghost h-11 px-4 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              New
            </a>
          </div>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-white/25">
            <ShieldCheck className="h-3 w-3 text-emerald-400/60" />
            Saved on this server · accessed with your browser ID
          </p>
        </div>
      )}

      {job && job.status === 'failed' && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.055] p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-white">Generation failed</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-rose-100/75">
            {job.error ?? 'The provider could not complete this render. Please try again.'}
          </p>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Prompt</p>
            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-white/45">{job.prompt}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onRetry(job)} className="btn-primary h-10 px-4 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
            <a href="#studio" className="btn-ghost h-10 px-4 text-xs font-medium">
              Edit prompt
            </a>
            {/token|billing|credit|not configured/i.test(job.error ?? '') && (
              <button type="button" onClick={onSetup} className="btn-ghost h-10 px-4 text-xs font-medium">
                <KeyRound className="h-3.5 w-3.5" />
                API setup
              </button>
            )}
          </div>
        </div>
      )}

      {job && job.status === 'canceled' && (
        <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-black/20 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
            <CircleSlash className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-white">Render canceled</h3>
          <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-white/40">
            This generation stopped before a video was saved. Your prompt and settings are still
            available in the studio.
          </p>
          <a href="#studio" className="btn-primary mt-5 h-10 px-5 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            Start another render
          </a>
        </div>
      )}

      {job && (
        <p className="mt-4 text-center text-[9px] text-white/20">
          Job {job.id.slice(0, 8)} · {aspectValue(job.aspectRatio)} · {job.provider}
        </p>
      )}
    </div>
  );
}
