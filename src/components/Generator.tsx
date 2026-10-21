import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import type { AppConfig } from '../lib/types';
import type { PreparedImage } from '../lib/image';
import { prepareImage } from '../lib/image';
import { QUICK_PROMPTS, randomPrompt } from '../lib/prompts';
import { cn, copyText, estimatedCost } from '../lib/utils';
import type { ToastTone } from './ToastStack';

type Mode = 'text' | 'image';
type Ratio = '9:16' | '16:9' | '1:1';
type Resolution = '480p' | '720p' | '1080p';

interface GeneratorProps {
  config: AppConfig | null;
  mode: Mode;
  setMode: (mode: Mode) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  duration: 5 | 10;
  setDuration: (duration: 5 | 10) => void;
  aspectRatio: Ratio;
  setAspectRatio: (ratio: Ratio) => void;
  resolution: Resolution;
  setResolution: (resolution: Resolution) => void;
  image: PreparedImage | null;
  onImageChange: (image: PreparedImage | null) => void;
  busy: boolean;
  submitting: boolean;
  error: string | null;
  onGenerate: () => void;
  onSetup: () => void;
  notify: (message: string, tone?: ToastTone) => void;
}

const RATIOS: Array<{ value: Ratio; label: string; hint: string }> = [
  { value: '9:16', label: '9:16', hint: 'Reels · Shorts' },
  { value: '16:9', label: '16:9', hint: 'YouTube · Web' },
  { value: '1:1', label: '1:1', hint: 'Feed · Square' },
];

const RESOLUTIONS: Array<{ value: Resolution; label: string; hint: string }> = [
  { value: '480p', label: '480p', hint: 'Fastest' },
  { value: '720p', label: '720p', hint: 'Balanced' },
  { value: '1080p', label: '1080p', hint: 'Highest' },
];

function RatioGlyph({ ratio }: { ratio: Ratio }) {
  const shape =
    ratio === '9:16'
      ? 'h-[17px] w-[10px]'
      : ratio === '1:1'
        ? 'h-[14px] w-[14px]'
        : 'h-[10px] w-[18px]';
  return (
    <span
      className={cn(
        'ratio-frame flex items-center justify-center text-current',
        shape,
      )}
    >
      <span className="h-1 w-1 rounded-full bg-current opacity-70" />
    </span>
  );
}

