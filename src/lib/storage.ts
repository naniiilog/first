import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ApiKeys, Bot, Room } from './types';

const DATA_KEY = 'botroom.data.v1';
const KEY_PREFIX = 'botroom_key_';

export interface PersistedData {
  bots: Bot[];
  rooms: Room[];
  userName: string;
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
    // 저장 실패는 앱 동작을 막지 않습니다.
  }
}

// API 키는 휴대폰의 보안 저장소(Keychain/Keystore)에 보관합니다. 웹 미리보기에서는 AsyncStorage를 씁니다.
async function getSecret(name: string): Promise<string> {
  try {
    if (Platform.OS === 'web') return (await AsyncStorage.getItem(KEY_PREFIX + name)) ?? '';
    return (await SecureStore.getItemAsync(KEY_PREFIX + name)) ?? '';
  } catch {
    return '';
  }
}

async function setSecret(name: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (value) await AsyncStorage.setItem(KEY_PREFIX + name, value);
    else await AsyncStorage.removeItem(KEY_PREFIX + name);
    return;
  }
  if (value) await SecureStore.setItemAsync(KEY_PREFIX + name, value);
  else await SecureStore.deleteItemAsync(KEY_PREFIX + name);
}

export async function loadKeys(): Promise<ApiKeys> {
  const [anthropic, openai, google] = await Promise.all([
    getSecret('anthropic'),
    getSecret('openai'),
    getSecret('google'),
  ]);
  return { anthropic, openai, google };
}

export async function saveKeys(keys: ApiKeys): Promise<void> {
  await Promise.all(Object.entries(keys).map(([name, value]) => setSecret(name, value.trim())));
}
