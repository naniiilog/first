import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';

export interface MenuItem {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  /** true면 한 번 더 눌러야 실행돼요(삭제처럼 되돌릴 수 없는 일) */
  confirm?: string;
  /** 하위 메뉴(들여 써서 작게, 예: 게시판들) */
  sub?: boolean;
}

/** 오른쪽 위에서 펼쳐지는 메뉴. 휴대폰 앱과 웹 앱에서 똑같이 동작해요. */
export function RoomMenu({ visible, items, onClose }: { visible: boolean; items: MenuItem[]; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [armed, setArmed] = useState<string | null>(null);
  const { height } = useWindowDimensions();

  const close = () => {
    setArmed(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <View style={[styles.sheet, { top: insets.top + 56, backgroundColor: t.card, borderColor: t.border, maxHeight: height - insets.top - 90 }]}>
          <ScrollView bounces={false}>
          {items.map((item, i) => {
            const waiting = armed === item.label;
            return (
              <Pressable
                key={`${i}-${item.label}`}
                accessibilityRole="button"
                onPress={() => {
                  if (item.confirm && !waiting) {
                    setArmed(item.label);
                    return;
                  }
                  close();
                  item.onPress();
                }}
                style={({ pressed }) => [styles.item, item.sub && styles.subItem, { backgroundColor: pressed ? t.input : 'transparent' }]}
              >
                <Ionicons name={item.icon} size={item.sub ? 17 : 20} color={item.danger ? t.danger : item.sub ? t.subtext : t.text} />
                <Text style={{ color: item.danger ? t.danger : t.text, fontSize: item.sub ? 14 : 15, fontWeight: waiting ? '800' : '500', flexShrink: 1 }} numberOfLines={1}>
                  {waiting ? item.confirm : item.label}
                </Text>
              </Pressable>
            );
          })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,18,34,0.18)' },
  sheet: {
    position: 'absolute',
    right: 12,
    minWidth: 230,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  subItem: { paddingLeft: 40, paddingVertical: 10 },
});
