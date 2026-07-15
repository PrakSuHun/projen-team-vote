import type { ScoringConfig, Settings } from "./types";

export const DEFAULT_CONFIG: ScoringConfig = {
  participantMaxPoints: 50, // 투표 가능자 전원이 선택하면 50점 만점
  participantMinPoints: 20, // 한 표도 못 받아도 기본 20점
  judgeMaxPoints: 50, // 심사단 합산: 전원 1등 = 50점
  judgeMinPoints: 35, // 심사단 합산: 전원 꼴등이어도 기본 35점
  participantRankPoints: [1, 1, 1], // 3팀 선택, 순위 없이 동일 배점
  eligibilityCorrection: true, // 본인 팀엔 투표 불가 → 팀 인원수 차이 보정(만점 도달 가능하게)
};

// 저장소에 예전 형식의 config 가 남아 있어도 새 필드가 기본값으로 채워지도록 병합
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    config: { ...DEFAULT_CONFIG, ...(stored?.config ?? {}) },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  participantVotingOpen: true,
  judgeVotingOpen: true,
  revealStep: 0,
  config: DEFAULT_CONFIG,
};

export const TOP_N = 5; // 극적으로 공개할 상위 팀 수 (5위~1위)
