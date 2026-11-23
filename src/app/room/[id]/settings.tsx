import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { NotifySettings } from '../../../components/NotifySettings';
import { Avatar, Chip, Section } from '../../../components/ui';
import { lookOf } from '../../../lib/avatar';
import { api } from '../../../lib/api';
import { useLiveRoom, useStore } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';

/** 봇이 방을 확인하는 간격(분). 0은 실시간. */
const INTERVALS = [0, 1, 5, 10, 15, 20, 30, 40, 60, 120];
const intervalLabel = (n: number) => (n === 0 ? '실시간' : n >= 60 ? `${n / 60}시간` : `${n}분`);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** 확인 간격 동안 봇이 어떻게 지낼지 */
const WAIT_MODES: { key: 'stay' | 'away'; label: string; hint: string }[] = [
  { key: 'stay', label: '계속 기다리기 (안 끊겨요)', hint: '방에 남아 90초마다 들러요. 설정이 바로 먹히고 잘 안 끊기지만, 들를 때마다 토큰을 써요.' },
  { key: 'away', label: '쉬었다 오기 (토큰 아껴요)', hint: '간격 동안 아예 안 들러요. 토큰을 거의 안 쓰지만, 채팅 앱 봇은 끊길 수 있어서 다시 불러야 할 수 있어요.' },
];
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
  const { room, roomInfo, refreshMembers, members } = useLiveRoom(id, { messages: false });
  const t = useTheme();
  /** 저장 중에는 누른 값을 먼저 보여줘요(버튼 반응을 바로 보이게). */
  const [draft, setDraft] = useState<{ checkIntervalMin?: number; quietEnabled?: boolean; quietStart?: number; quietEnd?: number; waitMode?: 'stay' | 'away' }>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!room) return <Text style={{ padding: 20, color: t.subtext }}>방을 찾을 수 없어요.</Text>;
  if (!roomInfo) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;

  const interval = draft.checkIntervalMin ?? roomInfo.checkIntervalMin ?? 30;
  const waitMode = draft.waitMode ?? roomInfo.waitMode ?? 'stay';
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
          방 전체 봇의 기본 간격이에요. 새 글을 몇 분마다 모아서 전할지 정해요. 내가 새 글을 쓰면 간격과 상관없이 바로 전해요. 봇마다 따로 정하려면 채팅방 위쪽에서 그 봇을 누르세요.
        </Text>
        <View style={styles.row}>
          {INTERVALS.map((n) => (
            <Chip key={n} label={intervalLabel(n)} selected={interval === n} onPress={() => save({ checkIntervalMin: n })} />
          ))}
        </View>
        {interval > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: t.text, fontWeight: '600' }}>간격 동안 봇은</Text>
            {WAIT_MODES.map((w) => (
              <Pressable
                key={w.key}
                onPress={() => save({ waitMode: w.key })}
                style={[styles.option, { borderColor: waitMode === w.key ? t.accent : t.border, backgroundColor: waitMode === w.key ? t.accentSoft : t.card }]}
              >
                <View style={[styles.radio, { borderColor: waitMode === w.key ? t.accent : t.subtext }]}>
                  {waitMode === w.key ? <View style={[styles.radioDot, { backgroundColor: t.accent }]} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>{w.label}</Text>
                  <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 17 }}>{w.hint}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </Section>

      {/* 지금 어떤 봇이 몇 분 간격으로 도는지 간격별로 묶어서 보여줘요 */}
      <Section title="봇별 확인 간격">
        {members.length === 0 ? (
          <Text style={{ color: t.subtext, fontSize: 13 }}>아직 초대한 봇이 없어요.</Text>
        ) : (
          [...new Set(members.map((m) => m.checkIntervalMin ?? interval))]
            .sort((a, b) => a - b)
            .map((min) => {
              const group = members.filter((m) => (m.checkIntervalMin ?? interval) === min);
              return (
                <View key={min} style={[styles.group, { backgroundColor: t.card, borderColor: t.border }]}>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: 14 }}>
                    ⏱ {min === 0 ? '실시간' : `${intervalLabel(min)}마다`} <Text style={{ color: t.subtext, fontWeight: '500', fontSize: 12 }}>· {group.length}명</Text>
                  </Text>
                  <View style={styles.row}>
                    {group.map((m) => (
                      <View key={m.id} style={[styles.botChip, { backgroundColor: t.input, opacity: m.active ? 1 : 0.5 }]}>
                        <Avatar bot={lookOf(m.kind, m.avatar)} size={20} />
                        <Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>{m.name}</Text>
                        <Text style={{ color: m.checkIntervalMin != null ? t.accent : t.subtext, fontSize: 10, fontWeight: '700' }}>
                          {m.checkIntervalMin != null ? '개별' : '전체'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })
        )}
        <Text style={{ color: t.subtext, fontSize: 12 }}>봇마다 바꾸려면 채팅방 위쪽에서 그 봇을 누르세요. &apos;전체&apos;는 위의 방 간격을 따라요.</Text>
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
  group: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  botChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 3, paddingRight: 9, paddingVertical: 3, borderRadius: 999 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  hour: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
