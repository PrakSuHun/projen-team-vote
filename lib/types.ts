// 공통 타입 정의

export type Team = {
  id: number; // 1..11
  label: string; // 화면 표시용, 예: "1팀(Axis)"
};

export type Participant = {
  id: string; // 예: "p1"
  name: string; // 원본 이름
  key: string; // 인증용 정규화 이름(공백 제거)
  teamId: number;
  school: string;
  grade: string;
};

// 참가자 표: ranks = [1위 팀id, 2위 팀id, 3위 팀id]
export type ParticipantVote = {
  participantId: string;
  ranks: number[];
  createdAt: string;
};

// 심사위원 표: ranking = 팀id를 1등부터 11등 순서로 나열한 배열(길이 11)
export type JudgeVote = {
  judgeId: string;
  ranking: number[];
  createdAt: string;
};

export type ScoringConfig = {
  participantMaxPoints: number; // 참가자 파트 만점(기본 50)
  participantMinPoints: number; // 참가자 파트 기본점(기본 20) — 득표 0이어도 받는 점수
  judgeMaxPoints: number; // 심사단 합산 1등 점수(기본 50)
  judgeMinPoints: number; // 심사단 합산 꼴등 기본 점수(기본 35)
  participantRankPoints: number[]; // 선택 순서별 배점(기본 [1,1,1] = 동일)
  eligibilityCorrection: boolean; // true면 "그 팀에 투표 가능했던 투표자 수" 기준으로 득표율 계산
};

export type Settings = {
  participantVotingOpen: boolean;
  judgeVotingOpen: boolean;
  revealStep: number; // 0=대기, 1..=순위별 세부 단계, 마지막=전체 순위표 (lib/reveal.ts)
  config: ScoringConfig;
};

export type TeamResult = {
  teamId: number;
  label: string;
  participantRaw: number;
  judgeRaw: number;
  participantShare: number; // 참가자 점수 (participantMinPoints ~ Max, 기본 20~50)
  judgeShare: number; // 심사단 점수 (judgeMinPoints ~ judgeMaxPoints, 기본 35~50)
  finalScore: number; // 총점 = participantShare + judgeShare (기본 최고 100점)
  displayScore: number; // 1위=100 기준 환산
  rank: number; // 1이 최고
};
