import type { StateBaseline } from './contracts.ts';
import { stateConflict } from '../domain/errors.ts';
export type StateTransaction = { runAsync(query: string, ...parameters: string[]): Promise<{ changes: number }> };
export async function commitNativeState(transaction: StateTransaction, json: string, expectedBaseline: StateBaseline): Promise<void> {
  const result = expectedBaseline === null
    ? await transaction.runAsync('INSERT INTO state (id, json) VALUES (1, ?) ON CONFLICT(id) DO NOTHING', json)
    : await transaction.runAsync('UPDATE state SET json = ? WHERE id = 1 AND json = ?', json, expectedBaseline);
  if (result.changes !== 1) throw stateConflict();
}
