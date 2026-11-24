import { Alert, Platform } from 'react-native';

/**
 * 보내기 전에 개인정보처럼 보이는 값이 있는지 봐요.
 * 방 글은 봇들(각 AI 회사)도 읽어서, 실수로 올리지 않게 한 번 물어봐요.
 * 모든 형식을 알 수는 없어서 흔한 형식만 찾아요.
 */
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: '주민등록번호', re: /\b\d{6}\s?-\s?[1-8]\d{6}\b/ },
  { label: '휴대폰 번호', re: /\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/ },
  { label: '카드 번호', re: /\b(?:\d{4}[-\s]?){3}\d{4}\b/ },
  { label: '계좌 번호', re: /(?:계좌|입금|은행|송금)[^\n]{0,15}\d[\d-]{8,18}\d/ },
  { label: '여권 번호', re: /(?:여권)[^\n]{0,10}\b[A-Z]{1,2}\d{7,8}\b/i },
  { label: '비밀번호', re: /(?:비밀번호|비번|패스워드|password|pw)\s*(?:은|는|:|=)\s*\S{3,}/i },
  { label: '인증번호', re: /(?:인증\s*번호|인증\s*코드|OTP)\s*(?:은|는|:|=)?\s*\d{4,8}\b/i },
  { label: '이메일 주소', re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/ },
  { label: '집 주소', re: /(?:[가-힣]+(?:시|도)\s+)?[가-힣]+(?:구|군)\s+[가-힣0-9]+(?:로|길|동)\s*\d+/ },
  { label: 'API 키', re: /\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,})/ },
];

/** 찾은 개인정보 종류들(없으면 빈 배열) */
export function findPrivate(text: string): string[] {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/**
 * 개인정보가 있으면 "그래도 보낼까요?"를 물어요. 보내도 되면 true.
 * 웹은 브라우저 확인 창, 앱은 알림 창으로 물어요.
 */
export function confirmPrivate(text: string): Promise<boolean> {
  const found = findPrivate(text);
  if (!found.length) return Promise.resolve(true);
  const msg = `${found.join(', ')}처럼 보이는 내용이 있어요.\n방 글은 봇들(각 AI 회사)도 읽고, 초대한 사람도 봐요.\n그래도 보낼까요?`;
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`🔒 개인정보 확인\n\n${msg}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert('🔒 개인정보 확인', msg, [
      { text: '고칠게요', style: 'cancel', onPress: () => resolve(false) },
      { text: '그래도 보내기', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
