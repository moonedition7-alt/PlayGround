import { useEffect, useRef, useState } from 'react'
import { openDB } from 'idb'
import { Aperture, ArrowDownToLine, ArrowRight, Check, CircleHelp, Clock3, Film, ImagePlus, LoaderCircle, LockKeyhole, Menu, Play, Plus, RefreshCw, Sparkles, Upload, WandSparkles, X } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const examples = [
  { title: 'Golden hour', prompt: 'A tiny sailboat gliding across a glassy lake at golden hour, warm reflections, distant mountains, cinematic slow tracking shot', image: 'sunset' },
  { title: 'Quiet morning', prompt: 'A sunlit reading nook, sheer curtains moving in a gentle breeze, dust motes floating in a beam of light, intimate film grain', image: 'room' },
  { title: 'Neon drift', prompt: 'A vintage sports car cruising through a rain-soaked Tokyo street at night, neon reflections, low-angle follow shot, atmospheric', image: 'night' },
]
const dbPromise = openDB('freevideo-studio', 1, { upgrade(db) { db.createObjectStore('videos', { keyPath: 'id' }) } })
const videoUrls = new Map()
const getVideoUrl = (entry) => {
  if (!entry.blob) return entry.url || ''
  if (!videoUrls.has(entry.id)) videoUrls.set(entry.id, URL.createObjectURL(entry.blob))
  return videoUrls.get(entry.id)
}
const getSession = () => { let id = localStorage.getItem('fvs-session'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('fvs-session', id) } return id }

