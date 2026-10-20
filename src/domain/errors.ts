export class AppError extends Error {
  code: 'unsupported' | 'missing' | 'storage' | 'playback' | 'invalid' | 'conflict';
  constructor(code: AppError['code'], message: string) { super(message); this.code = code; }
}
export function stateConflict() {
  return new AppError('conflict', 'Deine Daten wurden in einer anderen Ansicht geändert. Diese Änderung wurde nicht gespeichert. Bitte erneut laden und danach noch einmal bearbeiten.');
}
export function errorMessage(error: unknown): string {
  return error instanceof AppError ? error.message : 'Das hat nicht funktioniert. Bitte erneut versuchen. Deine gespeicherten Daten bleiben erhalten.';
}
