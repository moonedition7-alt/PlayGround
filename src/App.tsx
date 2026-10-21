import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, RefreshCw } from 'lucide-react';
import { api, ApiError } from './lib/api';
import type { AppConfig, GenerationRequest, Job, JobStatus } from './lib/types';
import type { PreparedImage } from './lib/image';
import { copyText } from './lib/utils';
import { Header, MobileNav } from './components/Header';
import { Hero } from './components/Hero';
import { Generator } from './components/Generator';
import { PreviewPanel } from './components/PreviewPanel';
import { FeatureStrip } from './components/FeatureStrip';
import { History } from './components/History';
import { SetupSection } from './components/SetupSection';
import { Footer } from './components/Footer';
import { ToastStack, type ToastItem, type ToastTone } from './components/ToastStack';

const TERMINAL: Set<JobStatus> = new Set(['succeeded', 'failed', 'canceled']);

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<5 | 10>(5);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('16:9');
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p');
  const [image, setImage] = useState<PreparedImage | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = useRef(0);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    toastCounter.current += 1;
    const id = `${Date.now()}-${toastCounter.current}`;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4400);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const upsertJob = useCallback((job: Job) => {
    setJobs((current) => {
      const index = current.findIndex((item) => item.id === job.id);
      const next = index >= 0 ? current.map((item) => (item.id === job.id ? job : item)) : [job, ...current];
      return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [configResult, jobsResult] = await Promise.allSettled([api.getConfig(), api.listJobs()]);
      if (!alive) return;

      if (configResult.status === 'fulfilled') {
        setConfig(configResult.value);
        setResolution(configResult.value.defaultResolution);
      } else {
        setBootError(
          'Could not reach the Info Ranga API server. Start it with “npm run dev” and reload this page.',
        );
      }

      if (jobsResult.status === 'fulfilled') {
        const loaded = jobsResult.value.jobs;
        setJobs(loaded);
        const pending = loaded.find((job) => !TERMINAL.has(job.status));
        setActiveJob(pending ?? loaded[0] ?? null);
      }

      setLoadingJobs(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!activeJob) return;
    const id = activeJob.id;
    let stopped = false;
    let timer: number | undefined;

    if (TERMINAL.has(activeJob.status)) return;

    const tick = async () => {
      try {
        const { job } = await api.getJob(id);
        if (stopped) return;
        setActiveJob((current) => (current?.id === id ? job : current));
        upsertJob(job);
        if (!TERMINAL.has(job.status)) {
          timer = window.setTimeout(tick, 1800);
        }
      } catch {
        if (!stopped) timer = window.setTimeout(tick, 3500);
      }
    };

    timer = window.setTimeout(tick, 800);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeJob?.id, activeJob?.status, upsertJob]);

  useEffect(() => {
    if (formError) setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, mode, duration, aspectRatio, resolution, image]);

  const submitGeneration = async (input: GenerationRequest) => {
    if (!config?.configured) {
      scrollTo('setup');
      return;
    }

    const previousJob = activeJob;
    setSubmitting(true);
    setFormError(null);
    setActiveJob(null);

    try {
      const { job } = await api.createJob(input);
      setActiveJob(job);
      upsertJob(job);
      notify('Render submitted. Progress is live in the preview.', 'info');
      if (window.innerWidth < 1024) {
        window.setTimeout(() => scrollTo('preview'), 120);
      }
    } catch (error) {
      setActiveJob(previousJob);
      const message =
        error instanceof ApiError
          ? error.message
          : 'Could not submit the render. Check that the server is running and try again.';
      setFormError(message);
      notify(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = () => {
    if (!config?.configured) {
      scrollTo('setup');
      notify('Add a Replicate API key on the server to enable generation.', 'info');
      return;
    }

    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      setFormError('Add a short description of the video you want to create.');
      return;
    }
    if (mode === 'image' && !image) {
      setFormError('Upload a source image for image-to-video.');
      return;
    }

    void submitGeneration({
      mode,
      prompt: trimmed,
      duration,
      aspectRatio,
      resolution,
      image: mode === 'image' ? image?.file : null,
    });
  };

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    notify(ok ? 'Prompt copied to clipboard.' : 'Could not copy the prompt.', ok ? 'success' : 'error');
  };

  const handleCancel = async (id: string) => {
    try {
      const { job } = await api.cancelJob(id);
      setActiveJob(job);
      upsertJob(job);
      notify('Render canceled.', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not cancel the render.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteJob(id);
      setJobs((current) => current.filter((job) => job.id !== id));
      if (activeJob?.id === id) setActiveJob(null);
      notify('Generation removed from history.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete the generation.', 'error');
    }
  };

  const handleSelect = (job: Job) => {
    setActiveJob(job);
    if (window.innerWidth < 1024) {
      window.setTimeout(() => scrollTo('preview'), 60);
    }
  };

  const handleRetry = async (job: Job) => {
    if (!config?.configured) {
      scrollTo('setup');
      return;
    }

    setMode(job.mode);
    setPrompt(job.prompt);
    setDuration(job.duration);
    setAspectRatio(job.aspectRatio);
    setResolution(job.resolution);

    let retryImage: File | null = image?.file ?? null;

    if (job.mode === 'image' && !retryImage) {
      if (!job.sourceImageUrl) {
        notify('The original source image is unavailable. Please upload it again.', 'error');
        scrollTo('studio');
        return;
      }
      try {
        const response = await fetch(job.sourceImageUrl);
        if (!response.ok) throw new Error('Source image missing');
        const blob = await response.blob();
        retryImage = new File([blob], 'source-image.jpg', { type: blob.type || 'image/jpeg' });
        const nextImage: PreparedImage = {
          file: retryImage,
          previewUrl: URL.createObjectURL(blob),
          width: 0,
          height: 0,
        };
        setImage((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl);
          return nextImage;
        });
      } catch {
        notify('The original source image is unavailable. Please upload it again.', 'error');
        scrollTo('studio');
        return;
      }
    }

    await submitGeneration({
      mode: job.mode,
      prompt: job.prompt,
      duration: job.duration,
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
      image: job.mode === 'image' ? retryImage : null,
    });
  };

  const handleSetup = () => {
    scrollTo('setup');
  };

  const busy = submitting || Boolean(activeJob && !TERMINAL.has(activeJob.status));

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-brand-orange/[0.10] blur-[130px] animate-drift" />
        <div className="absolute -right-40 top-10 h-[32rem] w-[32rem] rounded-full bg-brand-violet/[0.13] blur-[140px] animate-pulse-soft" />
        <div className="absolute bottom-0 left-1/3 h-[26rem] w-[26rem] rounded-full bg-brand-pink/[0.06] blur-[140px]" />
        <div className="grid-overlay absolute inset-0 opacity-50" />
      </div>

      <div className="relative z-10">
        <Header config={config} />

        <main className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <Hero config={config} />

          {bootError && (
            <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-[12px] leading-relaxed text-rose-100/80">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                {bootError}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-ghost h-9 shrink-0 self-start px-3 text-[11px] sm:self-auto"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}

          {config && !config.configured && (
            <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-brand-amber/20 bg-gradient-to-r from-brand-orange/[0.07] via-brand-pink/[0.04] to-brand-violet/[0.08] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2.5 text-[12px] leading-relaxed text-white/60">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
                <span>
                  <span className="font-semibold text-white/85">Prepare the studio:</span> the
                  interface is free, but video generation needs a server-side Replicate token.
                  Nothing is faked while you set it up.
                </span>
              </p>
              <button
                type="button"
                onClick={handleSetup}
                className="btn-primary h-9 shrink-0 self-start px-4 text-[11px] sm:self-auto"
              >
                Setup guide
              </button>
            </div>
          )}

          <section id="studio" className="scroll-mt-24 py-6 lg:py-10">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-orange/80">
                  <span className="h-1 w-1 rounded-full bg-brand-orange" />
                  The studio
                </div>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Prompt. Frame. Render.
                </h2>
                <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-white/40">
                  Describe a scene or animate a still image. Your job runs asynchronously on the
                  server and the finished MP4 is saved for download.
                </p>
              </div>
              <span className="chip self-start sm:self-auto">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                Real provider output
              </span>
            </div>

            <div className="grid gap-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <Generator
                  config={config}
                  mode={mode}
                  setMode={setMode}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  duration={duration}
                  setDuration={setDuration}
                  aspectRatio={aspectRatio}
                  setAspectRatio={setAspectRatio}
                  resolution={resolution}
                  setResolution={setResolution}
                  image={image}
                  onImageChange={setImage}
                  busy={busy}
                  submitting={submitting}
                  error={formError}
                  onGenerate={handleGenerate}
                  onSetup={handleSetup}
                  notify={notify}
                />
              </div>
              <div className="lg:col-span-5">
                <PreviewPanel
                  config={config}
                  job={activeJob}
                  submitting={submitting}
                  onCancel={handleCancel}
                  onCopy={handleCopy}
                  onRetry={handleRetry}
                  onSetup={handleSetup}
                />
              </div>
            </div>
          </section>

          <FeatureStrip />

          <History
            jobs={jobs}
            loading={loadingJobs}
            activeJobId={activeJob?.id ?? null}
            configured={Boolean(config?.configured)}
            onSelect={handleSelect}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onSetup={handleSetup}
          />

          <SetupSection config={config} notify={notify} />
        </main>

        <Footer configured={Boolean(config?.configured)} />
        <MobileNav />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </div>
  );
}