function App() {
  const [tab, setTab] = useState('text')
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState('blurry, low quality, distorted, text, watermark')
  const [motion, setMotion] = useState('')
  const [strength, setStrength] = useState(55)
  const [duration, setDuration] = useState(3)
  const [ratio, setRatio] = useState('16:9')
  const [resolution, setResolution] = useState('480p')
  const [seed, setSeed] = useState('')
  const [image, setImage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [history, setHistory] = useState([])
  const [job, setJob] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const fileInput = useRef(null)
  const sessionId = useRef(getSession())

  const refreshHistory = async () => {
    const db = await dbPromise
    const entries = (await db.getAll('videos')).sort((a, b) => b.created - a.created)
    setHistory(entries.map(entry => ({ ...entry, url: getVideoUrl(entry) })))
  }
  useEffect(() => {
    refreshHistory()
    return () => { for (const url of videoUrls.values()) URL.revokeObjectURL(url); videoUrls.clear() }
  }, [])
  useEffect(() => () => { if (image?.url) URL.revokeObjectURL(image.url) }, [image?.url])

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/jobs/${job.id}`, { headers: { 'X-Session-ID': sessionId.current } })
        if (!res.ok) throw new Error('Could not check the render status.')
        const next = await res.json()
        setJob(next)
        if (next.status === 'completed') {
          clearInterval(timer)
          const videoRes = await fetch(`${API}${next.video_url}`, { headers: { 'X-Session-ID': sessionId.current } })
          if (!videoRes.ok) throw new Error('Your render finished, but the video could not be downloaded.')
          const blob = await videoRes.blob()
          const entry = { id: next.id, prompt: next.prompt || prompt || motion || 'Untitled creation', created: Date.now(), blob, type: 'video/mp4', duration: next.duration || duration, ratio: next.aspect_ratio || ratio }
          entry.url = getVideoUrl(entry)
          const db = await dbPromise; await db.put('videos', entry); await refreshHistory(); setSelected(entry)
        } else if (next.status === 'failed') { clearInterval(timer); setError(next.error || 'The render failed. Try again in a minute.') }
      } catch (e) { setError(e.message || 'Unable to reach the video server.') }
    }, 1800)
    return () => clearInterval(timer)
  }, [job?.id, job?.status])

  const chooseImage = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose a JPG, PNG, or WebP image.'); return }
    if (file.size > 12 * 1024 * 1024) { setError('Images must be smaller than 12 MB.'); return }
    setImage({ file, url: URL.createObjectURL(file), name: file.name }); setError('')
  }
  const enhance = async () => {
    if (!prompt.trim()) { setError('Add a few words to your prompt first.'); return }
    setEnhancing(true); setError('')
    try {
      const res = await fetch(`${API}/api/enhance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
      if (res.ok) { const data = await res.json(); setPrompt(data.prompt); setEnhancing(false); return }
    } catch { /* use the local template when offline */ }
    const clean = prompt.trim().replace(/[.!?]+$/, '')
    setPrompt(`${clean}. Cinematic composition, thoughtful camera movement, natural lighting, rich fine detail, atmospheric depth, smooth motion, filmic color grading.`)
    setEnhancing(false)
  }
  const generate = async () => {
    if (tab === 'image' && !image) { setError('Add an image to animate first.'); return }
    if (tab === 'text' && !prompt.trim()) { setError('Describe the video you want to make.'); return }
    if (job && ['queued', 'running'].includes(job.status)) return
    setError(''); setSelected(null); setJob({ status: 'submitting', progress: 0 })
    const common = { duration, aspect_ratio: ratio, resolution, seed: seed === '' ? null : Number(seed), negative_prompt: negative }
    try {
      let res
      if (tab === 'image') {
        const data = new FormData(); data.append('image', image.file); data.append('prompt', motion); Object.entries(common).forEach(([k, v]) => { if (v !== null && v !== undefined) data.append(k, v) })
        data.append('motion_strength', strength / 100)
        res = await fetch(`${API}/api/jobs/image`, { method: 'POST', headers: { 'X-Session-ID': sessionId.current }, body: data })
      } else {
        res = await fetch(`${API}/api/jobs/text`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-ID': sessionId.current }, body: JSON.stringify({ prompt, ...common }) })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || (res.status === 503 ? 'The GPU is busy. Try again in 1 minute.' : 'Could not start your render.'))
      setJob(data)
    } catch (e) { setJob(null); setError(e.message === 'Failed to fetch' ? 'Cannot reach the render server. Start the FastAPI backend and try again.' : e.message) }
  }
  const removeHistory = async (id) => { const db = await dbPromise; await db.delete('videos', id); const url = videoUrls.get(id); if (url) URL.revokeObjectURL(url); videoUrls.delete(id); if (selected?.id === id) setSelected(null); await refreshHistory() }
  const activeJob = job && ['submitting', 'queued', 'running'].includes(job.status)
  const active = selected
  const currentVideoUrl = active?.url || ''
  const tabs = [{ id: 'text', label: 'Text to Video', icon: WandSparkles }, { id: 'image', label: 'Image to Video', icon: ImagePlus }, { id: 'history', label: 'History', icon: Clock3 }]

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('text') }}><span className="brand-icon"><Aperture size={19} strokeWidth={2.2}/></span><span>freevideo<span className="brand-light"> studio</span></span><span className="beta">BETA</span></a>
      <div className="top-center"><span className="online-dot"/> Open models <span className="top-separator">·</span> Free forever <span className="top-separator">·</span> Runs on open-source AI</div>
      <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation">{mobileMenu ? <X size={20}/> : <Menu size={20}/>}</button>
      <div className={`top-actions ${mobileMenu ? 'show' : ''}`}><span className="privacy-tag"><LockKeyhole size={13}/> Private by default</span><a className="github-link" href="https://github.com/huggingface/diffusers" target="_blank" rel="noreferrer">How it works <ArrowRight size={14}/></a></div>
    </header>
    <main className="main-wrap">
      <section className="hero"><div className="eyebrow"><span className="eyebrow-line"/> YOUR IDEAS, IN MOTION <span className="eyebrow-line"/></div><h1>Make a little <span>movie.</span></h1><p>Turn a thought or a still image into a moving moment.<br className="desktop-break"/> Free, private, and powered by open-source AI.</p></section>
      <div className="workspace">
        <nav className="tab-bar" aria-label="Video tools">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setError(''); setMobileMenu(false) }} className={`tab ${tab === id ? 'active' : ''}`}><Icon size={16}/>{label}{id === 'history' && history.length > 0 && <span className="history-count">{history.length}</span>}</button>)}<span className="tab-spacer"/><span className="session-note"><LockKeyhole size={12}/> No account needed</span></nav>
        {tab === 'history' ? <HistoryView history={history} selected={selected} onSelect={setSelected} onDelete={removeHistory} /> : <div className="studio-grid">
          <section className="control-card">
            {tab === 'text' ? <>
              <div className="card-heading"><div><div className="section-kicker">START WITH A THOUGHT</div><h2>Describe your scene</h2></div><span className="step-badge">01 <span>/ 02</span></span></div>
              <label className="field-label" htmlFor="prompt">Your prompt <span className="optional">Be as descriptive as you like</span></label>
              <textarea id="prompt" className="prompt-input" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A tiny sailboat gliding across a glassy lake at golden hour..." maxLength={1000}/>
              <div className="prompt-footer"><span>{prompt.length}/1000</span><button className="enhance-button" onClick={enhance} disabled={enhancing}>{enhancing ? <LoaderCircle className="spin" size={14}/> : <Sparkles size={14}/>} Enhance prompt</button></div>
              <label className="field-label negative-label" htmlFor="negative">Negative prompt <span className="optional">What to avoid</span></label>
              <input id="negative" className="text-input" value={negative} onChange={e => setNegative(e.target.value)} placeholder="blurry, text, watermark..."/>
            </> : <>
              <div className="card-heading"><div><div className="section-kicker">GIVE A STILL SOME LIFE</div><h2>Animate an image</h2></div><span className="step-badge">01 <span>/ 02</span></span></div>
              <div className={`upload-zone ${dragging ? 'dragging' : ''} ${image ? 'has-image' : ''}`} onClick={() => !image && fileInput.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); chooseImage(e.dataTransfer.files[0]) }}>
                {image ? <><img src={image.url} alt="Selected image"/><div className="upload-overlay"><span className="file-name">{image.name}</span><button className="remove-image" onClick={e => { e.stopPropagation(); URL.revokeObjectURL(image.url); setImage(null) }} aria-label="Remove image"><X size={16}/></button></div></> : <div className="upload-content"><div className="upload-icon"><Upload size={19}/></div><strong>Drop your image here</strong><span>or <button onClick={e => { e.stopPropagation(); fileInput.current?.click() }}>browse files</button></span><small>JPG, PNG or WebP · up to 12 MB</small></div>}
              </div><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { chooseImage(e.target.files?.[0]); e.target.value = '' }}/>
              <label className="field-label motion-label" htmlFor="motion">Motion prompt <span className="optional">Optional</span></label><textarea id="motion" className="motion-input" value={motion} onChange={e => setMotion(e.target.value)} placeholder="Gentle waves ripple, camera slowly pushes in..." maxLength={500}/>
              <div className="slider-row"><label htmlFor="strength">Motion strength</label><input id="strength" type="range" min="0" max="100" value={strength} style={{'--range-progress': `${strength}%`}} onChange={e => setStrength(+e.target.value)}/><span className="slider-value">{strength}%</span></div>
            </>}
            <div className="divider"/><div className="settings-head"><span>OUTPUT SETTINGS</span><span className="settings-hint">Fine-tune your clip <CircleHelp size={13}/></span></div>
            <div className="setting-row"><div className="setting-label">Duration</div><div className="segmented duration-segment">{[2,3,4,5].map(n => <button key={n} className={duration === n ? 'selected' : ''} onClick={() => setDuration(n)}>{n}<small>s</small></button>)}</div></div>
            <div className="setting-row"><div className="setting-label">Aspect ratio</div><div className="segmented ratio-segment">{['16:9','9:16','1:1'].map((r, i) => <button key={r} className={ratio === r ? 'selected' : ''} onClick={() => setRatio(r)}><span className={`ratio-icon ratio-${i}`}/>{r}</button>)}</div></div>
            <div className="setting-row last-row"><div className="setting-label">Resolution</div><div className="segmented resolution-segment">{['480p','720p'].map(r => <button key={r} className={resolution === r ? 'selected' : ''} onClick={() => setResolution(r)}>{r}</button>)}</div><div className="seed-wrap"><label htmlFor="seed">Seed</label><input id="seed" value={seed} onChange={e => setSeed(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="Random" inputMode="numeric"/></div></div>
            {error && <div className="error-message"><X size={15}/><span>{error}</span></div>}
            <button className="generate-button" onClick={generate} disabled={!!activeJob}>{activeJob ? <><LoaderCircle size={17} className="spin"/> Creating your video...</> : <><Sparkles size={17}/> Generate video <span className="button-cost">Free</span></>}</button>
            <div className="under-button"><LockKeyhole size={12}/> Your prompts and images stay yours</div>
          </section>
          <section className="preview-column"><Preview active={active} url={currentVideoUrl} job={job} onGenerate={generate} onDownload={() => downloadEntry(active, job, API)} tab={tab}/></section>
        </div>}
      </div>
      {tab !== 'history' && <section className="examples-section"><div className="examples-heading"><div><span className="section-kicker">A LITTLE INSPIRATION</span><h2>Start with an idea</h2></div><span>Click an idea to make it yours <ArrowRight size={13}/></span></div><div className="examples-grid">{examples.map((item, i) => <button className="example-card" key={item.title} onClick={() => { setTab('text'); setPrompt(item.prompt); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><div className={`example-art art-${item.image}`}><span className="art-number">0{i+1}</span><span className="art-play"><Play size={13} fill="currentColor"/></span><div className="art-caption">{item.title}</div></div><div className="example-copy"><span>{item.title}</span><Plus size={15}/></div></button>)}</div></section>}
      <footer className="footer"><a className="footer-brand" href="#" onClick={e => e.preventDefault()}><Aperture size={14}/> freevideo studio</a><span>Open source, open possibilities.</span><span className="footer-model"><span className="online-dot"/> Powered by Diffusers</span></footer>
    </main>
  </div>
}

function downloadEntry(entry, job, api) {
  const url = entry?.url || (job?.status === 'completed' && job.video_url ? `${api}${job.video_url}` : '')
  if (!url) return
  const link = document.createElement('a')
  link.href = url
  link.download = `freevideo-${entry?.id || job?.id || 'creation'}.mp4`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function Preview({ active, url, job, onGenerate, onDownload, tab }) {
  const isActive = job && ['submitting', 'queued', 'running'].includes(job.status)
  const progress = Math.max(0, Math.min(100, job?.progress || 0))
  const eta = job?.estimated_seconds
  return <div className="preview-card">
    <div className="preview-heading"><div><span className="section-kicker">YOUR CANVAS</span><h2>{active ? 'A moment, made yours' : 'The story starts here'}</h2></div><span className="preview-status"><span className={`status-dot ${isActive ? 'working' : ''}`}/>{isActive ? job.status === 'queued' ? 'In queue' : 'Rendering' : active ? 'Ready' : 'Preview'}</span></div>
    <div className={`video-stage ${url ? 'has-video' : ''}`}>
      {url ? <video key={url} src={url} controls playsInline /> : isActive ? <div className="render-state"><div className="render-orbit"><Film size={25}/></div><strong>{job.status === 'queued' ? 'Your turn is coming up' : 'Making your movie'}</strong><span>{job.status === 'queued' ? `Position ${job.queue_position || '…'} in the queue` : 'Creating each frame with open-source AI'}</span><div className="progress-track"><span style={{ width: `${job.status === 'queued' ? 8 : Math.max(4, progress)}%` }}/></div><div className="progress-meta"><span>{job.status === 'queued' ? 'Waiting for GPU' : `${progress}% complete`}</span><span>{eta ? `~${Math.ceil(eta / 60)} min` : 'Estimating…'}</span></div></div> : <div className="empty-preview"><div className="preview-art"><span className="preview-sun"/><span className="preview-hill hill-one"/><span className="preview-hill hill-two"/><span className="preview-water"/><span className="preview-grain"/></div><div className="empty-overlay"><span className="play-ring"><Play size={17} fill="currentColor"/></span><span>{tab === 'image' ? 'A little motion goes a long way' : 'Your next favorite moment'}</span></div></div>}
    </div>
    <div className="preview-bottom">{active ? <><div className="video-info"><span className="video-info-label">YOUR VIDEO</span><span className="video-info-prompt">{active.prompt}</span></div><button className="download-button" onClick={onDownload}><ArrowDownToLine size={15}/> Download MP4</button></> : isActive ? <div className="queue-note"><Clock3 size={14}/> This can take a few minutes on a shared GPU.</div> : <><div className="preview-hint"><span className="hint-icon"><Check size={13}/></span><span>MP4 · 8 fps · saved privately in this browser</span></div><button className="preview-cta" onClick={onGenerate}>Make it real <ArrowRight size={14}/></button></>}</div>
    {active && <button className="regenerate-button" onClick={onGenerate}><RefreshCw size={13}/> Make another version</button>}
  </div>
}

function HistoryView({ history, selected, onSelect, onDelete }) {
  if (!history.length) return <section className="history-view"><div className="history-empty"><span className="history-empty-icon"><Film size={23}/></span><h2>Your little library</h2><p>Videos you make will live here, saved only in this browser.</p><span className="history-empty-note"><LockKeyhole size={12}/> Stored on this device</span></div></section>
  return <section className="history-view"><div className="history-view-heading"><div><span className="section-kicker">YOUR PRIVATE LIBRARY</span><h2>{history.length} {history.length === 1 ? 'moment' : 'moments'} made</h2></div><span className="history-local"><LockKeyhole size={12}/> Only you can see these</span></div><div className="history-grid">{history.map(item => <article className={`history-item ${selected?.id === item.id ? 'chosen' : ''}`} key={item.id}><button className="history-thumb" onClick={() => onSelect(item)} aria-label={`Play ${item.prompt}`}><video src={item.url} preload="metadata"/><span className="history-play"><Play size={15} fill="currentColor"/></span></button><div className="history-item-copy"><button className="history-prompt" onClick={() => onSelect(item)}>{item.prompt}</button><span>{new Date(item.created).toLocaleDateString()} · {item.duration}s</span></div><button className="history-delete" onClick={() => onDelete(item.id)} aria-label="Delete video"><X size={14}/></button></article>)}</div>{selected && <div className="history-selected"><div><span className="section-kicker">NOW PLAYING</span><strong>{selected.prompt}</strong></div><button className="download-button" onClick={() => downloadEntry(selected, null, API)}><ArrowDownToLine size={15}/> Download MP4</button></div>}</section>
}

export default App
