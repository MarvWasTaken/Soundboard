import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { colors, styles } from './theme';
import { Action } from './Action';
export function EditorDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 16, backgroundColor: 'rgba(25,35,29,0.34)' }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }}>
        <View accessibilityViewIsModal style={[styles.panel, { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 20 }]}>
          <Text accessibilityRole="header" style={styles.heading}>{title}</Text>{children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
export function Field({ label, value, onChange, disabled, autoFocus }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  return <View style={{ gap: 8 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} autoFocus={autoFocus} selectTextOnFocus
      style={{ minHeight: 50, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.canvas, color: colors.ink, fontSize: 17 }} />
  </View>;
}
export function EditorError({ message }: { message: string }) {
  return message ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View> : null;
}
export function ReloadNotice({ readOnly, onReload }: { readOnly: boolean; onReload: () => void }) {
  return readOnly ? <View style={styles.notice}><Text style={styles.noticeText}>Dieser Stand ist schreibgeschützt. Beim erneuten Laden wird dein ungespeicherter Entwurf verworfen.</Text><Action label="Erneut laden" onPress={onReload} secondary /></View> : null;
}
