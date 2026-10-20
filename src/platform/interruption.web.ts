export function watchInterruption(stop: () => void): () => void {
  const visibility = () => { if (document.visibilityState === 'hidden') stop(); };
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', stop);
  return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', stop); };
}
