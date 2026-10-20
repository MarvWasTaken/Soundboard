import { useEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { LocalRepository } from './src/platform/storage';
import { LocalAudio } from './src/platform/audio';
import { pickFile } from './src/platform/picker';
import { Library } from './src/services/library';
import { Playback } from './src/services/playback';
import { BoardSession } from './src/services/board-session';
import type { BoardMode } from './src/services/board-session';
import { watchInterruption } from './src/platform/interruption';
import type { AudioRange, Board, Sound } from './src/domain/model';
import type { ButtonDraft } from './src/domain/board';
import { errorMessage } from './src/domain/errors';
import { LibraryPanel } from './src/ui/LibraryPanel';
import { Action } from './src/ui/Action';
import { colors, styles } from './src/ui/theme';
import { SoundEditor } from './src/ui/SoundEditor';
import { BoardScreen } from './src/ui/BoardScreen';
import { BoardEditor, DeleteBoardDialog } from './src/ui/BoardEditor';
import { ButtonEditor } from './src/ui/ButtonEditor';

const repository = new LocalRepository();
const audio = new LocalAudio();
const library = new Library(repository, audio, randomUUID);
const playback = new Playback(repository, audio);
const boardSession = new BoardSession(() => library.snapshot.state, playback);
export default function App() {
  const [snapshot, setSnapshot] = useState(library.snapshot);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playbackState, setPlaybackState] = useState(playback.state);
  const [editingSound, setEditingSound] = useState<Sound | undefined>();
  const [boardState, setBoardState] = useState(boardSession.state);
  const [editingBoard, setEditingBoard] = useState<{ board?: Board } | undefined>();
  const [deletingBoard, setDeletingBoard] = useState<Board | undefined>();
  const [editingButton, setEditingButton] = useState<{ boardId: string; buttonId?: string } | undefined>();
  const viewportWidth = useWindowDimensions().width;
  const wide = viewportWidth >= 1000;
  const buttonBoard = snapshot.state.boards.find(board => board.id === editingButton?.boardId);
  const modalOpen = !!(editingSound || editingBoard || editingButton || deletingBoard);
  function refresh() {
    setSnapshot(library.snapshot); boardSession.reconcile(); setBoardState({ ...boardSession.state });
  }
  async function load() {
    playback.stop();
    setEditingSound(undefined); setEditingBoard(undefined); setEditingButton(undefined); setDeletingBoard(undefined);
    setLoading(true); setError('');
    const loadingOperation = library.load(); refresh();
    try { await loadingOperation; }
    catch (failure) { setError(errorMessage(failure)); }
    finally { refresh(); setLoading(false); }
  }
  async function mutation<T>(operation: () => Promise<T>): Promise<T> {
    setError('');
    try { return await operation(); }
    catch (failure) { setError(errorMessage(failure)); throw failure; }
    finally { refresh(); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const unsubscribe = playback.subscribe(setPlaybackState);
    const stopWatching = watchInterruption(() => playback.stop());
    return () => { stopWatching(); unsubscribe(); playback.stop(); };
  }, []);
  async function saveTrim(range: AudioRange) {
    if (!editingSound) return;
    await mutation(() => library.setTrim(editingSound.id, range));
  }
  async function importSound() {
    setError(''); setBusy(true);
    try { await mutation(() => library.importSound({ pick: pickFile })); }
    catch { /* Shared mutation handler publishes the service error and lock. */ }
    finally { setBusy(false); }
  }
  function selectBoard(id: string) { boardSession.selectBoard(id); setBoardState({ ...boardSession.state }); }
  function mode(mode: BoardMode) { boardSession.setMode(mode); setBoardState({ ...boardSession.state }); }
  function activate(id: string) {
    try {
      const button = boardSession.activate(id);
      if (button && boardState.boardId) { playback.stop(); setEditingButton({ boardId: boardState.boardId, buttonId: button.id }); }
    } catch (failure) { setError(errorMessage(failure)); }
  }
  async function saveBoard(name: string) {
    if (editingBoard?.board) { const boardId = editingBoard.board.id; await mutation(() => library.renameBoard(boardId, name)); }
    else { const id = await mutation(() => library.createBoard(name)); boardSession.selectBoard(id); boardSession.setMode('edit'); }
    refresh();
  }
  async function saveButton(draft: ButtonDraft) {
    if (!editingButton) return;
    const { boardId, buttonId } = editingButton;
    if (buttonId) await mutation(() => library.updateButton(boardId, buttonId, draft));
    else await mutation(() => library.createButton(boardId, draft.label, draft.soundId));
    refresh();
  }
  return <SafeAreaProvider><SafeAreaView style={styles.page}><ScrollView contentContainerStyle={[styles.content, { padding: viewportWidth < 500 ? 16 : 24 }]}>
    <View style={styles.header}><Text style={styles.wordmark}>soundboard<Text style={{ color: colors.accent }}> /</Text></Text><Text style={styles.eyebrow}>{viewportWidth < 540 ? 'Lokal. Dein Sound.' : 'Dein Moment. Dein Sound.'}</Text></View>
    {!snapshot.state.boards.length && <View style={{ gap: 10, paddingTop: 28, paddingBottom: 12 }}><Text style={styles.eyebrow}>Ein Platz für deine Sounds</Text><Text style={styles.title}>Mach es hörbar.</Text><Text style={styles.body}>Alles, was deinen Moment besonders macht. Direkt griffbereit.</Text></View>}
    {!!error && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{error}</Text></View>}
    {playbackState.status === 'error' && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{playbackState.message}</Text></View>}
    {snapshot.warnings.map((warning, index) => <View key={index} accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{warning}</Text></View>)}
    {!modalOpen && !loading && (!!error || snapshot.readOnly) && <Action label="Erneut laden" onPress={() => { void load(); }} secondary />}
    <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.body, { flex: 1 }]}>{playbackState.status === 'playing' ? `Wiedergabe läuft: ${snapshot.state.sounds.find(sound => sound.id === playbackState.soundId)?.name ?? 'Sound'}` : playbackState.status === 'loading' ? 'Audio wird vorbereitet …' : playbackState.message ?? 'Bereit für deinen Sound.'}</Text>
      <Action label="Wiedergabe stoppen" onPress={() => playback.stop()} disabled={playbackState.status !== 'loading' && playbackState.status !== 'playing'} secondary />
    </View>
    {loading ? <Text accessibilityRole="status" style={styles.body}>Lokale Sounds werden geladen …</Text> : <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: 24 }}>
      <BoardScreen snapshot={snapshot} boardId={boardState.boardId} mode={boardState.mode} onSelect={selectBoard} onMode={mode} onActivate={activate}
        onNewBoard={() => { playback.stop(); setEditingBoard({}); }} onRename={board => setEditingBoard({ board })} onDeleteBoard={setDeletingBoard}
        onNewButton={() => { if (boardState.boardId) { playback.stop(); setEditingButton({ boardId: boardState.boardId }); } }} />
      <View style={{ width: wide ? 320 : '100%' }}><LibraryPanel snapshot={snapshot} busy={busy} onImport={() => { void importSound(); }} onPlay={sound => { void playback.play(sound); }} onEdit={sound => { playback.stop(); setEditingSound(sound); }} /></View>
    </View>}
  </ScrollView>{editingSound && <SoundEditor key={editingSound.id} sound={editingSound} unavailable={snapshot.unavailable.includes(editingSound.id)} readOnly={snapshot.readOnly || loading} onReload={() => { void load(); }} playbackState={playbackState}
    onPreview={range => { void playback.play(editingSound, range); }} onStop={() => playback.stop()} onSave={saveTrim} onClose={() => { playback.stop(); setEditingSound(undefined); }} />}
    {editingBoard && <BoardEditor key={editingBoard.board?.id ?? 'new'} name={editingBoard.board?.name} readOnly={snapshot.readOnly || loading} onReload={() => { void load(); }} onSave={saveBoard} onClose={() => setEditingBoard(undefined)} />}
    {deletingBoard && <DeleteBoardDialog name={deletingBoard.name} readOnly={snapshot.readOnly || loading} onReload={() => { void load(); }} onClose={() => setDeletingBoard(undefined)} onDelete={async () => { const boardId = deletingBoard.id; playback.stop(); await mutation(() => library.deleteBoard(boardId)); }} />}
    {editingButton && buttonBoard && <ButtonEditor key={`${editingButton.boardId}:${editingButton.buttonId ?? 'new'}`} board={buttonBoard} button={buttonBoard.buttons.find(button => button.id === editingButton.buttonId)} sounds={snapshot.state.sounds} unavailable={snapshot.unavailable} readOnly={snapshot.readOnly || loading} onReload={() => { void load(); }}
      onSave={saveButton} onClose={() => setEditingButton(undefined)} onDelete={async () => { const { boardId, buttonId } = editingButton; if (buttonId) await mutation(() => library.deleteButton(boardId, buttonId)); }} />}
  </SafeAreaView></SafeAreaProvider>;
}