export function Generator({
  config,
  mode,
  setMode,
  prompt,
  setPrompt,
  duration,
  setDuration,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  image,
  onImageChange,
  busy,
  submitting,
  error,
  onGenerate,
  onSetup,
  notify,
}: GeneratorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const maxPrompt = config?.limits.promptMax ?? 1500;
  const configured = Boolean(config?.configured);
  const hasPrompt = prompt.trim().length >= 3;
  const canGenerate = hasPrompt && (mode === 'text' || Boolean(image));
  const cost = estimatedCost(config?.pricingPerSecond, resolution, duration);

  const handleCopy = async () => {
    if (!prompt.trim()) return;
    const ok = await copyText(prompt);
    notify(ok ? 'Prompt copied to clipboard.' : 'Could not copy the prompt.', ok ? 'success' : 'error');
  };

  const handleImageFile = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      if (image) URL.revokeObjectURL(image.previewUrl);
      onImageChange(prepared);
    } catch (uploadError) {
      setImageError(uploadError instanceof Error ? uploadError.message : 'Could not read that image.');
    } finally {
      setPreparing(false);
    }
  };

  const removeImage = () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
    onImageChange(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="glass rounded-3xl p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
              <Wand2 className="h-3.5 w-3.5" />
            </span>
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">
              Create a video
            </h2>
          </div>
          <p className="mt-1 text-[11px] text-white/35">
            Real renders through {config?.provider ?? 'Replicate'}
            {config ? ` · ${config.modelLabel}` : ''}
          </p>
        </div>
        <span className="chip border-brand-violet/20 bg-brand-violet/10 text-brand-violet/90">
          <Sparkles className="h-3 w-3" />
          AI
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.07] bg-black/25 p-1">
        {[
          { value: 'text' as const, label: 'Text to video', icon: Wand2 },
          { value: 'image' as const, label: 'Image to video', icon: ImageIcon },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition',
              mode === item.value
                ? 'bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70',
            )}
          >
            <item.icon className={cn('h-3.5 w-3.5', mode === item.value && 'text-brand-amber')} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="video-prompt" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {mode === 'image' ? 'Describe the motion' : 'Describe your scene'}
          </label>
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] tabular-nums', prompt.length > maxPrompt - 100 ? 'text-brand-amber' : 'text-white/25')}>
              {prompt.length}/{maxPrompt}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!prompt.trim()}
              className="btn-ghost h-7 w-7 rounded-lg p-0"
              title="Copy prompt"
              aria-label="Copy prompt"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        <textarea
          id="video-prompt"
          ref={promptRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value.slice(0, maxPrompt))}
          rows={4}
          placeholder={
            mode === 'image'
              ? 'The camera slowly pushes in as the subject turns toward the light, subtle wind, cinematic grade…'
              : 'A slow cinematic dolly through a rain-soaked neon market, reflections on the pavement, warm street food glow…'
          }
          className="field resize-none px-4 py-3.5 text-[13px] leading-relaxed sm:text-sm"
        />

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPrompt(randomPrompt(prompt))}
            className="flex items-center gap-1.5 text-[10px] font-medium text-white/40 transition hover:text-brand-amber"
          >
            <Sparkles className="h-3 w-3" />
            Surprise me
          </button>
          <span className="text-[10px] text-white/25">
            Describe motion, light, camera and mood for better results
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.slice(0, mode === 'image' ? 2 : 4).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setPrompt(item.prompt)}
              className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/40 transition hover:border-white/15 hover:text-white/75"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'image' && (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Source image
            </span>
            <span className="text-[10px] text-white/25">JPG · PNG · WebP</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => handleImageFile(event.target.files?.[0])}
          />

          {image ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              <img
                src={image.previewUrl}
                alt="Selected source"
                className="h-44 w-full object-contain"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
                <span className="truncate text-[10px] text-white/55">
                  {image.width ? `${image.width} × ${image.height}` : 'Source image'} · optimized
                </span>
                <button
                  type="button"
                  onClick={removeImage}
                  className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[10px] text-white/70 backdrop-blur transition hover:text-white"
                >
                  <X className="h-3 w-3" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleImageFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-7 transition',
                dragging
                  ? 'border-brand-orange/60 bg-brand-orange/[0.07]'
                  : 'border-white/[0.12] bg-black/20 hover:border-white/25 hover:bg-white/[0.025]',
              )}
            >
              {preparing ? (
                <Loader2 className="h-6 w-6 animate-spin text-brand-amber" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/50">
                  <Upload className="h-4 w-4" />
                </span>
              )}
              <span className="text-[12px] font-medium text-white/60">
                {preparing ? 'Optimizing image…' : 'Drop an image or click to browse'}
              </span>
              <span className="text-[10px] text-white/25">
                Optimized in your browser · underlying framing is preserved
              </span>
            </button>
          )}

          {imageError && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {imageError}
            </p>
          )}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Duration
          </span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 5 as const, label: '5 sec', hint: 'Quick shot' },
              { value: 10 as const, label: '10 sec', hint: 'Extended' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setDuration(item.value)}
                className={cn(
                  'relative rounded-xl border px-3 py-2.5 text-left transition',
                  duration === item.value
                    ? 'border-brand-orange/45 bg-brand-orange/[0.08] shadow-[0_0_25px_-12px_rgba(255,122,24,0.6)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15',
                )}
              >
                <span className="block font-display text-[14px] font-semibold text-white/90">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[9px] uppercase tracking-wider text-white/30">
                  {item.hint}
                </span>
                {duration === item.value && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-orange/20 text-brand-amber">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Aspect ratio
          </span>
          <div className="grid grid-cols-3 gap-2">
            {RATIOS.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={mode === 'image'}
                onClick={() => setAspectRatio(item.value)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2.5 transition',
                  aspectRatio === item.value && mode === 'text'
                    ? 'border-brand-violet/45 bg-brand-violet/[0.09] text-brand-violet'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/40 hover:border-white/15',
                  mode === 'image' && 'cursor-not-allowed opacity-35',
                )}
                title={mode === 'image' ? 'Image-to-video follows the source image framing' : item.hint}
              >
                <RatioGlyph ratio={item.value} />
                <span className="text-[10px] font-semibold text-white/65">{item.label}</span>
              </button>
            ))}
          </div>
          {mode === 'image' && (
            <p className="mt-1.5 text-[9px] text-white/25">Framing follows your source image.</p>
          )}
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Resolution
          </span>
          <span className="text-[10px] text-white/30">
            Est. <span className="font-semibold text-white/55">≈ {cost}</span> / render
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {RESOLUTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setResolution(item.value)}
              className={cn(
                'rounded-xl border px-2 py-2 text-center transition',
                resolution === item.value
                  ? 'border-brand-orange/40 bg-brand-orange/[0.07]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15',
              )}
            >
              <span className="block text-[11px] font-semibold text-white/75">{item.label}</span>
              <span className="block text-[9px] text-white/25">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!configured && config && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand-amber/20 bg-brand-amber/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-brand-amber/90">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Add a real API key on the server to enable generation.{' '}
            <a href="#setup" className="font-semibold underline decoration-brand-amber/40 underline-offset-2">
              View setup
            </a>
            .
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={configured ? onGenerate : onSetup}
        disabled={configured && (busy || !canGenerate)}
        className="btn-primary h-[52px] w-full px-5 text-[14px]"
      >
        {!configured ? (
          <>
            <KeyRound className="h-4 w-4" />
            Connect API to generate
          </>
        ) : busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {submitting ? 'Submitting to Replicate…' : 'Rendering your video…'}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate video
            <span className="ml-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-medium text-white/80">
              {duration}s · {aspectRatio}
            </span>
          </>
        )}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-white/25">
        <ShieldCheck className="h-3 w-3 text-emerald-400/60" />
        API key stays on the server · provider costs billed to your account
      </p>
    </div>
  );
}
