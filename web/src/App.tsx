import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';

export function App() {
  // Fix mobile viewport height (accounts for browser chrome bar)
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    return () => window.removeEventListener('resize', setVh);
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <Outlet />
    </div>
  );
}
