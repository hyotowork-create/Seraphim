// Procedural WebAudio: low rumble, hard-panned whispers, a distant shriek.
export function createAudio() {
  let ctx = null;
  let master = null, whisperGain = null;
  let started = false;
  let shriekTimer = 45;
  let whisperTimer = 6;
  let side = 1;

  function makeNoiseBuffer(seconds, brown = false) {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * seconds, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  function start() {
    if (started) return;
    started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    // Low rumble: looped brown noise through a deep lowpass.
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = makeNoiseBuffer(7, true);
    rumbleSrc.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 65; lp.Q.value = 0.7;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.45;
    // Slow LFO so the rumble breathes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain).connect(rumbleGain.gain);
    lfo.start();
    rumbleSrc.connect(lp).connect(rumbleGain).connect(master);
    rumbleSrc.start();

    whisperGain = ctx.createGain();
    whisperGain.gain.value = 1.0;
    whisperGain.connect(master);
  }

  function whisper() {
    if (!ctx) return;
    const dur = 1.2 + Math.random() * 1.6;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 900;
    bp.Q.value = 6;
    // Syllable-ish amplitude shape.
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    const syll = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < syll; i++) {
      const t0 = now + (i / syll) * dur;
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t0 + 0.05);
      g.gain.linearRampToValueAtTime(0.004, t0 + dur / syll * 0.8);
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = side;
    side = -side;
    // Wandering filter = something almost saying words.
    bp.frequency.linearRampToValueAtTime(bp.frequency.value * (0.6 + Math.random() * 0.8), now + dur);
    src.connect(bp).connect(g).connect(pan).connect(whisperGain);
    src.start();
  }

  function shriek() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.025, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; // distance muffle
    // Cheap cavern: feedback delay.
    const delay = ctx.createDelay(); delay.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.4;
    delay.connect(fb).connect(delay);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.6;
    osc.connect(lp).connect(g).connect(pan).connect(master);
    g.connect(delay);
    delay.connect(master);
    osc.start(); osc.stop(now + 2.4);
  }

  function update(dt) {
    if (!ctx) return;
    whisperTimer -= dt;
    if (whisperTimer <= 0) {
      whisper();
      whisperTimer = 8 + Math.random() * 12;
    }
    shriekTimer -= dt;
    if (shriekTimer <= 0) {
      shriek();
      shriekTimer = 38 + Math.random() * 16;
    }
  }

  function duckWhispers(seconds) {
    if (!whisperGain) return;
    const now = ctx.currentTime;
    whisperGain.gain.cancelScheduledValues(now);
    whisperGain.gain.linearRampToValueAtTime(0.0, now + 1.2);
    whisperGain.gain.setValueAtTime(0.0, now + seconds - 4);
    whisperGain.gain.linearRampToValueAtTime(1.0, now + seconds);
  }

  function fadeOut(seconds) {
    if (!master) return;
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + seconds);
  }

  return { start, update, duckWhispers, fadeOut, onLantern: () => {}, onDawn: () => {} };
}
