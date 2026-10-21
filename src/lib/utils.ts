export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export function aspectClass(ratio: string): string {
  if (ratio === '9:16') return 'aspect-[9/16]';
  if (ratio === '1:1') return 'aspect-square';
  return 'aspect-video';
}

export function aspectValue(ratio: string): string {
  if (ratio === '9:16') return '9 / 16';
  if (ratio === '1:1') return '1 / 1';
  return '16 / 9';
}

export function estimatedCost(
  pricing: Record<string, number> | undefined,
  resolution: string,
  duration: number,
): string {
  const perSecond = pricing?.[resolution];
  if (!perSecond) return '—';
  return `$${(perSecond * duration).toFixed(2)}`;
}

export function shortModelName(model: string): string {
  const name = model.split('/').pop() ?? model;
  return name.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
