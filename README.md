# BotRoom 🤖💬

여러 AI 봇을 **한 채팅방에** 모아서 대화하고 토론시키는 모바일 앱이에요. (Expo / React Native)

## 기능

- **여러 회사 AI를 섞어서**: Claude(Anthropic), ChatGPT(OpenAI), Gemini(Google)를 한 방에 넣을 수 있어요.
- **캐릭터 봇**: 봇마다 이름, 아이콘, 색, 성격/역할(시스템 프롬프트), 모델을 정해요. 같은 AI로 성격이 다른 봇을 여러 개 만들 수도 있어요.
- **두 가지 대화 방식**
  - 💬 내가 메시지를 보내면 봇들이 **순서대로** 답해요. 뒤에 말하는 봇은 앞 봇의 답도 보고 반응해요.
  - 🗣️ **자동 토론**: 주제를 주고 라운드 수를 정하면 봇들끼리 알아서 대화를 이어가요. 언제든 `중지`할 수 있어요.
- 채팅방과 봇은 기기에 저장되고, API 키는 휴대폰 보안 저장소(Keychain/Keystore)에 보관돼요.

## 실행하기

```bash
npm install
npx expo start
```

- 휴대폰에 **Expo Go** 앱을 설치하고 터미널에 뜬 QR 코드를 찍으면 바로 실행돼요.
- 브라우저에서 보려면 `npx expo start --web`

처음 실행하면 **설정**에서 쓰려는 AI의 API 키를 입력하세요. 쓰려는 회사의 키만 있으면 돼요.

| AI | 키 발급 |
| --- | --- |
| Claude | https://console.anthropic.com |
| ChatGPT | https://platform.openai.com/api-keys |
| Gemini | https://aistudio.google.com/apikey |

> ⚠️ 이 앱은 각 AI 회사 API를 휴대폰에서 바로 호출해요. 내 키를 내 기기에서만 쓰는 개인용으로는 괜찮지만, 다른 사람에게 배포하려면 키를 서버에 두고 서버를 거쳐 호출하도록 바꾸는 게 안전해요.

## 구조

```
src/
  app/                  # 화면 (Expo Router)
    index.tsx           # 채팅방 목록
    room/[id].tsx       # 채팅방 (대화, 자동 토론)
    room/new.tsx        # 새 채팅방 만들기
    bots.tsx            # 봇 목록
    bot/[id].tsx        # 봇 만들기/편집
    settings.tsx        # API 키, 내 이름
  lib/
    providers.ts        # Claude / OpenAI / Gemini 호출
    conversation.ts     # 단체방 기록 → 봇별 대화로 변환, 시스템 프롬프트
    store.tsx           # 상태 관리, 봇 차례대로 말하기 / 토론 진행
    storage.ts          # 기기 저장소
    presets.ts          # 기본 봇
```

### 단체 대화는 어떻게 돌아가나요?

AI API는 기본적으로 1:1 대화(나 ↔ AI)만 알아들어요. 그래서 봇이 말할 차례가 되면 그 봇 입장에서 대화 기록을 다시 만들어요.

- 그 봇이 한 말 → `assistant`
- 나와 다른 봇들이 한 말 → `user`, 앞에 `[이름]`을 붙여 누가 말했는지 표시

이렇게 하면 어느 회사 AI든 자기가 단체방에 있다는 걸 이해하고, 다른 봇의 말에 반응할 수 있어요.

## 개발

```bash
npm run typecheck              # 타입 검사
npx expo export --platform web # 웹 빌드
```
