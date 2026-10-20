import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Board, BoardButton, Sound } from '../domain/model';
import type { ButtonDraft, ButtonLayout } from '../domain/board';
import { firstFreePosition, validatePlacement } from '../domain/board';
import { errorMessage } from '../domain/errors';
import { Action } from './Action';
import { EditorDialog, EditorError, Field, ReloadNotice } from './EditorDialog';
import { colors, styles } from './theme';

const sizes = [
  { label: 'Kompakt', width: 1, height: 1 }, { label: 'Breit', width: 2, height: 1 },
  { label: 'Hoch', width: 1, height: 2 }, { label: 'Groß', width: 2, height: 2 },
];
export function ButtonEditor({ board, button, sounds, unavailable, readOnly, onReload, onSave, onDelete, onClose }: {
  board: Board; button?: BoardButton; sounds: Sound[]; unavailable: string[]; readOnly: boolean;
  onReload: () => void; onSave: (draft: ButtonDraft) => Promise<void>; onDelete?: () => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState<ButtonDraft>(() => button ?? {
    label: '', soundId: sounds.find(sound => !unavailable.includes(sound.id))?.id ?? '', ...firstFreePosition(board.buttons), width: 1, height: 1,
  });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [focusedSound, setFocusedSound] = useState('');
  const sound = sounds.find(entry => entry.id === draft.soundId);
  const valid = !!draft.label.trim() && !!sound && !unavailable.includes(sound.id);
  const disabled = saving || readOnly;
  function layout(patch: Partial<ButtonLayout>) {
    const next = { ...draft, ...patch };
    try { validatePlacement(board.buttons, next, button?.id); setDraft(next); setError(''); }
    catch (failure) { setError(errorMessage(failure)); }
  }
  async function save() {
    setSaving(true); setError('');
    try { await onSave(draft); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setSaving(false); }
  }
  async function remove() {
    if (!onDelete) return; setSaving(true); setError('');
    try { await onDelete(); onClose(); } catch (failure) { setError(errorMessage(failure)); } finally { setSaving(false); }
  }
  return <EditorDialog title={button ? 'Button bearbeiten' : 'Neuer Soundbutton'} onClose={() => { if (!saving) onClose(); }}>
    <Text style={styles.body}>Auf „{board.name}“. Wähle eine Beschriftung und deinen Sound.</Text>
    <ReloadNotice readOnly={readOnly} onReload={onReload} />
    <Field label="Beschriftung" value={draft.label} onChange={label => { setError(''); setDraft(previous => ({ ...previous, label })); }} disabled={disabled} autoFocus={!button} />
    <View style={{ gap: 8 }}><Text style={{ color: colors.ink, fontWeight: '600', fontSize: 14 }}>Sound auswählen</Text>
      <ScrollView nestedScrollEnabled style={{ maxHeight: 210 }} contentContainerStyle={{ gap: 8 }}>
        {sounds.map((entry, index) => <Pressable key={entry.id} accessibilityRole="radio" accessibilityLabel={`${entry.name}, Sound ${index + 1}`} disabled={disabled || unavailable.includes(entry.id)}
          accessibilityState={{ checked: draft.soundId === entry.id, disabled: disabled || unavailable.includes(entry.id) }}
          aria-checked={draft.soundId === entry.id}
          onFocus={() => setFocusedSound(entry.id)} onBlur={() => setFocusedSound('')}
          onPress={() => { setError(''); setDraft(previous => ({ ...previous, soundId: entry.id })); }}
          style={{ padding: 12, minHeight: 48, borderRadius: 10, borderWidth: 2, borderColor: focusedSound === entry.id ? colors.ink : draft.soundId === entry.id ? colors.accent : colors.line, backgroundColor: draft.soundId === entry.id ? '#edf3e9' : colors.paper, opacity: unavailable.includes(entry.id) ? 0.5 : 1 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{draft.soundId === entry.id ? '●' : '○'} {entry.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{unavailable.includes(entry.id) ? 'Datei nicht verfügbar' : `Sound ${index + 1} · ${entry.trimStartSeconds.toFixed(2)}–${entry.trimEndSeconds.toFixed(2)} s`}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
    {!draft.label.trim() && <Text style={styles.body}>Bitte eine Beschriftung für den Button eingeben.</Text>}
    {!valid && draft.label.trim() && <EditorError message="Bitte einen verfügbaren Sound auswählen." />}
    {button ? <View style={{ gap: 14 }}>
      <Text style={styles.heading}>Position & Größe</Text><Text style={styles.body}>Spalte {draft.x + 1} · Zeile {draft.y + 1} · {draft.width} × {draft.height} Felder</Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Action label="← Links" accessibilityLabel="Nach links verschieben" onPress={() => layout({ x: draft.x - 1 })} disabled={disabled} secondary />
        <Action label="Rechts →" accessibilityLabel="Nach rechts verschieben" onPress={() => layout({ x: draft.x + 1 })} disabled={disabled} secondary />
        <Action label="↑ Oben" accessibilityLabel="Nach oben verschieben" onPress={() => layout({ y: draft.y - 1 })} disabled={disabled} secondary />
        <Action label="↓ Unten" accessibilityLabel="Nach unten verschieben" onPress={() => layout({ y: draft.y + 1 })} disabled={disabled} secondary />
      </View>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>{sizes.map(size => <Action key={size.label} label={size.label} selected={draft.width === size.width && draft.height === size.height} secondary={draft.width !== size.width || draft.height !== size.height} disabled={disabled}
        onPress={() => layout({ width: size.width, height: size.height })} />)}</View>
    </View> : <Text style={styles.body}>Dein neuer Button erhält einen freien Platz. Position und Größe kannst du danach ändern.</Text>}
    <EditorError message={error} />
    <View style={{ gap: 8 }}><Text style={styles.eyebrow}>Vorschau</Text><View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 8, backgroundColor: colors.canvas }}>
      <View style={{ width: draft.width === 2 ? '100%' : '48%', alignSelf: draft.x === 1 ? 'flex-end' : 'flex-start', minHeight: draft.height * 62, padding: 12, borderRadius: 8, backgroundColor: '#dfeadd', justifyContent: 'center', gap: 6 }}>
        <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 16 }}>{draft.label.trim() || 'Dein Soundbutton'}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{sound?.name ?? 'Kein Sound'}</Text>
      </View>
    </View></View>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Den Ausschnitt deines Sounds kannst du in der Bibliothek bearbeiten.</Text>
    <Action label={saving ? 'Wird gespeichert …' : button ? 'Button speichern' : 'Button erstellen'} disabled={!valid || disabled} onPress={() => { void save(); }} />
    <Action label="Abbrechen" onPress={onClose} disabled={saving} secondary />
    {button && <Action label="Button entfernen" onPress={() => { void remove(); }} disabled={disabled} secondary />}
  </EditorDialog>;
}
