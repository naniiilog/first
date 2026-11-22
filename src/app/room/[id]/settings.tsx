import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { NotifySettings } from '../../../components/NotifySettings';
import { Chip, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';

/** 봇이 방을 확인하는 간격(분). 0은 실시간. */
const INTERVALS = [0, 1, 5, 10, 15, 20, 30, 40, 60, 120];
const intervalLabel = (n: number) => (n === 0 ? '실시간' : n >= 60 ? `${n / 60}시간` : `${n}분`);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 이 휴대폰의 시간대(예: Asia/Seoul). 모르면 한국 시간. */
function deviceTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes('/') ? tz : 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

/** 0~23시 중 하나를 고르는 가로 목록 */
function HourPicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {HOURS.map((h) => (
        <Pressable
          key={h}
          onPress={() => onChange(h)}
          style={[styles.hour, { backgroundColor: h === value ? t.accent : t.input, borderColor: h === value ? t.accent : t.border }]}
        >
          <Text style={{ color: h === value ? t.accentText : t.text, fontWeight: '700', fontSize: 13 }}>{pad2(h)}시</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function RoomSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useStore();
  const { room, roomInfo, refreshMembers } = useLiveRoom(id, { messages: false });
  const t = useTheme();
  /** 저장 중에는 누른 값을 먼저 보여줘요(버튼 반응을 바로 보이게). */
  const [draft, setDraft] = useState<{ checkIntervalMin?: number; quietEnabled?: boolean; quietStart?: number; quietEnd?: number }>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!room) return <Text style={{ padding: 20, color: t.subtext }}>방을 찾을 수 없어요.</Text>;
  if (!roomInfo) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;

  const interval = draft.checkIntervalMin ?? roomInfo.checkIntervalMin ?? 30;
  const quietEnabled = draft.quietEnabled ?? roomInfo.quietEnabled ?? true;
  const quietStart = draft.quietStart ?? roomInfo.quietStart ?? 0;
  const quietEnd = draft.quietEnd ?? roomInfo.quietEnd ?? 9;

  const save = async (patch: typeof draft) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaving(true);
    setMsg(null);
    try {
      await api.setSchedule(settings, room, { ...patch, tz: deviceTz() });
      await refreshMembers();
      setMsg('저장했어요. 봇들에게도 바로 알려줘요.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 26 }}>
      <Section title="봇 확인 간격">
        <Text style={{ color: t.subtext, fontSize: 13, lineHeight: 19 }}>
          봇이 방을 몇 분마다 확인할지 정해요. 간격이 길수록 봇 토큰을 아껴요. 내가 새 글을 쓰면 간격과 상관없이 바로 확인할 수 있어요.
        </Text>
        <View style={styles.row}>
          {INTERVALS.map((n) => (
            <Chip key={n} label={intervalLabel(n)} selected={interval === n} onPress={() => save({ checkIntervalMin: n })} />
          ))}
        </View>
      </Section>

      <Section title="매너타임">
        <View style={[styles.switchRow, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>
              🌙 매너타임 {quietEnabled ? `${pad2(quietStart)}:00~${pad2(quietEnd)}:00` : '꺼짐'}
            </Text>
            <Text style={{ color: t.subtext, fontSize: 12, marginTop: 2 }}>
              이 시간에는 봇이 확인도 대화도 안 해요. 내가 이름을 부르면 그 봇만 답해요.
            </Text>
          </View>
          <Switch
            value={quietEnabled}
            onValueChange={(v) => {
              save({ quietEnabled: v });
            }}
          />
        </View>
        {quietEnabled && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: t.text, fontWeight: '600' }}>시작</Text>
            <HourPicker value={quietStart} onChange={(h) => save({ quietStart: h })} />
            <Text style={{ color: t.text, fontWeight: '600' }}>끝</Text>
            <HourPicker value={quietEnd} onChange={(h) => save({ quietEnd: h })} />
            <Text style={{ color: t.subtext, fontSize: 12 }}>시간대: {deviceTz()}</Text>
          </View>
        )}
      </Section>

      <NotifySettings settings={settings} room={room} info={roomInfo} refresh={refreshMembers} />

      <View style={{ minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {saving ? <ActivityIndicator size="small" color={t.accent} /> : null}
        {msg ? <Text style={{ color: t.subtext, fontSize: 13 }}>{msg}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hour: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
