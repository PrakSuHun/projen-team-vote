import type {
  ParticipantVote,
  JudgeVote,
  ScoringConfig,
  TeamResult,
} from "./types";
import { TEAMS, teamLabel, PARTICIPANTS, teamSize } from "./roster";

/**
 * 참가자 + 심사위원 표를 받아 팀별 종합 점수와 순위를 계산한다. (순수 함수)
 *
 * 각 팀은 100점 만점(기본 설정 기준):
 * - 참가자 파트(20~50점): 기본점 + 득표율 × (만점 - 기본점).
 *   득표율의 모수는 "전체 명단" 기준 — 기권자가 있어도 33명이 투표한 것으로 나눈다.
 *   (eligibilityCorrection이 true면 본인 팀원은 모수에서 제외 — 전원이 뽑아주면 만점 도달 가능)
 * - 심사단 파트(35~50점): 등수를 judgeMaxPoints(1등)~judgeMinPoints(꼴등) 사이
 *   선형 점수로 환산해 심사위원 평균. 등수당 차이 = (max-min)/10 = 기본 1.5점.
 * - 총점 = 참가자 점수 + 심사단 점수. (표가 한 장도 없는 파트는 0점 처리)
 */
export function computeResults(
  participantVotes: ParticipantVote[],
  judgeVotes: JudgeVote[],
  config: ScoringConfig,
): TeamResult[] {
  const participantRaw = new Map<number, number>();
  for (const t of TEAMS) participantRaw.set(t.id, 0);

  // ── 참가자 파트: 득표(배점) 집계 ──
  for (const vote of participantVotes) {
    vote.ranks.forEach((teamId, idx) => {
      if (teamId == null || !participantRaw.has(teamId)) return;
      const pts = config.participantRankPoints[idx] ?? 0;
      participantRaw.set(teamId, (participantRaw.get(teamId) ?? 0) + pts);
    });
  }

  // 한 투표자가 한 팀에게 줄 수 있는 최대 점수(동일 배점이면 1)
  const perVoterMax = Math.max(0, ...config.participantRankPoints);

  // 팀별 득표율 모수 — 실제 투표자 수가 아니라 "전체 명단" 기준(기권도 모수에 포함).
  // 보정 on: 본인 팀원은 그 팀에 투표할 수 없으므로 모수에서 제외.
  const votersByTeamDenom = (teamId: number): number => {
    if (!config.eligibilityCorrection) return PARTICIPANTS.length;
    return PARTICIPANTS.length - teamSize(teamId);
  };

  // ── 심사단 파트: 등수 → 선형 점수(1등=max … 꼴등=min), 심사위원 평균 ──
  const rankStep =
    TEAMS.length > 1
      ? (config.judgeMaxPoints - config.judgeMinPoints) / (TEAMS.length - 1)
      : 0;
  const judgeScoreSum = new Map<number, number>();
  for (const t of TEAMS) judgeScoreSum.set(t.id, 0);
  for (const vote of judgeVotes) {
    vote.ranking.forEach((teamId, idx) => {
      if (teamId == null || !judgeScoreSum.has(teamId)) return;
      const pts = config.judgeMaxPoints - rankStep * idx;
      judgeScoreSum.set(teamId, (judgeScoreSum.get(teamId) ?? 0) + pts);
    });
  }

  const results: TeamResult[] = TEAMS.map((t) => {
    const pRaw = participantRaw.get(t.id) ?? 0;
    const denom = votersByTeamDenom(t.id) * perVoterMax;
    // 참가자 점수: 기본점 + 득표율 × (만점 - 기본점). 참가자 표가 아예 없으면 0점.
    const pSpread = config.participantMaxPoints - config.participantMinPoints;
    const participantScore =
      participantVotes.length > 0 && denom > 0
        ? config.participantMinPoints + (pRaw / denom) * pSpread
        : 0;
    // 심사단 점수: 심사위원 평균 (심사 표가 없으면 0)
    const judgeScore =
      judgeVotes.length > 0 ? (judgeScoreSum.get(t.id) ?? 0) / judgeVotes.length : 0;
    const finalScore = participantScore + judgeScore;
    return {
      teamId: t.id,
      label: teamLabel(t.id),
      participantRaw: round(pRaw, 3),
      judgeRaw: round(judgeScore, 2),
      participantShare: round(participantScore, 2),
      judgeShare: round(judgeScore, 2),
      finalScore: round(finalScore, 2),
      displayScore: 0, // 아래에서 채움
      rank: 0,
    };
  });

  // 순위 매기기 (동점 시 심사 점수 → 참가자 점수 순)
  const ordered = [...results].sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      b.judgeShare - a.judgeShare ||
      b.participantShare - a.participantShare,
  );
  const maxFinal = ordered[0]?.finalScore ?? 0;
  ordered.forEach((r, i) => {
    r.rank = i + 1;
    r.displayScore = maxFinal > 0 ? round((r.finalScore / maxFinal) * 100, 1) : 0;
  });

  return ordered;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
