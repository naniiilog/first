import { Platform } from 'react-native';

/**
 * 사진을 휴대폰에 저장해요.
 * 웹: 파일로 내려받아요(안드로이드 크롬은 '다운로드' 폴더 → 갤러리에서도 보여요).
 */
export async function saveImage(src: string, name: string): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '앱 버전에서는 아직 저장을 못 해요. 사진을 길게 눌러 저장해 주세요.';
  const res = await fetch(src);
  if (!res.ok) throw new Error('사진을 불러오지 못했어요.');
  const blob = await res.blob();
  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${name}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
  return '저장했어요. 다운로드 폴더(갤러리)에서 볼 수 있어요.';
}
