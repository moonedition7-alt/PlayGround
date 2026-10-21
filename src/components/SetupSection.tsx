import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  Lock,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { AppConfig } from '../lib/types';
import { copyText } from '../lib/utils';

const ENV_SNIPPET = `# .env — keep this file private
REPLICATE_API_TOKEN=r8_your_token_here
REPLICATE_MODEL=bytedance/seedance-1-lite
REPLICATE_RESOLUTION=720p

# optional
PORT=3001
DATA_DIR=./server/data
JOB_CONCURRENCY=2
RETENTION_DAYS=7`;

export function SetupSection({
  config,
  notify,
}: {
  config: AppConfig | null;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [copied, setCopied] = useState(false);
  const configured = Boolean(config?.configured);

  const handleCopy = async () => {
    const ok = await copyText(ENV_SNIPPET);
    setCopied(ok);
    notify(ok ? 'Environment template copied.' : 'Could not copy the template.', ok ? 'success' : 'error');
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      title: 'Create a Replicate account',
      body: 'Replicate hosts Seedance 1.0 Lite and other real video models. New accounts may include free starter credit.',
      action: { label: 'Open Replicate', href: config?.setupUrl ?? 'https://replicate.com/account/api-tokens' },
    },
    {
      title: 'Create an API token',
      body: 'In your Replicate account settings, create a token and copy it once. Treat it like a password.',
      action: { label: 'API tokens', href: config?.setupUrl ?? 'https://replicate.com/account/api-tokens' },
    },
    {
      title: 'Add it to the server environment',
      body: 'Create a .env file in the project root (copy .env.example) and paste the token. Never commit .env to git.',
      code: 'cp .env.example .env',
    },
    {
      title: 'Restart and verify',
      body: 'Restart the Node server. The header status should read “API connected” and generation will use real provider output.',
      code: 'npm run dev',
    },
  ];

  return (
    <section id="setup" className="scroll-mt-24 pb-16 pt-4 lg:pb-24">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-amber/80">
          <KeyRound className="h-3 w-3" />
          API connection
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Connect a real video model.
        </h2>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-white/40">
          Info Ranga AI never ships with a demo provider. Until a key is configured, generation is
          disabled and this page explains exactly how to connect Replicate.
        </p>
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <div
          className={
            configured
              ? 'flex flex-col gap-3 border-b border-emerald-400/15 bg-emerald-400/[0.045] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'
              : 'flex flex-col gap-3 border-b border-brand-amber/15 bg-brand-amber/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'
          }
        >
          <div className="flex items-start gap-3">
            <span
              className={
                configured
                  ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                  : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-amber/25 bg-brand-amber/10 text-brand-amber'
              }
            >
              {configured ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-white">
                {configured ? 'Replicate is connected' : 'No video API connected yet'}
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                {configured
                  ? `${config?.modelLabel ?? 'Seedance 1.0 Lite'} · ${config?.model ?? 'bytedance/seedance-1-lite'}`
                  : 'Generation is blocked until the server has a valid token. The interface remains free to explore.'}
              </p>
            </div>
          </div>
          <span
            className={
              configured
                ? 'inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold text-emerald-300'
                : 'inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-amber/25 bg-brand-amber/10 px-3 py-1 text-[10px] font-semibold text-brand-amber'
            }
          >
            <span className={configured ? 'h-1.5 w-1.5 rounded-full bg-emerald-400' : 'h-1.5 w-1.5 rounded-full bg-brand-amber'} />
            {configured ? 'Connected · server-side' : 'Action required'}
          </span>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-white/[0.06] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <h3 className="font-display text-[15px] font-semibold text-white">Setup in four steps</h3>
            <ol className="mt-5 space-y-5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-orange/25 bg-brand-orange/[0.08] text-[10px] font-bold text-brand-amber">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/85">{step.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/40">{step.body}</p>
                    {step.action && (
                      <a
                        href={step.action.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-brand-amber/90 transition hover:text-brand-amber"
                      >
                        {step.action.label}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    )}
                    {step.code && (
                      <code className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1 font-mono text-[10px] text-white/55">
                        <Terminal className="h-3 w-3 text-brand-violet/70" />
                        {step.code}
                      </code>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-xl border border-brand-violet/15 bg-brand-violet/[0.05] p-3.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-violet/90">
                <Sparkles className="h-3 w-3" />
                Free mode &amp; costs
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                The interface is free to use. Video generation is billed by the model provider.
                {config?.freeTierNote ?? ' Replicate offers free starter credit for new accounts.'}{' '}
                <a
                  href={config?.pricingUrl ?? 'https://replicate.com/pricing'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-brand-amber/80 underline decoration-brand-amber/30 underline-offset-2 hover:text-brand-amber"
                >
                  Current pricing
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </p>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold text-white">
                <ServerCog className="h-3.5 w-3.5 text-white/40" />
                Environment template
              </h3>
              <button
                type="button"
                onClick={handleCopy}
                className="btn-ghost h-8 px-2.5 text-[10px]"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#05040a]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-white/25">.env</span>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8px] text-white/25">
                  server only
                </span>
              </div>
              <pre className="overflow-x-auto p-3.5 font-mono text-[10px] leading-[1.8] text-white/50">
                <code>{ENV_SNIPPET}</code>
              </pre>
            </div>

            <div className="mt-4 space-y-2.5">
              {[
                { icon: Lock, text: 'The token is read only by the Express server. It is never sent to the browser.' },
                { icon: ShieldCheck, text: 'Keys are excluded from git through .env in .gitignore. Never use a VITE_ prefix.' },
                { icon: Database, text: 'Generated MP4 files and history live in server/data. Use a persistent disk in production.' },
              ].map((item, index) => (
                <div key={index} className="flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/60" />
                  <p className="text-[10px] leading-relaxed text-white/35">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
              <p className="text-[10px] font-semibold text-white/60">Deploying</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                Build with <span className="font-mono text-white/55">npm run build</span> and start with{' '}
                <span className="font-mono text-white/55">npm start</span>. Add{' '}
                <span className="font-mono text-white/55">REPLICATE_API_TOKEN</span> in your host&apos;s
                environment settings and mount a persistent volume at{' '}
                <span className="font-mono text-white/55">/data</span> (set{' '}
                <span className="font-mono text-white/55">DATA_DIR=/data</span>).
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
