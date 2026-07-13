let audioCtx: AudioContext | null = null;

/** One soft two-note chime; created lazily because AudioContext requires a user gesture first. */
export function chime(): void {
  try {
    audioCtx = audioCtx ?? new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [[880, 0], [1318.5, 0.09]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.55);
    });
  } catch {
    // Audio is a garnish; never let it break completion.
  }
}

const CONFETTI_COLOURS = ['#6B5DE8', '#4B3FD4', '#F59E0B', '#34C759', '#EFEDFC'];

export function confetti(): void {
  const n = 26;
  for (let i = 0; i < n; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
    piece.style.left = `${8 + Math.random() * 84}vw`;
    document.body.appendChild(piece);
    const drift = (Math.random() - 0.5) * 160;
    const fall = window.innerHeight * (0.5 + Math.random() * 0.4);
    const anim = piece.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px, ${fall}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 0 }
      ],
      { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' }
    );
    anim.onfinish = () => piece.remove();
  }
}
