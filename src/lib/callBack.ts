import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { aiOf, rejoinText } from './ais';
import type { Member } from './types';

/**
 * 다시 부르기: 다른 앱에 메시지를 대신 보낼 수는 없어서,
 * 부르는 말을 복사하고 그 AI 앱을 열어줘요(문구를 미리 넣어 주는 앱은 입력칸에 들어가 있어요).
 * 웹에서 새 창이 막히지 않게 복사와 열기를 같은 순간에 시작해요.
 * onNote에 화면에 보여줄 안내를 알려줘요(복사가 실패하면 한 번 더 불러요).
 */
export function callBackBot(m: Member, onNote: (note: string) => void) {
  const ai = aiOf(m.kind);
  const text = rejoinText(m.name);
  const copied = Clipboard.setStringAsync(text).catch(() => false);
  if (ai.appLink) {
    Linking.openURL(ai.appLink(text)).catch(() => {});
    onNote(`부르는 말을 복사하고 ${ai.name}을(를) 열었어요. 입력칸에 문구가 없으면 붙여넣고 보내 주세요. (그 앱의 새 대화에서 다봇 커넥터가 꺼져 있으면 켜 주세요)`);
  } else {
    onNote(`부르는 말을 복사했어요. ${ai.name} 앱을 열어서 붙여넣고 보내 주세요.`);
  }
  copied.then((ok) => {
    if (ok === false) onNote(`복사가 안 됐어요. 그 앱에 이렇게 보내 주세요:\n${text}`);
  });
}
