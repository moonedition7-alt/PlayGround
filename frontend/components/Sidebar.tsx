"use client";
import { AudioLines, BookOpen, Clapperboard, FileAudio, Home, Library, Mic2, PanelLeftClose, Sparkles, ChartNoAxesColumn, X } from "lucide-react";

const links = [
  { name: "Home", icon: Home, section: "WORKSPACE" },
  { name: "Text to Speech", icon: AudioLines },
  { name: "Dubbing", icon: Clapperboard },
  { name: "Voice Library", icon: Library, section: "VOICE TOOLS" },
  { name: "Voice Cloning", icon: Mic2 },
  { name: "Speech to Text", icon: FileAudio, section: "MORE" },
  { name: "Usage", icon: ChartNoAxesColumn },
  { name: "Docs", icon: BookOpen },
];

export default function Sidebar({ active, onNavigate, used, limit, open, onClose }: {
  active: string; onNavigate: (name: string) => void; used: number; limit: number; open: boolean; onClose: () => void;
}) {
  const percent = Math.min(100, used / Math.max(1, limit) * 100);
  return <>
    {open && <button className="sidebar-overlay" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><AudioLines size={18} strokeWidth={2.5} /></div>voxora<span style={{ color: "#a4b0aa", fontSize: 10, fontWeight: 600, letterSpacing: 0, marginLeft: -6 }}>studio</span><button className="close-button" style={{ marginLeft: "auto", display: "none" }} onClick={onClose} aria-label="Close"><X size={15} /></button></div>
      <div className="nav-caption">STUDIO</div>
      <nav className="nav-list">
        {links.map(({ name, icon: Icon, section }) => <div key={name}>
          {section && section !== "WORKSPACE" && <div className="nav-caption" style={{ marginTop: 24 }}>{section}</div>}
          {section === "WORKSPACE" && <div style={{ display: "none" }} />}
          <button className={`nav-link ${active === name ? "active" : ""}`} onClick={() => { onNavigate(name); onClose(); }}>
            <Icon strokeWidth={1.8} /> <span>{name}</span>{name === "Dubbing" && <span style={{ marginLeft: "auto", fontSize: 9, color: "#6aa982", background: "#ddf5e6", padding: "3px 6px", borderRadius: 4 }}>NEW</span>}
          </button>
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: "#52645a" }}><Sparkles size={14} color="#45a976" /> Free plan</div>
          <div className="plan-line"><span>Daily minutes</span><strong>{Math.max(0, limit - used).toFixed(0)} left</strong></div>
          <div className="usage-track"><div className="usage-fill" style={{ width: `${percent}%` }} /></div>
          <p className="plan-note">{used.toFixed(1)} of {limit} minutes used · resets daily</p>
        </div>
        <div className="account-row"><div className="avatar">V</div><div><div className="account-name">Your workspace</div><div className="account-sub">Free account</div></div><PanelLeftClose size={15} color="#a4ada8" style={{ marginLeft: "auto" }} /></div>
      </div>
    </aside>
  </>;
}
