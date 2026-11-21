/** scripts/build-web.mjs가 만드는 웹 앱 파일 묶음 (경로 → 내용) */
declare const assets: Record<string, { type: string; text?: string; b64?: string }>;
export default assets;
