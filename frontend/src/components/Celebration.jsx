import { useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';

const CREATURES = ['🦄', '🐉', '🐳', '🦅', '🦕', '🦩', '🐎', '🦋'];
const RAINBOW = ['#FF6B6B', '#FF8E53', '#FFC53D', '#52C41A', '#1890FF', '#722ED1', '#EB2F96'];

function fireConfettiBurst(x, y) {
  confetti({ particleCount: 20, spread: 360, startVelocity: 30, ticks: 60, zIndex: 10000, origin: { x, y }, colors: RAINBOW, scalar: 1 });
}

function Celebration({ show, onComplete }) {
  const [creatures, setCreatures] = useState([]);
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    if (!show) { setPhase('idle'); return; }

    // Pick 5 random unique creatures
    const shuffled = [...CREATURES].sort(() => Math.random() - 0.5);
    setCreatures([
      { emoji: shuffled[0], size: 160, delay: 0,    top: 0 },
      { emoji: shuffled[1], size: 160, delay: 0.15, top: 10 },
      { emoji: shuffled[2], size: 160, delay: 0.3,  top: -6 },
      { emoji: shuffled[3], size: 160, delay: 0.45, top: 14 },
      { emoji: shuffled[4], size: 160, delay: 0.6,  top: -10 },
    ]);
    setPhase('flying');

    // Confetti bursts along the diagonal path (bottom-left to top-right)
    const timers = [
      setTimeout(() => fireConfettiBurst(0.15, 0.75), 250),
      setTimeout(() => fireConfettiBurst(0.3, 0.6), 500),
      setTimeout(() => fireConfettiBurst(0.5, 0.45), 800),
      setTimeout(() => fireConfettiBurst(0.7, 0.3), 1100),
      setTimeout(() => fireConfettiBurst(0.85, 0.2), 1350),
    ];

    // Big finale
    const finale = setTimeout(() => {
      confetti({ particleCount: 80, spread: 120, origin: { x: 0.5, y: 0.35 }, colors: RAINBOW, startVelocity: 40, gravity: 0.7, ticks: 100, zIndex: 10000, scalar: 1.2 });
      confetti({ particleCount: 40, spread: 80, origin: { x: 0.6, y: 0.25 }, colors: RAINBOW, startVelocity: 30, gravity: 0.6, ticks: 80, zIndex: 10000 });
    }, 700);

    const end = setTimeout(() => { setPhase('done'); onComplete?.(); }, 2500);

    return () => { timers.forEach(clearTimeout); clearTimeout(finale); clearTimeout(end); };
  }, [show, onComplete]);

  if (phase !== 'flying') return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 9999 }}>
      {/* Rainbow trails — diagonal from bottom-left to top-right */}
      {[0, 1, 2].map(i => (
        <div key={i} className="absolute" style={{
          bottom: 0, left: 0,
          height: 12 - i * 3,
          borderRadius: 6,
          opacity: 1 - i * 0.2,
          background: `linear-gradient(135deg, ${RAINBOW.join(', ')}, transparent)`,
          transformOrigin: 'bottom left',
          transform: 'rotate(-35deg)',
          animation: `asana-rainbow-diag ${1.8 + i * 0.1}s ease-out ${i * 0.05}s forwards`,
        }} />
      ))}

      {/* Flying creatures — bottom-left to top-right */}
      {creatures.map((c, i) => (
        <div key={i} className="absolute" style={{
          bottom: -c.size,
          left: -c.size,
          fontSize: c.size,
          lineHeight: 1,
          animation: `asana-fly-diag ${2 + i * 0.2}s cubic-bezier(0.22, 0.61, 0.36, 1) ${c.delay}s forwards`,
          filter: `drop-shadow(0 10px 30px rgba(0,0,0,0.3))`,
          opacity: 0,
          zIndex: 10 - i,
          '--offset-y': `${c.top}vh`,
        }}>
          {c.emoji}
        </div>
      ))}

      {/* Sparkle stars along diagonal */}
      {Array.from({ length: 14 }, (_, i) => {
        const progress = i / 13;
        return (
          <div key={`s-${i}`} className="absolute rounded-full" style={{
            left: `${5 + progress * 90}%`,
            bottom: `${5 + (1 - progress) * 80}%`,
            width: 5 + Math.random() * 6,
            height: 5 + Math.random() * 6,
            background: RAINBOW[i % RAINBOW.length],
            boxShadow: `0 0 10px ${RAINBOW[i % RAINBOW.length]}, 0 0 20px ${RAINBOW[i % RAINBOW.length]}50`,
            animation: `asana-sparkle-pop 0.7s ease-out ${0.15 + i * 0.09}s both`,
            zIndex: 3,
          }} />
        );
      })}

      <style>{`
        @keyframes asana-fly-diag {
          0% {
            transform: translate(0, 0) rotate(15deg) scale(0.4);
            opacity: 0;
          }
          5% { opacity: 1; }
          20% {
            transform: translate(28vw, calc(-30vh + var(--offset-y))) rotate(-8deg) scale(1.1);
          }
          40% {
            transform: translate(48vw, calc(-50vh + var(--offset-y))) rotate(10deg) scale(1.05);
          }
          60% {
            transform: translate(68vw, calc(-65vh + var(--offset-y))) rotate(-6deg) scale(1);
          }
          80% {
            transform: translate(88vw, calc(-80vh + var(--offset-y))) rotate(8deg) scale(0.95);
          }
          92% { opacity: 1; }
          100% {
            transform: translate(110vw, calc(-100vh + var(--offset-y))) rotate(-4deg) scale(0.8);
            opacity: 0;
          }
        }
        @keyframes asana-rainbow-diag {
          0% { width: 0; opacity: 0; }
          8% { opacity: 0.9; }
          70% { opacity: 0.7; }
          100% { width: 160vw; opacity: 0; }
        }
        @keyframes asana-sparkle-pop {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          35% { transform: scale(2) rotate(180deg); opacity: 1; }
          100% { transform: scale(0) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function useCelebration() {
  const [celebrating, setCelebrating] = useState(false);

  const celebrate = useCallback(() => {
    setCelebrating(true);
  }, []);

  const CelebrationComponent = useCallback(() => (
    <Celebration show={celebrating} onComplete={() => setCelebrating(false)} />
  ), [celebrating]);

  return { celebrate, CelebrationComponent };
}

export default Celebration;
