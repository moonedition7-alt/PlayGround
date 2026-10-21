import { useState } from 'react';
import {
  AlertTriangle,
  CircleSlash,
  Clock,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Play,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { Job } from '../lib/types';
import { cn, timeAgo } from '../lib/utils';

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);

function MiniStatus({ job }: { job: Job }) {
  const label =
    job.status === 'succeeded'
      ? 'Ready'
      : job.status === 'failed'
        ? 'Failed'
        : job.status === 'canceled'
          ? 'Canceled'
          : `${Math.min(99, Math.max(1, job.progress))}%`;

  const tone =
    job.status === 'succeeded'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
      : job.status === 'failed'
        ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
        : job.status === 'canceled'
          ? 'border-white/10 bg-black/40 text-white/45'
          : 'border-brand-orange/25 bg-black/50 text-brand-amber';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold backdrop-blur', tone)}>
      {!TERMINAL.has(job.status) && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {label}
    </span>
  );
}

function HistoryCard({
  job,
  active,
  onSelect,
  onCopy,
  onDelete,
}: {
  job: Job;
  active: boolean;
  onSelect: (job: Job) => void;
  onCopy: (prompt: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const terminal = TERMINAL.has(job.status);

  return (
    <article
      onClick={() => onSelect(job)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(job);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] transition duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50',
        active && 'border-brand-orange/30 bg-brand-orange/[0.035]',
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-ink-900">
        {job.status === 'succeeded' && job.videoUrl ? (
          <video
            src={`${job.videoUrl}#t=0.1`}
            muted
            loop
            playsInline
            preload="auto"
            className="h-full w-full object-cover opacity-85 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
            onMouseEnter={(event) => {
              event.currentTarget.play().catch(() => {});
            }}
            onMouseLeave={(event) => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0;
            }}
          />
        ) : !terminal ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-orange/[0.08] via-transparent to-brand-violet/[0.12]">
            <Loader2 className="h-6 w-6 animate-spin text-brand-amber" />
            <span className="text-[10px] text-white/40">{job.stage}</span>
            <div className="progress-track mt-1 h-1 w-24">
              <div className="progress-fill" style={{ width: `${Math.max(3, job.progress)}%` }} />
            </div>
          </div>
        ) : job.status === 'failed' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-rose-500/[0.045] px-5 text-center">
            <AlertTriangle className="h-6 w-6 text-rose-300/70" />
            <span className="line-clamp-2 text-[10px] leading-relaxed text-rose-200/60">
              {job.error ?? 'Generation failed'}
            </span>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-white/[0.02]">
            <CircleSlash className="h-6 w-6 text-white/20" />
            <span className="text-[10px] text-white/30">Render canceled</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />

        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <MiniStatus job={job} />
          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9px] font-medium text-white/55 backdrop-blur">
            {job.duration}s
          </span>
        </div>

        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9px] text-white/55 backdrop-blur">
          {job.mode === 'image' ? <ImageIcon className="h-2.5 w-2.5" /> : <Wand2 className="h-2.5 w-2.5" />}
          {job.aspectRatio}
        </span>

        {job.status === 'succeeded' && (
          <span className="absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition group-hover:border-brand-orange/40 group-hover:bg-brand-orange/20 group-hover:text-brand-amber">
            <Play className="h-3 w-3 translate-x-[1px]" fill="currentColor" />
          </span>
        )}
      </div>

      <div className="p-3.5">
        <p className="line-clamp-2 min-h-[2.4rem] text-[11px] leading-relaxed text-white/55">
          {job.prompt}
        </p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[9px] text-white/25">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(job.createdAt)}
          </span>
          <span className="text-[9px] uppercase tracking-wide text-white/25">{job.resolution}</span>
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.05] pt-2.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCopy(job.prompt);
            }}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] text-[9px] font-medium text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            title="Copy prompt"
          >
            <Copy className="h-2.5 w-2.5" />
            Copy
          </button>

          {job.status === 'succeeded' && job.downloadUrl ? (
            <a
              href={job.downloadUrl}
              download
              onClick={(event) => event.stopPropagation()}
              className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] text-[9px] font-medium text-white/45 transition hover:bg-white/[0.06] hover:text-white"
              title="Download video"
            >
              <Download className="h-2.5 w-2.5" />
              Save
            </a>
          ) : (
            <span className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.04] text-[9px] text-white/20">
              <Film className="h-2.5 w-2.5" />
              {terminal ? 'No file' : 'Rendering'}
            </span>
          )}

          {terminal &&
            (confirming ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(job.id);
                    setConfirming(false);
                  }}
                  className="flex h-7 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-500/15 px-2 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-500/25"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirming(false);
                  }}
                  className="flex h-7 w-6 items-center justify-center rounded-lg border border-white/[0.07] text-white/35 transition hover:text-white"
                  aria-label="Cancel delete"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirming(true);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.02] text-white/30 transition hover:border-rose-400/25 hover:bg-rose-500/10 hover:text-rose-300"
                aria-label="Delete generation"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            ))}
        </div>
      </div>
    </article>
  );
}

export function History({
  jobs,
  loading,
  activeJobId,
  configured,
  onSelect,
  onCopy,
  onDelete,
  onSetup,
}: {
  jobs: Job[];
  loading: boolean;
  activeJobId: string | null;
  configured: boolean;
  onSelect: (job: Job) => void;
  onCopy: (prompt: string) => void;
  onDelete: (id: string) => void;
  onSetup: () => void;
}) {
  return (
    <section id="history" className="scroll-mt-24 py-12 lg:py-16">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-violet/80">
            <Clock className="h-3 w-3" />
            Generation history
          </div>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Your renders, kept together.
          </h2>
          <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-white/40">
            Every completed job is stored on this server for this browser. Reopen a render, copy
            its prompt, or download the MP4 again.
          </p>
        </div>
        <span className="chip self-start sm:self-auto">
          <Film className="h-3 w-3 text-brand-amber/80" />
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
        </span>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <div className="skeleton-shimmer aspect-[16/10]" />
              <div className="space-y-2 p-3.5">
                <div className="skeleton-shimmer h-3 w-4/5 rounded" />
                <div className="skeleton-shimmer h-3 w-2/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/30">
            {configured ? <Film className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-white">
            {configured ? 'No generations yet' : 'History starts after you connect an API'}
          </h3>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-white/40">
            {configured
              ? 'Your first real render will appear here with its prompt, settings and download link.'
              : 'Add a server-side Replicate key, then generate your first video. Only real provider output is saved.'}
          </p>
          {configured ? (
            <a href="#studio" className="btn-primary mt-5 h-10 px-5 text-xs">
              <Wand2 className="h-3.5 w-3.5" />
              Create a video
            </a>
          ) : (
            <button type="button" onClick={onSetup} className="btn-primary mt-5 h-10 px-5 text-xs">
              <KeyRound className="h-3.5 w-3.5" />
              View setup
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <HistoryCard
              key={job.id}
              job={job}
              active={job.id === activeJobId}
              onSelect={onSelect}
              onCopy={onCopy}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
