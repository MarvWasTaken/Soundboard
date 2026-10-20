import { AppState } from 'react-native';
export function watchInterruption(stop: () => void): () => void {
  const subscription = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
  return () => subscription.remove();
}
