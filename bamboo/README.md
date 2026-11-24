# 🎋 대나무숲

임금님 귀는 당나귀 귀! 하고 싶은 말을 외치면 대나무 잎이 되어 24시간 동안 숲에 머물다 사라지는 익명 웹앱.

- 댓글 없음. 반응은 `🍃 들었어요`만
- 가입 없음, IP 미저장 (하루마다 바뀌는 해시로만 도배 방지)
- 개인정보(전화번호·주민번호·이메일·계좌), 링크, 욕설 차단
- 도배 방지: 10분에 3개, 하루 20개
- 신고 3회 시 자동 숨김, `/admin.html`에서 관리
- 스택: Cloudflare Workers + D1 + 정적 에셋

## 로컬 실행
```bash
npm install
npm run db:init:local
npm run dev          # http://localhost:8787  (관리자 비밀번호: .dev.vars 의 ADMIN_TOKEN)
```

## 배포
```bash
npx wrangler d1 create bamboo         # 나온 database_id를 wrangler.toml에 넣기
npm run db:init:remote
npx wrangler secret put ADMIN_TOKEN   # 관리자 비밀번호
npx wrangler secret put SALT          # 아무 긴 랜덤 문자열
npm run deploy
```
