import { useEffect, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { colors, styles } from './theme';
export function Action({ label, onPress, disabled, secondary = false, accessibilityLabel, selected }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; accessibilityLabel?: string; selected?: boolean }) {
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (disabled) setFocused(false); }, [disabled]);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected, disabled }} aria-pressed={Platform.OS === 'web' ? selected : undefined} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, { borderWidth: 2, borderColor: focused ? colors.ink : 'transparent' }, secondary && styles.secondary, disabled && styles.disabled, pressed && { opacity: 0.75 }]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}
