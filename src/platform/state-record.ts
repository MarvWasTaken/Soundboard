import { recoverState } from '../domain/validation.ts';
import type { RepositoryLoad } from './contracts.ts';
export function readStateRecord(raw: unknown): RepositoryLoad {
  const loaded = recoverState(raw);
  if (raw === undefined) return { ...loaded, baseline: null };
  if (typeof raw === 'string') return { ...loaded, baseline: raw };
  return { ...loaded, baseline: null, readOnly: true, warnings: [...loaded.warnings, 'Der lokale Datenbestand hat ein unerwartetes Speicherformat. Die Originaldaten bleiben geschützt. Bitte erneut laden.'] };
}
