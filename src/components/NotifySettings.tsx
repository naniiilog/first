import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { api, type NotifyMode, type RoomInfo } from '../lib/api';
import { disablePush, enablePush, needsHomeScreen, pushStatus, pushSupported } from '../lib/push';
import { SOUNDS } from '../lib/sounds';
import { useTheme } from '../lib/theme';
import type { LocalRoom, Settings } from '../lib/types';
import { Chip, Section } from './ui';

const MODES: { key: Exclude<NotifyMode, 'off'>; label: string; hint: string }[] = [
  { key: 'mentions', label: '나한테 하는 말만', hint: '봇이 내 글에 답장하거나 내 이름을 부를 때' },
  { key: 'batch', label: '모든 글 (묶어서)', hint: '3분에 한 번만, "OO 외 N개"로 묶어서' },
  { key: 'each', label: '모든 글 (하나하나)', hint: '카톡처럼 글마다 (자동대화 중엔 많이 와요)' },
];

/** 방 설정 화면의 '휴대폰 알림' 칸 */
export function NotifySettings({ settings, room, info, refresh }: { settings: Settings; room: LocalRoom; info: RoomInfo['room']; refresh: () => Promise<void> }) {
  const t = useTheme();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ mode?: NotifyMode; silent?: boolean; sound?: string }>({});
  const supported = pushSupported();
  const mode = draft.mode ?? info.notifyMode ?? 'off';
  const silent = draft.silent ?? info.notifySilent ?? false;
  const sound = draft.sound ?? info.notifySound ?? 'default';

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    pushStatus(settings, room)
      .then((v) => alive && setOn(v))
      .catch(() => alive && setOn(false));
    return () => {
      alive = false;
    };
  }, [supported, settings, room]);

  const save = async (patch: { notifyMode?: NotifyMode; notifySilent?: boolean; notifyName?: string; notifySound?: string }) => {
    setDraft((d) => ({
      ...d,
      ...(patch.notifyMode ? { mode: patch.notifyMode } : {}),
      ...(patch.notifySilent !== undefined ? { silent: patch.notifySilent } : {}),
      ...(patch.notifySound ? { sound: patch.notifySound } : {}),
    }));
    await api.setNotify(settings, room, patch);
    await refresh();
  };

  const toggle = async (next: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      if (next) {
        await enablePush(settings, room);
        // 처음 켜면 '나한테 하는 말만'으로 시작해요. 내 이름도 같이 알려줘요(이름이 불렸는지 알아보려고).
        await save({ notifyMode: mode === 'off' ? 'mentions' : mode, notifyName: settings.userName });
        setOn(true);
        setMsg('알림을 켰어요.');
      } else {
        await disablePush(settings, room);
        await save({ notifyMode: 'off' });
        setOn(false);
        setMsg('알림을 껐어요.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setMsg(null);
    try {
      const { sent, failed } = await api.pushTest(settings, room);
      setMsg(
        sent
          ? '시험 알림을 보냈어요. 몇 초 안에 와요.'
          : failed
            ? '알림을 보내지 못했어요. 잠시 뒤 다시 해 보고, 계속 안 되면 스위치를 껐다 켜 주세요.'
            : '알림을 받을 기기가 없어요. 위 스위치를 먼저 켜 주세요.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Section title="휴대폰 알림">
      {!supported ? (
        <Text style={{ color: t.subtext, fontSize: 13, lineHeight: 19 }}>
          {needsHomeScreen()
            ? '아이폰은 다봇을 홈 화면에 추가해서 열어야 알림을 받을 수 있어요. (공유 → 홈 화면에 추가)'
            : '이 화면에서는 알림을 쓸 수 없어요. 휴대폰 크롬에서 다봇을 열어 주세요.'}
        </Text>
      ) : (
        <>
          <View style={[styles.switchRow, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>🔔 이 폰으로 알림 받기</Text>
              <Text style={{ color: t.subtext, fontSize: 12, marginTop: 2 }}>다봇을 닫아 둬도 봇이 말하면 알려줘요.</Text>
            </View>
            {on === null || busy ? (
              <ActivityIndicator color={t.accent} />
            ) : (
              <Switch
                value={on}
                onValueChange={(v) => {
                  toggle(v);
                }}
              />
            )}
          </View>

          {on && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>어떤 글에 알릴까요?</Text>
              {MODES.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => save({ notifyMode: m.key }).catch((e) => setMsg(String(e)))}
                  style={[styles.option, { borderColor: mode === m.key ? t.accent : t.border, backgroundColor: mode === m.key ? t.accentSoft : t.card }]}
                >
                  <View style={[styles.radio, { borderColor: mode === m.key ? t.accent : t.subtext }]}>
                    {mode === m.key ? <View style={[styles.radioDot, { backgroundColor: t.accent }]} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>{m.label}</Text>
                    <Text style={{ color: t.subtext, fontSize: 12 }}>{m.hint}</Text>
                  </View>
                </Pressable>
              ))}

              <Text style={{ color: t.text, fontWeight: '600' }}>알림 방식</Text>
              {Platform.OS === 'web' ? (
                <>
                  <View style={styles.row}>
                    <Chip label="🔊 소리·진동" selected={!silent} onPress={() => save({ notifySilent: false }).catch((e) => setMsg(String(e)))} />
                    <Chip label="🔕 무음" selected={silent} onPress={() => save({ notifySilent: true }).catch((e) => setMsg(String(e)))} />
                  </View>
                  <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
                    진동만 받거나 소리를 바꾸려면: 휴대폰 설정 → 알림 → Chrome(또는 다봇) → 사이트 알림에서 바꿔 주세요. 설치형 앱에서는 다봇 전용 알림음도 고를 수 있어요.
                  </Text>
                </>
              ) : (
                <>
                  {/* 설치형 앱: 다봇 전용 알림음 · 폰 기본음 · 진동만 · 무음, 칸을 누르면 바로 들려줘요 */}
                  <View style={styles.row}>
                    {SOUNDS.map((x) => {
                      const on = (silent ? 'silent' : sound) === x.key;
                      return (
                        // 칸을 누르면 고르면서 그 소리를 바로 들려줘요.
                        <Pressable
                          key={x.key}
                          accessibilityLabel={`알림음 ${x.label}`}
                          onPress={() => {
                            if (x.file) import('../lib/nativePush').then((m) => m.previewSound(x.file!)).catch(() => {});
                            if (!on) save({ notifySound: x.key, notifySilent: x.key === 'silent' }).catch((e) => setMsg(String(e)));
                          }}
                          style={({ pressed }) => [
                            styles.sound,
                            { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accentSoft : pressed ? t.input : t.card },
                          ]}
                        >
                          <Text style={{ fontSize: 14 }}>{x.key === 'vibrate' ? '📳' : x.key === 'silent' ? '🔕' : x.file ? '🎵' : '🔔'}</Text>
                          {/* 폰 글꼴에 따라 글자 폭을 잘못 재서 이름이 잘리는 일이 있어서, 이름 칸 폭을 넉넉히 잡아요. */}
                          <Text
                            numberOfLines={1}
                            style={{ color: on ? t.accent : t.text, fontWeight: '700', fontSize: 13, minWidth: x.label.length * 15 + 6 }}
                          >
                            {x.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable onPress={() => Linking.openSettings().catch(() => {})} style={[styles.testBtn, { borderColor: t.border }]}>
                    <Text style={{ color: t.text, fontWeight: '700' }}>⚙️ 폰 알림 설정 열기 (잠금화면·팝업·내 음악)</Text>
                  </Pressable>
                </>
              )}

              <Pressable onPress={test} style={[styles.testBtn, { borderColor: t.accent }]}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>시험 알림 보내기</Text>
              </Pressable>
              <Text style={{ color: t.subtext, fontSize: 12, lineHeight: 18 }}>
                매너타임에는 알림이 안 와요. 이 채팅방을 보고 있을 때도 알림을 보내지 않아요.
              </Text>
            </View>
          )}
          {msg ? <Text style={{ color: t.subtext, fontSize: 13 }}>{msg}</Text> : null}
        </>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  testBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
});
