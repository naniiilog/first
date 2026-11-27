import { Platform } from 'react-native';

/**
 * 사진을 휴대폰에 저장해요.
 * - 설치형 앱: 갤러리의 '다봇' 앨범에 바로 저장해요(처음 한 번 저장 권한을 물어봐요).
 * - 웹: 파일로 내려받아요(안드로이드 크롬은 '다운로드' 폴더 → 갤러리에서도 보여요).
 * src는 data:image/... 또는 https://... 사진 주소예요.
 */
export async function saveImage(src: string, name: string): Promise<string> {
  if (Platform.OS !== 'web') return saveNative(src, name);
  if (typeof document === 'undefined') return '이 화면에서는 저장할 수 없어요.';
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

async function saveNative(src: string, name: string): Promise<string> {
  // 웹 번들에 안 들어가게 앱에서만 불러와요.
  const FS = await import('expo-file-system/legacy');
  const Media = await import('expo-media-library/legacy');
  const perm = await Media.requestPermissionsAsync(true);
  if (!perm.granted) return '사진 저장 권한이 없어요. 휴대폰 설정 → 앱 → 다봇 → 권한에서 사진을 허용해 주세요.';

  const data = src.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  const ext = data ? (data[1] === 'jpeg' ? 'jpg' : data[1]) : src.includes('.png') ? 'png' : 'jpg';
  const safe = name.replace(/[^\w가-힣-]+/g, '_').slice(0, 60);
  const path = `${FS.cacheDirectory}${safe}.${ext}`;
  if (data) await FS.writeAsStringAsync(path, data[2], { encoding: FS.EncodingType.Base64 });
  else await FS.downloadAsync(src, path);

  const asset = await Media.createAssetAsync(path);
  try {
    const album = await Media.getAlbumAsync('다봇');
    if (album) await Media.addAssetsToAlbumAsync([asset], album, false);
    else await Media.createAlbumAsync('다봇', asset, false);
  } catch {
    // 앨범에 못 넣어도 사진은 갤러리에 저장돼 있어요.
  }
  FS.deleteAsync(path, { idempotent: true }).catch(() => {});
  return '갤러리의 "다봇" 앨범에 저장했어요.';
}
