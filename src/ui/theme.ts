import { StyleSheet } from 'react-native';
export const colors = { ink: '#222826', muted: '#6d756f', accent: '#275c48', line: '#dde2da', paper: '#ffffff', canvas: '#f5f5ef' };
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { width: '100%', maxWidth: 1320, alignSelf: 'center', padding: 24, gap: 28, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  wordmark: { fontSize: 21, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  eyebrow: { color: colors.muted, fontSize: 11, letterSpacing: 2, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 38, lineHeight: 44, fontWeight: '600', letterSpacing: -1.4, color: colors.ink },
  heading: { fontSize: 21, fontWeight: '600', color: colors.ink, letterSpacing: -0.5 },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted },
  panel: { padding: 24, gap: 20, backgroundColor: colors.paper, borderRadius: 20, borderWidth: 1, borderColor: colors.line },
  button: { minHeight: 46, minWidth: 44, maxWidth: '100%', flexShrink: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondary: { backgroundColor: '#eef1eb' }, secondaryText: { color: colors.ink },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { padding: 16, borderRadius: 12, backgroundColor: '#fff1e5', borderWidth: 1, borderColor: '#e6ceae', gap: 8 },
  noticeText: { color: '#784c22', fontSize: 14, lineHeight: 21 },
});
