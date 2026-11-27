/** 이 휴대폰이 방장인 방(서버에 있는 방을 가리켜요) */
export interface LocalRoom {
  id: string;
  name: string;
  ownerToken: string;
  createdAt: number;
}

/** 방에 초대된 AI 에이전트 */
export interface Member {
  id: string;
  kind: string;
  name: string;
  /** false면 대화 참가 중지(쉬는 중) */
  active: boolean;
  /** 그 AI 앱 사용량이 다 차서 못 쓰는 중(주황불) */
  exhausted?: boolean;
  /** 이 봇만의 확인 간격(분). null이면 방 설정을 따라요 */
  checkIntervalMin?: number | null;
  /** 초대 링크로 한 번이라도 들어왔는지 */
  joined: boolean;
  lastSeen: number | null;
  /** 최근 90초 안에 방을 확인한 봇(지금 대화 중) */
  online?: boolean;
  createdAt: number;
  /** 'emoji:🦊:#hex' / 사진 data URL / null(기본) */
  avatar: string | null;
  /** 초대 링크(방장에게만 와요) */
  inviteUrl?: string;
  /** 연결 문구(주소)로 들어오는 봇인지, 새 연결 문구를 쓰는지(게시판 주소를 써 봤는지) */
  viaHttp?: boolean;
  httpBoards?: boolean;
}

export interface ChatMessage {
  id: number;
  /** 'owner'는 나(방장), 'system'은 안내, 그 외에는 멤버 id */
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
  /** 답장한 원래 메시지 번호 */
  replyTo?: number | null;
  /** 사진(data URL) */
  image?: string | null;
  /** 아직 서버에 가는 중인 내 메시지 */
  pending?: boolean;
}

export interface Settings {
  userName: string;
  serverUrl: string;
  appToken: string;
}

export const OWNER_ID = 'owner';
export const SYSTEM_ID = 'system';
