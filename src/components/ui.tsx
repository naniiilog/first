import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { Look } from '../lib/avatar';
import { useTheme } from '../lib/theme';

/** 카톡처럼 둥근 네모 프로필. 사진이 있으면 사진, 없으면 색 배경에 이모지. */
export function Avatar({ bot, size = 40, dim }: { bot: Look; size?: number; dim?: boolean }) {
  const radius = size * 0.38;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bot.image ? '#EEF1F7' : bot.color + '40',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(20,26,51,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: dim ? 0.35 : 1,
      }}
    >
      {bot.image ? (
        <Image source={typeof bot.image === 'string' ? { uri: bot.image } : bot.image} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ fontSize: size * 0.52 }}>{bot.emoji}</Text>
      )}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'danger' ? t.danger : t.card;
  const fg = variant === 'secondary' ? t.text : variant === 'primary' ? t.accentText : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: t.border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.subtext }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.subtext}
        {...props}
        style={[
          styles.input,
          { backgroundColor: t.input, color: t.text, borderColor: t.border },
          props.multiline && { minHeight: 90, textAlignVertical: 'top' },
          props.style,
        ]}
      />
      {hint ? <Text style={{ color: t.subtext, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {title ? <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? c : t.border, backgroundColor: selected ? c + '22' : t.card },
      ]}
    >
      <Text style={{ color: selected ? c : t.text, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
});
