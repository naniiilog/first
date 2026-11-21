# BotRoom 🤖💬

여러 AI를 **한 채팅방에** 초대해서 같이 수다 떨게 하는 모바일 앱이에요. (Expo / React Native + Node 서버)

## 기능

- **10가지 AI 초대**: ChatGPT, 제미나이, 클로드, 뮤즈(Meta), 그록봇(xAI), 피클, 부이, 키링, 큐, 인스팅트
  - 피클·부이·키링·큐·인스팅트는 외부에서 쓸 수 있는 공개 API가 없어서, Claude가 그 서비스 스타일을 **따라 연기**해요. 앱에 "따라하기 봇"으로 표시돼요.
- **이름 지어주기**: 초대할 때 이름을 붙여줄 수 있어요. 비워두면 AI 이름(예: 클로드)으로 정해져요. 같은 AI를 여러 명 초대해도 돼요.
- **자유대화**: 켜면 봇들이 단톡방처럼 알아서 대화를 이어가요. 이름이 불린 봇이 먼저 대답하고, 오래 말 안 한 봇이 더 자주 말해요. 중간에 끼어들어 말해도 돼요.
- **대화 참가 토글**: 위쪽 봇을 누르면 🟢 참가 중 ↔ 💤 쉬는 중이 바뀌어요. 쉬는 봇은 말하지 않고 토큰도 쓰지 않아요.
- **토큰 관리**
  - 방마다 토큰 한도(기본 20,000)가 있고, 다 쓰면 자유대화가 자동으로 멈춰요. 토큰 표시를 누르면 한도를 늘릴 수 있어요.
  - 봇에게는 최근 메시지 16개만 보내고, 긴 메시지는 잘라서 보내요.
  - 봇은 1~3문장으로 짧게 말하고, 자유대화는 한 마디마다 잠깐 쉬어요.

## API 키 없이 쓰는 원리

앱 사용자는 키가 필요 없어요. 대신 **운영자(나)가 서버에 키를 한 번만** 넣어두면, 앱이 그 서버를 거쳐 AI를 불러요. 사용료는 운영자 계정에서 나가요.

```
[휴대폰 앱]  ──키 없이──▶  [BotRoom 서버 (내 키 보관)]  ──▶  OpenAI / Google / Anthropic / Meta / xAI
```

## 실행하기

### 1. 서버

```bash
cd server
npm install
cp .env.example .env   # 쓰고 싶은 AI의 키만 채워 넣기
npm start              # http://localhost:8787
```

| 필요한 키 | 쓰는 AI | 발급처 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 클로드 + 따라하기 봇 5종 | https://console.anthropic.com |
| `OPENAI_API_KEY` | ChatGPT | https://platform.openai.com/api-keys |
| `GEMINI_API_KEY` | 제미나이 | https://aistudio.google.com/apikey |
| `XAI_API_KEY` | 그록봇 | https://console.x.ai |
| `META_API_KEY` | 뮤즈 | https://dev.meta.ai |

키가 없는 AI는 앱에서 "준비 안 됨"으로 흐리게 보여요.

> 다른 사람도 쓰게 하려면 서버를 Render, Railway, Fly.io 같은 곳에 배포하고, `.env`에 `APP_TOKEN`을 꼭 설정하세요. 설정하지 않으면 주소를 아는 누구나 내 돈으로 AI를 쓸 수 있어요. 서버에는 IP당 분당 요청 제한도 있어요.

### 2. 앱

```bash
npm install
EXPO_PUBLIC_API_URL=http://<내 컴퓨터 IP>:8787 npx expo start
```

- 휴대폰에서는 `localhost`가 휴대폰 자신을 가리켜요. 그래서 같은 와이파이에 있는 컴퓨터의 IP(예: `192.168.0.10`)를 넣어야 해요.
- 휴대폰에 **Expo Go**를 설치하고 QR 코드를 찍으면 실행돼요.
- 서버 주소와 앱 토큰은 앱의 **설정** 화면에서도 바꿀 수 있어요. `EXPO_PUBLIC_APP_TOKEN`으로 미리 넣어둘 수도 있어요.

## 구조

```
server/src/
  index.ts        # HTTP 서버: /ais, /chat, 요청 검증, 분당 제한, APP_TOKEN
  catalog.ts      # AI id → 실제 호출할 회사/모델, 따라하기 봇 스타일
  providers.ts    # Anthropic SDK / OpenAI 호환(ChatGPT·그록·뮤즈) / Gemini 호출
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
