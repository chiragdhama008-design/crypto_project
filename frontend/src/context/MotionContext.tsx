import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const MotionContext = createContext({ motionEnabled: true, toggleMotion: () => {} });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [motionEnabled, setMotionEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('chainguard-motion') || localStorage.getItem('tracex-motion');
      if (saved === 'full' || saved === 'reduced') return saved === 'full';
    } catch { /* Storage is optional. */ }
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    document.documentElement.dataset.motion = motionEnabled ? 'full' : 'reduced';
  }, [motionEnabled]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem('chainguard-motion') || localStorage.getItem('tracex-motion'); } catch { /* Storage is optional. */ }
      if (!saved) setMotionEnabled(!preference.matches);
    };
    preference.addEventListener('change', handleChange);
    return () => preference.removeEventListener('change', handleChange);
  }, []);

  function toggleMotion() {
    const next = !motionEnabled;
    setMotionEnabled(next);
    try { localStorage.setItem('chainguard-motion', next ? 'full' : 'reduced'); } catch { /* Storage is optional. */ }
  }

  return <MotionContext.Provider value={{ motionEnabled, toggleMotion }}>{children}</MotionContext.Provider>;
}

export const useMotion = () => useContext(MotionContext);
