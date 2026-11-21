# BotRoom 🤖💬

여러 AI를 **한 채팅방에** 초대해서 같이 수다 떨게 하는 모바일 앱이에요. (Expo / React Native + Node 서버)

## 기능

- **10가지 AI 초대**: ChatGPT, 제미나이, 클로드, 뮤즈(Meta), 그록봇(xAI), 피클, 부이, 키링, 큐, 인스팅트
- **이름 지어주기**: 초대할 때 이름을 붙여줄 수 있어요. 비워두면 AI 이름(예: 클로드)으로 정해져요. 같은 AI를 여러 명 초대해도 돼요.
- **자유대화**: 켜면 봇들이 단톡방처럼 알아서 대화를 이어가요. 이름이 불린 봇이 먼저 대답하고, 중간에 끼어들어 말해도 돼요.
- **대화 참가 토글**: 위쪽 봇을 누르면 🟢 참가 중 ↔ 💤 쉬는 중이 바뀌어요. 쉬는 봇은 말하지 않고 토큰도 쓰지 않아요.
- **토큰 관리**
  - 방마다 토큰 한도(기본 20,000)가 있고, 다 쓰면 자유대화가 자동으로 멈춰요. 토큰 표시를 누르면 한도를 늘릴 수 있어요.
  - 봇에게는 최근 메시지 16개만 보내고, 1~3문장으로 짧게 답하게 해요.
  - 자유대화는 한 마디마다 4초씩 쉬어서 무료 사용량의 분당 제한에 덜 걸려요.

## 💸 무료로 쓰기

**제미나이 무료 API 키 하나만** 있으면 전부 무료예요. 키는 https://aistudio.google.com/apikey 에서 결제 정보 없이 발급돼요.

| AI | 키가 제미나이뿐일 때 | 그 회사 유료 키를 넣으면 |
| --- | --- | --- |
| 제미나이 | 진짜 제미나이 | — |
| ChatGPT · 클로드 · 뮤즈 · 그록봇 | 제미나이가 그 AI 말투로 **따라하기** | 진짜 그 AI로 연결 |
| 피클 · 부이 · 키링 · 큐 · 인스팅트 | **따라하기** (공개 API가 없음) | — |

앱에도 "진짜 연결 / 따라하기"가 표시돼요.

무료 사용 시 알아둘 점:
- 제미나이 무료 사용량에는 분당·하루 한도가 있어요. 넘으면 "잠시 후(또는 내일) 다시 시도해 주세요"가 뜨고 자유대화가 멈춰요. 정확한 한도는 AI Studio에서 확인할 수 있어요.
- 구글은 무료 사용량으로 들어온 대화를 서비스 개선에 쓸 수 있어요. 민감한 내용은 넣지 마세요.

## API 키 없이 쓰는 원리

앱 사용자는 키가 필요 없어요. **운영자(나)가 서버에 키를 한 번만** 넣어두면 앱이 그 서버를 거쳐 AI를 불러요.

```
[휴대폰 앱]  ──키 없이──▶  [BotRoom 서버 (내 키 보관)]  ──▶  제미나이 (+ 선택: OpenAI / Anthropic / Meta / xAI)
```

## 실행하기

### 1. 서버 — 내 컴퓨터에서

```bash
cd server
npm install
cp .env.example .env   # GEMINI_API_KEY 한 줄만 채우면 돼요
npm start              # http://localhost:8787
```

### 1. 서버 — 인터넷에 무료로 올리기 (Cloudflare Workers)

Cloudflare 무료 계정이 있으면 돼요. 서버가 항상 켜져 있어요.

```bash
cd server
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # 제미나이 키 붙여넣기
npx wrangler secret put APP_TOKEN        # 아무도 모르는 긴 문자열 (남이 내 서버를 쓰는 것 방지)
npm run deploy                           # https://botroom-server.<내계정>.workers.dev 주소가 나와요
```

유료 키를 쓰려면 같은 방식으로 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `META_API_KEY`를 추가해요.

### 2. 앱

```bash
npm install
EXPO_PUBLIC_API_URL=<서버 주소> EXPO_PUBLIC_APP_TOKEN=<APP_TOKEN 값> npx expo start
```

- 휴대폰에 **Expo Go**를 설치하고 QR 코드를 찍으면 실행돼요.
- 서버를 내 컴퓨터에서 돌린다면 서버 주소에 `localhost` 대신 컴퓨터 IP를 넣어야 해요(예: `http://192.168.0.10:8787`). 휴대폰에서 `localhost`는 휴대폰 자신을 가리켜요.
- 서버 주소와 앱 토큰은 앱의 **설정** 화면에서도 바꿀 수 있어요.

## 구조

```
server/src/
  app.ts          # API: /ais, /chat, 요청 검증, 분당 제한, APP_TOKEN
  catalog.ts      # AI별로 진짜 연결할지, 무료 엔진으로 따라 할지 결정
  providers.ts    # Gemini / Anthropic SDK / OpenAI 호환(ChatGPT·그록·뮤즈) 호출
  index.ts        # 내 컴퓨터에서 실행 (Node)
  worker.ts       # Cloudflare Workers에서 실행
src/
  app/
    index.tsx               # 채팅방 목록
    room/new.tsx            # 새 채팅방: AI 고르고 이름 지어주기
    room/[id]/index.tsx     # 채팅방: 참가 토글, 토큰 표시, 자유대화
    room/[id]/members.tsx   # 멤버 관리: 이름 바꾸기, 참가 스위치, 내보내기, 초대
    settings.tsx            # 내 이름, 서버 주소
  lib/
    ais.ts          # AI 종류 목록 (이름, 아이콘, 색)
    conversation.ts # 단체방 기록 → 봇별 대화, 시스템 프롬프트, 다음 발언자 고르기
    store.tsx       # 상태 관리, 방별 대화 루프, 토큰 집계
    api.ts          # 서버 호출
```

### 단체 대화는 어떻게 돌아가나요?

AI API는 1:1 대화만 알아들어요. 그래서 봇이 말할 차례가 되면 그 봇 입장에서 대화를 다시 만들어요.

- 그 봇이 한 말 → `assistant`
- 나와 다른 봇들이 한 말 → `user`, 앞에 `[이름]`을 붙여 누가 말했는지 표시

## 개발

```bash
npm run typecheck              # 앱 타입 검사
(cd server && npm run typecheck)
npx expo export --platform web # 웹 빌드
```
