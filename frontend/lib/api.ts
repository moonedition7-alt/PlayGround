export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const LANGUAGES = ["Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia", "Urdu", "English"];
export const PIPELINE_STEPS = ["Extract audio", "Separate vocals", "Transcribe", "Translate", "Generate voice", "Sync", "Merge"];

export type Job = {
  id: string; name: string; source_language: string; targets: string[]; status: string;
  step: string; progress: number; message: string; created_at: string; duration: number; error?: string;
};
export type Segment = { start: number; end: number; text: string; translation: Record<string, string> };
export type JobDetail = Job & { options: Record<string, unknown>; segments: Segment[]; result: Record<string, Record<string, string>>; original_url: string };
export type Usage = { used_minutes: number; remaining_minutes: number; daily_limit_minutes: number };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const data = await response.json(); message = data.detail || data.message || message; } catch { /* use status message */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export function mediaUrl(path: string) { return path.startsWith("http") ? path : `${API_URL}${path}`; }
export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60), secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
