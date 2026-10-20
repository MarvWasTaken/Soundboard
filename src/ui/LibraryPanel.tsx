import { Text, View } from 'react-native';
import type { LoadResult, Sound } from '../domain/model';
import { Action } from './Action';
import { colors, styles } from './theme';
export function LibraryPanel({ snapshot, busy, onImport, onPlay, onEdit }: { snapshot: LoadResult; busy: boolean; onImport: () => void; onPlay: (sound: Sound) => void; onEdit: (sound: Sound) => void }) {
  return <View style={styles.panel}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.heading}>Deine Sounds</Text><Text style={styles.eyebrow}>{snapshot.state.sounds.length} lokal</Text></View>
    <Text style={styles.body}>Deine persönliche Klangbibliothek. Importiere eine MP3- oder WAV-Datei, um loszulegen.</Text>
    <Action label={busy ? 'Sound wird importiert …' : '+ Sound importieren'} onPress={onImport} disabled={busy || snapshot.readOnly} />
    {!snapshot.state.sounds.length && <View style={{ paddingVertical: 28, gap: 10, alignItems: 'center' }}>
      <Text style={{ fontSize: 36, color: colors.accent }}>♫</Text><Text style={styles.heading}>Hier beginnt dein Sound.</Text>
      <Text style={[styles.body, { textAlign: 'center' }]}>Ein kurzer Jingle, ein Lieblingszitat oder dein nächster großer Auftritt.</Text>
    </View>}
    {snapshot.state.sounds.map((sound, index) => <View key={sound.id} style={{ paddingVertical: 14, borderTopWidth: 1, borderColor: colors.line, gap: 5 }}>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>{sound.name}</Text>
      <Text style={styles.body}>{sound.durationSeconds.toFixed(2)} s · Sound {index + 1}{snapshot.unavailable.includes(sound.id) ? ' · Datei nicht verfügbar' : ' · Lokal gespeichert'}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>Ausschnitt {sound.trimStartSeconds.toFixed(2)}–{sound.trimEndSeconds.toFixed(2)} s</Text>
      <View style={[styles.row, { flexWrap: 'wrap', marginTop: 8 }]}>
        <Action label="▶ Anhören" accessibilityLabel={`${sound.name} anhören, Sound ${index + 1}`} onPress={() => onPlay(sound)} disabled={snapshot.unavailable.includes(sound.id)} secondary />
        <Action label="Ausschnitt" accessibilityLabel={`${sound.name} Ausschnitt bearbeiten, Sound ${index + 1}`} onPress={() => onEdit(sound)} secondary />
      </View>
    </View>)}
    <Text style={{ fontSize: 12, lineHeight: 19, color: colors.muted }}>Nur auf diesem Gerät und in diesem Browser. Deine Audiodateien werden nicht hochgeladen. Das Löschen der App- oder Website-Daten entfernt auch deine Sounds.</Text>
  </View>;
}
