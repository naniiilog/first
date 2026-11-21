import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { aiOf } from '../lib/ais';
import { AVATAR_COLORS, AVATAR_EMOJIS, emojiAvatar, lookOf } from '../lib/avatar';
import { useTheme } from '../lib/theme';
import { Avatar, Button } from './ui';

/** 사진을 작은 정사각형 JPEG(data URL)로 줄여요. 서버에 저장할 수 있는 크기로. */
async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('사진 접근 권한이 필요해요. 설정에서 허용해 주세요.');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const side = Math.min(asset.width || 160, asset.height || 160);
  const ctx = ImageManipulator.manipulate(asset.uri);
  // 편집 화면이 없는 환경(웹)에서도 가운데를 정사각형으로 잘라요.
  if (asset.width && asset.height && asset.width !== asset.height) {
    ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: 160, height: 160 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  if (!saved.base64) throw new Error('사진을 처리하지 못했어요.');
  return `data:image/jpeg;base64,${saved.base64}`;
}

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
      const url = await pickPhoto();
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
