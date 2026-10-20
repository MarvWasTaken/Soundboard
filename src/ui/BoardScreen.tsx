import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Board, LoadResult } from '../domain/model';
import type { BoardMode } from '../services/board-session';
import { Action } from './Action';
import { colors, styles } from './theme';
export const CELL_HEIGHT = 124;
const GAP = 12;
export function BoardScreen({ snapshot, boardId, mode, onSelect, onMode, onNewBoard, onRename, onDeleteBoard, onNewButton, onActivate }: {
  snapshot: LoadResult; boardId?: string; mode: BoardMode;
  onSelect: (id: string) => void; onMode: (mode: BoardMode) => void; onNewBoard: () => void; onRename: (board: Board) => void; onDeleteBoard: (board: Board) => void;
  onNewButton: () => void; onActivate: (id: string) => void;
}) {
  const [width, setWidth] = useState(0); const [focused, setFocused] = useState('');
  const board = snapshot.state.boards.find(entry => entry.id === boardId);
  const cellWidth = Math.max(0, (width - GAP) / 2);
  const rows = board?.buttons.reduce((maximum, button) => Math.max(maximum, button.y + button.height), 0) ?? 0;
  return <View style={{ flex: 1, gap: 20, minWidth: 0 }}>
    <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}><Text style={styles.eyebrow}>Deine Boards</Text><Action label="+ Neues Board" onPress={onNewBoard} disabled={snapshot.readOnly} secondary /></View>
    {!!snapshot.state.boards.length && <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {snapshot.state.boards.map((entry, index) => <Action key={entry.id} label={entry.name} accessibilityLabel={`Board ${entry.name}, ${index + 1}`} selected={entry.id === boardId} secondary={entry.id !== boardId} onPress={() => onSelect(entry.id)} />)}
    </View>}
    {!board ? <View style={[styles.panel, { minHeight: 330, justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={styles.eyebrow}>Deine Bühne</Text><Text style={styles.heading}>Platz für deinen ersten Moment.</Text>
      <Text style={[styles.body, { textAlign: 'center' }]}>Erstelle ein Board und belege es mit deinen Sounds.</Text>
      <Action label="Erstes Board erstellen" onPress={onNewBoard} disabled={snapshot.readOnly} />
    </View> : <View style={[styles.panel, { padding: 18, gap: 18 }]}>
      <View style={{ gap: 8 }}><Text accessibilityRole="header" style={styles.heading}>{board.name}</Text><Text style={styles.body}>{board.buttons.length} {board.buttons.length === 1 ? 'Button' : 'Buttons'} · {mode === 'play' ? 'Abspielmodus' : 'Bearbeitungsmodus'}</Text></View>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Action label="Abspielen" selected={mode === 'play'} secondary={mode !== 'play'} onPress={() => onMode('play')} />
        <Action label="Bearbeiten" selected={mode === 'edit'} secondary={mode !== 'edit'} onPress={() => onMode('edit')} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{mode === 'play' ? 'Tippe auf einen Button, um seinen Sound abzuspielen.' : 'Tippe auf einen Button, um Sound, Position oder Größe zu ändern.'}</Text>
      {!board.buttons.length && <View style={{ paddingVertical: 32, gap: 12 }}><Text style={styles.heading}>Noch ganz still hier.</Text><Text style={styles.body}>{snapshot.state.sounds.length ? 'Füge im Bearbeitungsmodus deinen ersten Soundbutton hinzu.' : 'Importiere zuerst einen Sound in deiner Bibliothek.'}</Text></View>}
      <View testID="board-grid" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: rows ? rows * (CELL_HEIGHT + GAP) - GAP : 0, width: '100%' }}>
        {width > 0 && board.buttons.map((button, index) => {
          const sound = snapshot.state.sounds.find(entry => entry.id === button.soundId);
          const available = !!sound && !snapshot.unavailable.includes(button.soundId);
          return <Pressable key={button.id} testID={`board-button-${button.id}`} accessibilityRole="button" accessibilityLabel={`${button.label} ${mode === 'play' ? 'abspielen' : 'bearbeiten'}`}
            disabled={mode === 'play' && !available} accessibilityState={{ disabled: mode === 'play' && !available }} onPress={() => onActivate(button.id)}
            onFocus={() => setFocused(button.id)} onBlur={() => setFocused('')}
            style={({ pressed }) => ({ position: 'absolute', left: button.x * (cellWidth + GAP), top: button.y * (CELL_HEIGHT + GAP), width: cellWidth * button.width + GAP * (button.width - 1), height: CELL_HEIGHT * button.height + GAP * (button.height - 1), padding: 14,
              backgroundColor: available ? (index % 3 === 0 ? '#dfeadd' : index % 3 === 1 ? '#eee8dc' : '#e4e9ea') : '#efefeb', borderRadius: 14, justifyContent: 'space-between', opacity: pressed ? 0.75 : available ? 1 : 0.7, borderWidth: 2, borderColor: focused === button.id ? colors.ink : 'transparent' })}>
            <Text style={[styles.eyebrow, { fontSize: 10, letterSpacing: 1 }]}>{String(index + 1).padStart(2, '0')} {mode === 'edit' ? '· Ändern' : '· ▶'}</Text>
            <Text numberOfLines={2} style={{ color: colors.ink, fontWeight: '600', fontSize: 19, lineHeight: 23, letterSpacing: -0.4 }}>{button.label}</Text>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{available ? sound.name : 'Sound nicht verfügbar'}</Text>
          </Pressable>;
        })}
      </View>
      {mode === 'edit' && <View style={{ gap: 12 }}>
        <Action label="+ Button hinzufügen" onPress={onNewButton} disabled={snapshot.readOnly || !snapshot.state.sounds.some(sound => !snapshot.unavailable.includes(sound.id))} />
        <View style={[styles.row, { flexWrap: 'wrap' }]}><Action label="Board umbenennen" onPress={() => onRename(board)} disabled={snapshot.readOnly} secondary /><Action label="Board löschen" onPress={() => onDeleteBoard(board)} disabled={snapshot.readOnly} secondary /></View>
      </View>}
    </View>}
  </View>;
}
