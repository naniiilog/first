import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** 사진을 하나 고르게 하고, 서버에 저장할 수 있게 JPEG(data URL)로 줄여요. 취소하면 null. */
export async function pickPhoto(opts: { square?: number; maxSide?: number } = {}): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('사진 접근 권한이 필요해요. 설정에서 허용해 주세요.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: !!opts.square,
    ...(opts.square ? { aspect: [1, 1] as [number, number] } : {}),
    quality: 1,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (opts.square) {
    // 프로필: 가운데를 정사각형으로 잘라 작게 줄여요(웹처럼 편집 화면이 없어도).
    const side = Math.min(asset.width || opts.square, asset.height || opts.square);
    if (asset.width && asset.height && asset.width !== asset.height) {
      ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
    }
    ctx.resize({ width: opts.square, height: opts.square });
  } else {
    // 채팅 사진: 긴 쪽을 maxSide로 줄여요(서버 한도 600KB 안쪽).
    const maxSide = opts.maxSide ?? 1024;
    const w = asset.width || maxSide;
    const h = asset.height || maxSide;
    if (Math.max(w, h) > maxSide) ctx.resize(w >= h ? { width: maxSide } : { height: maxSide });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: opts.square ? 0.7 : 0.72, format: SaveFormat.JPEG });
  if (!saved.base64) throw new Error('사진을 처리하지 못했어요.');
  if (saved.base64.length * 0.75 > 590 * 1024) throw new Error('사진이 너무 커요. 다른 사진을 골라 주세요.');
  return `data:image/jpeg;base64,${saved.base64}`;
}
