/**
 * PANDA AI STUDIO — backend
 * - Serves frontend from /public
 * - Keeps API keys server-side only
 * - POST /api/generate proxies to Replicate / HuggingFace / Custom endpoint
 * - GET  /api/config reports demoMode (no keys leaked)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
const hasHF = !!process.env.HF_TOKEN;
const hasCustom = !!process.env.CUSTOM_VIDEO_API_URL;
const demoMode = !(hasReplicate || hasHF || hasCustom);

app.get('/api/config', (req, res) => {
  res.json({
    demoMode,
    providers: {
      replicate: hasReplicate,
      huggingface: hasHF,
      custom: hasCustom
    },
    message: demoMode
      ? 'Demo mode: no video API configured. See SETUP.md to connect a real AI video model. No fake videos will be presented as real.'
      : 'Real AI video generation is configured.'
  });
});

// Style prompt enhancers (appended server-side so UI stays clean)
const STYLE_SUFFIX = {
  Cinematic: ', cinematic lighting, 35mm film, dramatic camera dolly, shallow depth of field, ultra detailed',
  Realistic: ', photorealistic, natural lighting, 8k detail, real-world physics, steady camera',
  Anime: ', vibrant anime style, studio ghibli inspired, cel shaded, dynamic motion',
  '3D': ', high-quality 3d render, octane render, volumetric lighting, smooth motion',
  Animation: ', stylized 2d animation, smooth motion, colorful, expressive'
};

function buildPrompt(prompt, style) {
  return `${prompt}${STYLE_SUFFIX[style] || ''}`;
}

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, style = 'Cinematic', aspectRatio = '16:9', duration = 5, image } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Please enter a prompt of at least 3 characters.' });
    }
    if (!['9:16', '16:9', '1:1'].includes(aspectRatio)) {
      return res.status(400).json({ error: 'Invalid aspect ratio.' });
    }
    if (![5, 10].includes(Number(duration))) {
      return res.status(400).json({ error: 'Duration must be 5 or 10 seconds.' });
    }
    const fullPrompt = buildPrompt(prompt.trim().slice(0, 1000), style);

    if (demoMode) {
      return res.status(503).json({
        error: 'DEMO_MODE',
        message: 'No video-generation API is configured on this server. The app is in Demo Mode — it will show a clearly-labeled animated preview, NOT a fake AI video. To generate real videos, add a free API key (see SETUP.md).',
        howTo: 'Copy .env.example to .env and set REPLICATE_API_TOKEN or HF_TOKEN, then restart the server.'
      });
    }

    // Priority: Custom -> Replicate -> HuggingFace
    if (hasCustom) {
      const r = await fetch(process.env.CUSTOM_VIDEO_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.CUSTOM_VIDEO_API_KEY ? { Authorization: `Bearer ${process.env.CUSTOM_VIDEO_API_KEY}` } : {})
        },
        body: JSON.stringify({ prompt: fullPrompt, style, aspectRatio, duration, image: image || undefined })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: data.error || data.message || 'Custom video API failed.' });
      const videoUrl = data.videoUrl || data.video_url || data.url;
      if (!videoUrl) return res.status(502).json({ error: 'Custom API did not return a video URL.' });
      return res.json({ videoUrl, provider: 'custom', prompt: fullPrompt, demo: false });
    }

    if (hasReplicate) {
      const model = process.env.REPLICATE_MODEL || 'minimax/video-01';
      // Create prediction
      const createRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          Prefer: 'wait'
        },
        body: JSON.stringify({
          // Replicate supports model version or official model string via `model` on newer API;
          // use input-based call compatible with most video models.
          model,
          input: {
            prompt: fullPrompt,
            duration: Number(duration),
            aspect_ratio: aspectRatio,
            ...(image ? { first_frame_image: image } : {})
          }
        })
      });
      let pred = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        return res.status(createRes.status).json({ error: pred.detail || pred.error || 'Replicate API error. Check REPLICATE_API_TOKEN and REPLICATE_MODEL.' });
      }
      // Poll until succeeded/failed (max ~120s)
      const getUrl = pred.urls?.get || (pred.id ? `https://api.replicate.com/v1/predictions/${pred.id}` : null);
      const deadline = Date.now() + 120000;
      while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
        if (Date.now() > deadline) break;
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(getUrl, { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } });
        pred = await poll.json().catch(() => pred);
      }
      if (pred.status !== 'succeeded') {
        return res.status(502).json({ error: `Replicate generation ${pred.status || 'timed out'}. ${pred.error || 'Try again or shorten the prompt.'}` });
      }
      const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      const videoUrl = typeof out === 'string' ? out : out?.video || out?.url;
      if (!videoUrl) return res.status(502).json({ error: 'Replicate did not return a video file.' });
      return res.json({ videoUrl, provider: 'replicate', model, prompt: fullPrompt, demo: false });
    }

    if (hasHF) {
      const model = process.env.HF_MODEL || 'cerspense/zeroscope_v2_576w';
      const hfRes = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: fullPrompt, parameters: { num_frames: Number(duration) * 8 } })
      });
      if (!hfRes.ok) {
        const t = await hfRes.text().catch(() => '');
        // HF often returns "model loading" JSON — surface it clearly
        return res.status(hfRes.status).json({ error: `HuggingFace error: ${t.slice(0, 300) || hfRes.statusText}. The free Inference API may be warming up — wait ~1 min and retry.` });
      }
      const contentType = hfRes.headers.get('content-type') || '';
      if (contentType.includes('video') || contentType.includes('octet-stream')) {
        const buf = Buffer.from(await hfRes.arrayBuffer());
        return res.json({ videoBase64: `data:video/mp4;base64,${buf.toString('base64')}`, provider: 'huggingface', model, prompt: fullPrompt, demo: false });
      }
      const data = await hfRes.json().catch(() => ({}));
      const videoUrl = data.videoUrl || data.url;
      if (!videoUrl) return res.status(502).json({ error: 'HuggingFace did not return video bytes. Try a different HF_MODEL from SETUP.md.' });
      return res.json({ videoUrl, provider: 'huggingface', prompt: fullPrompt, demo: false });
    }

    return res.status(503).json({ error: 'No provider configured.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error generating video. Check server logs and API keys.' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, demoMode }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🐼 PANDA AI STUDIO running on http://localhost:${PORT}`);
  console.log(demoMode
    ? '⚠️  DEMO MODE — no video API key found. See SETUP.md to enable real generation.'
    : '✅ Real video API configured.');
});
