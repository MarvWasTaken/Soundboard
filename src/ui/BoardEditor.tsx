import { useState } from 'react';
import { Text } from 'react-native';
import { errorMessage } from '../domain/errors';
import { Action } from './Action';
import { EditorDialog, EditorError, Field, ReloadNotice } from './EditorDialog';
import { styles } from './theme';
export function BoardEditor({ name, readOnly, onReload, onSave, onClose }: { name?: string; readOnly: boolean; onReload: () => void; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(name ?? ''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function save() {
    setSaving(true); setError('');
    try { await onSave(draft); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setSaving(false); }
  }
  return <EditorDialog title={name === undefined ? 'Neues Board' : 'Board umbenennen'} onClose={() => { if (!saving) onClose(); }}>
    <ReloadNotice readOnly={readOnly} onReload={onReload} />
    <Field label="Boardname" value={draft} onChange={setDraft} disabled={saving || readOnly} autoFocus />
    {!draft.trim() && <Text style={styles.body}>Gib deinem Board einen Namen.</Text>}
    <EditorError message={error} />
    <Action label={saving ? 'Wird gespeichert …' : name === undefined ? 'Board erstellen' : 'Namen speichern'} onPress={() => { void save(); }} disabled={saving || readOnly || !draft.trim()} />
    <Action label="Abbrechen" onPress={onClose} disabled={saving} secondary />
  </EditorDialog>;
}
export function DeleteBoardDialog({ name, readOnly, onReload, onDelete, onClose }: { name: string; readOnly: boolean; onReload: () => void; onDelete: () => Promise<void>; onClose: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function remove() {
    setSaving(true); setError('');
    try { await onDelete(); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setSaving(false); }
  }
  return <EditorDialog title="Board löschen?" onClose={() => { if (!saving) onClose(); }}>
    <Text style={styles.body}>„{name}“ und seine Buttons werden entfernt. Deine Sounds bleiben in der Bibliothek.</Text>
    <ReloadNotice readOnly={readOnly} onReload={onReload} />
    <EditorError message={error} />
    <Action label={saving ? 'Wird gelöscht …' : 'Board löschen bestätigen'} onPress={() => { void remove(); }} disabled={saving || readOnly} />
    <Action label="Abbrechen" onPress={onClose} disabled={saving} secondary />
  </EditorDialog>;
}
