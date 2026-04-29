import { useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';

const COLORS = ['#4573D2', '#22c55e', '#a78bfa', '#38bdf8', '#f472b6'];

function Celebration({ show, onComplete }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!show) { setActive(false); return; }

    setActive(true);

    // Single elegant burst — small, centered, quick
    confetti({
      particleCount: 45,
      spread: 55,
      startVelocity: 22,
      decay: 0.88,
      ticks: 55,
      origin: { x: 0.5, y: 0.5 },
      colors: COLORS,
      scalar: 0.85,
      gravity: 1.1,
      zIndex: 10000,
    });

    const end = setTimeout(() => { setActive(false); onComplete?.(); }, 1000);
    return () => clearTimeout(end);
  }, [show, onComplete]);

  return null;
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
