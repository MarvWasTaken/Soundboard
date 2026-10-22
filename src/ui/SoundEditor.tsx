import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import type { AudioRange, Sound } from '../domain/model';
import { createTrimDraft, rangeFromDraft } from '../domain/trim';
import { errorMessage } from '../domain/errors';
import type { PlaybackState } from '../services/playback';
import { Action } from './Action';
import { colors, styles } from './theme';
import { ReloadNotice } from './EditorDialog';

export function SoundEditor({ sound, unavailable, readOnly, onReload, playbackState, onPreview, onStop, onSave, onClose }: {
  sound: Sound; unavailable: boolean; readOnly: boolean; playbackState: PlaybackState;
  onReload: () => void; onPreview: (range: AudioRange) => void; onStop: () => void; onSave: (range: AudioRange) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => createTrimDraft(sound));
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  let range: AudioRange | undefined; let validationError = '';
  try { range = rangeFromDraft(draft, sound.durationSeconds); } catch (failure) { validationError = errorMessage(failure); }
  const active = playbackState.soundId === sound.id && (playbackState.status === 'playing' || playbackState.status === 'loading');
  const position = playbackState.status === 'playing' && playbackState.soundId === sound.id && Number.isFinite(playbackState.positionSeconds)
    ? Math.max(0, Math.min(sound.durationSeconds, playbackState.positionSeconds!)) : undefined;
  const positionFraction = position === undefined ? 0 : position / sound.durationSeconds;
  const close = () => { if (!saving) { onStop(); onClose(); } };
  function change(field: 'startText' | 'endText', text: string) {
    onStop(); setError(''); setDraft(previous => ({ ...previous, [field]: text }));
  }
  async function save() {
    if (!range) return; setSaving(true); setError(''); onStop();
    try { await onSave(range); onClose(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setSaving(false); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 16, backgroundColor: 'rgba(25,35,29,0.34)' }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }}>
        <View accessibilityViewIsModal style={[styles.panel, { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 22 }]}>
          <View style={{ gap: 8 }}><Text style={styles.eyebrow}>Dein Sound. Dein Ausschnitt.</Text><Text accessibilityRole="header" style={styles.heading}>Ausschnitt bearbeiten</Text><Text style={styles.body}>{sound.name} · {sound.durationSeconds.toFixed(3)} s</Text></View>
          <Text style={styles.body}>Lege Start und Ende in Sekunden fest. Die Originaldatei bleibt erhalten; die Auswahl gilt für alle Buttons dieses Sounds.</Text>
          <ReloadNotice readOnly={readOnly} onReload={onReload} />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {(['startText', 'endText'] as const).map((field, index) => <View key={field} style={{ flex: 1, gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>{index ? 'Ende' : 'Start'} (Sekunden)</Text>
              <TextInput accessibilityLabel={index ? 'Ende in Sekunden' : 'Start in Sekunden'} keyboardType="decimal-pad" editable={!saving && !readOnly}
                value={draft[field]} onChangeText={text => change(field, text)} selectTextOnFocus
                style={{ minHeight: 50, fontSize: 20, padding: 12, borderWidth: 1, borderColor: validationError ? '#b26a34' : colors.line, borderRadius: 10, color: colors.ink, backgroundColor: colors.canvas }} />
            </View>)}
          </View>
          <View style={{ gap: 10 }}>
            <View testID="trim-timeline" style={{ height: 18, borderRadius: 9, backgroundColor: '#e6eae3', overflow: 'hidden' }}>
              {range && <View style={{ position: 'absolute', height: '100%', left: `${range.start / sound.durationSeconds * 100}%`, width: `${(range.end - range.start) / sound.durationSeconds * 100}%`, backgroundColor: colors.accent }} />}
              {position !== undefined && <View testID="playback-position-marker" style={{ position: 'absolute', height: '100%', width: 4, left: `${positionFraction * 100}%`, marginLeft: -4 * positionFraction, backgroundColor: '#fff', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.ink }} />}
            </View>
            {position !== undefined && <Text testID="playback-position-text" style={[styles.body, { fontWeight: '600', fontVariant: ['tabular-nums'] }]}>Wiedergabeposition: {position.toFixed(3)} s</Text>}
            <Text style={styles.body}>{range ? `Auswahl: ${range.start.toFixed(3)}–${range.end.toFixed(3)} s · ${(range.end - range.start).toFixed(3)} s Länge` : 'Auswahl ungültig'}</Text>
          </View>
          {!!(validationError || error) && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{error || validationError}</Text></View>}
          {playbackState.status === 'error' && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{playbackState.message}</Text></View>}
          <View style={{ gap: 12 }}>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              <Action label="▶ Vorschau starten" onPress={() => { if (range) onPreview(range); }} disabled={!range || saving || unavailable} />
              <Action label="Stopp" onPress={onStop} disabled={!active} secondary />
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.body}>{active ? (playbackState.status === 'loading' ? 'Audio wird vorbereitet …' : 'Vorschau läuft …') : playbackState.message ?? 'Bereit für deine Vorschau.'}</Text>
            <Action label="Auf volle Datei zurücksetzen" onPress={() => { onStop(); setError(''); setDraft(createTrimDraft({ ...sound, trimStartSeconds: 0, trimEndSeconds: sound.durationSeconds })); }} disabled={saving || readOnly} secondary />
          </View>
          <View style={{ gap: 10, borderTopWidth: 1, borderColor: colors.line, paddingTop: 22 }}>
            <Action label={saving ? 'Wird gespeichert …' : 'Ausschnitt speichern'} disabled={!range || saving || readOnly} onPress={() => { void save(); }} />
            <Action label="Abbrechen" onPress={close} disabled={saving} secondary />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
