export const PROMPT_IDEAS = [
  'A tiny astronaut discovers a glowing garden inside a moon crater, cinematic dolly-in, volumetric light, 35mm film grain.',
  'Slow aerial shot over a neon-lit Mumbai street after rain, mirrored reflections, drifting fog, anamorphic lens.',
  'A paper crane unfolds into a hummingbird and flies through a sunlit library, macro photography, shallow depth of field.',
  'Close-up of a barista pouring latte art in a cozy cafe, golden morning light, soft steam, shallow focus.',
  'A surreal desert with floating glass sculptures at golden hour, slow crane shot, warm haze, cinematic scale.',
  'A snow leopard walks through falling snow at dusk, telephoto documentary style, crisp fur detail, quiet atmosphere.',
  'A retro-futuristic train glides through a purple nebula, cinematic sci-fi, lens flares, stars stretching past.',
  'An origami city assembles itself on a wooden desk, stop-motion feel, warm lamp light, playful details.',
  'A lone lighthouse in a storm, waves crashing in slow motion, dramatic clouds, moody teal and amber grade.',
  'Macro shot of a blooming flower made of stained glass, light refracting through petals, dark velvet background.',
];

export function randomPrompt(exclude?: string): string {
  const options = PROMPT_IDEAS.filter((idea) => idea !== exclude);
  return options[Math.floor(Math.random() * options.length)] ?? PROMPT_IDEAS[0];
}

export const QUICK_PROMPTS = [
  { label: 'Cinematic space', prompt: PROMPT_IDEAS[0] },
  { label: 'Neon Mumbai', prompt: PROMPT_IDEAS[1] },
  { label: 'Nature macro', prompt: PROMPT_IDEAS[9] },
  { label: 'Sci-fi train', prompt: PROMPT_IDEAS[6] },
];
