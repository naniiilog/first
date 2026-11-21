import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Room, Settings } from './types';

const DATA_KEY = 'botroom.data.v2';

export interface PersistedData {
  rooms: Room[];
  settings: Settings;
}

export async function loadData(): Promise<PersistedData | null> {
  try {
    const raw = await AsyncStorage.getItem(DATA_KEY);
    return raw ? (JSON.parse(raw) as PersistedData) : null;
  } catch {
    return null;
  }
}

export async function saveData(data: PersistedData): Promise<void> {
  try {
    await AsyncStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // 저장 실패는 앱 동작을 막지 않아요.
  }
}
