import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { aiOf } from '../lib/ais';
import { AVATAR_COLORS, AVATAR_EMOJIS, emojiAvatar, hasAppIcon, ICON_BG_COLORS, iconAvatar, lookOf } from '../lib/avatar';
import { pickPhoto } from '../lib/photo';
import { useTheme } from '../lib/theme';
import { Avatar, Button } from './ui';

export function AvatarEditor({
  kind,
  avatar,
  onSave,
  onClose,
}: {
  kind: string;
  avatar: string | null;
  onSave: (avatar: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTheme();
  const start = lookOf(kind, avatar);
  const [draft, setDraft] = useState<string | null>(avatar);
  const [emoji, setEmoji] = useState(start.emoji);
  const [color, setColor] = useState(start.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const look = lookOf(kind, draft);

  const choose = (e: string, c: string) => {
    setEmoji(e);
    setColor(c);
    setDraft(emojiAvatar(e, c));
  };

  const photo = async () => {
    setError(null);
    try {
      const url = await pickPhoto({ square: 160 });
      if (url) setDraft(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.box, { backgroundColor: t.input, borderColor: t.border }]}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar bot={look} size={84} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={photo} style={[styles.pill, { backgroundColor: t.accent }]}>
            <Text style={{ color: t.accentText, fontWeight: '700' }}>📷 사진에서 고르기</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const ai = aiOf(kind);
              setEmoji(ai.emoji);
              setColor(ai.color);
              setDraft(null);
            }}
            style={[styles.pill, { backgroundColor: t.card, borderColor: t.border, borderWidth: 1 }]}
          >
            <Text style={{ color: t.text, fontWeight: '600' }}>기본으로</Text>
          </Pressable>
        </View>
      </View>

      {/* 같은 AI 봇이 여럿일 때: 앱 아이콘은 그대로 두고 배경색만 바꿔서 구분해요 */}
      {hasAppIcon(kind) && (
        <>
          <Text style={[styles.label, { color: t.subtext }]}>앱 아이콘 배경색 (같은 봇 여럿 구분용)</Text>
          <View style={styles.wrap}>
            {ICON_BG_COLORS.map((c) => {
              const on = c === '#FFFFFF' ? draft === null : draft === iconAvatar(c);
              return (
                <Pressable
                  key={c}
                  accessibilityLabel={c === '#FFFFFF' ? '기본(흰색)' : `배경색 ${c}`}
                  onPress={() => setDraft(c === '#FFFFFF' ? null : iconAvatar(c))}
                  style={[styles.swatch, { backgroundColor: c, borderColor: on ? t.text : c === '#FFFFFF' ? t.border : 'transparent' }]}
                />
              );
            })}
          </View>
        </>
      )}

      <Text style={[styles.label, { color: t.subtext }]}>이모지</Text>
      <View style={styles.wrap}>
        {AVATAR_EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => choose(e, color)}
            style={[styles.emoji, { backgroundColor: !look.image && look.emoji === e ? color + '55' : t.card }]}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, { color: t.subtext }]}>배경색</Text>
      <View style={styles.wrap}>
        {AVATAR_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => choose(emoji, c)}
            style={[styles.swatch, { backgroundColor: c, borderColor: !look.image && look.color === c ? t.text : 'transparent' }]}
          />
        ))}
      </View>

      {error ? <Text style={{ color: t.danger }}>⚠️ {error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="취소" variant="secondary" onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={busy ? '저장 중…' : '저장'} onPress={save} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 14, gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  label: { fontSize: 13, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emoji: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 11, borderWidth: 3 },
});
