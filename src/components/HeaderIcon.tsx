import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '../lib/theme';

/** 헤더 오른쪽 아이콘 버튼. 같은 크기 상자 안 가운데에 그려서 여러 개를 놓아도 줄이 맞아요. */
export function HeaderIcon({
  name,
  label,
  onPress,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, opacity: pressed ? 0.5 : 1 })}
    >
      <Ionicons name={name} size={26} color={t.text} />
    </Pressable>
  );
}
