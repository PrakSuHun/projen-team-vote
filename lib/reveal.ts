import type { TeamResult } from "./types";
import { TOP_N } from "./config";

// 한 순위당 노출 단계:
// 0 = "N위!" 두구두구(긴장)  1 = 참가자 점수  2 = 심사위원 점수  3 = 총점  4 = 팀 공개
export const PHASES_PER_RANK = 5;
export const REVEAL_PHASE = {
  ANNOUNCE: 0,
  PARTICIPANT: 1,
  JUDGE: 2,
  TOTAL: 3,
  TEAM: 4,
} as const;

// 전체 발표 step 수: (상위 N팀 × 단계) + 전체 순위표 1단계
export const TOTAL_REVEAL_STEPS = TOP_N * PHASES_PER_RANK + 1;

export type RevealMeta = {
  step: number;
  idle: boolean; // step 0 = 발표 전 대기
  fullStandings: boolean; // 마지막 step = 전체 순위표
  rank: number; // 현재 공개 중인 순위(1~5), idle/full 이면 0
  phase: number; // 0~4
};

export function revealMeta(step: number): RevealMeta {
  const s = Math.max(0, Math.min(step, TOTAL_REVEAL_STEPS));
  if (s === 0) return { step: 0, idle: true, fullStandings: false, rank: 0, phase: 0 };
  if (s === TOTAL_REVEAL_STEPS)
    return { step: s, idle: false, fullStandings: true, rank: 0, phase: 0 };
  const idx = s - 1;
  const rankOrder = Math.floor(idx / PHASES_PER_RANK); // 0=5위 ... (N-1)=1위
  const rank = TOP_N - rankOrder;
  const phase = idx % PHASES_PER_RANK;
  return { step: s, idle: false, fullStandings: false, rank, phase };
}

export type RevealEntry = {
  rank: number;
  current: boolean;
  label: string | null;
  participantShare: number | null;
  judgeShare: number | null;
  finalScore: number | null;
  displayScore: number | null;
};

export type RevealPayload = {
  step: number;
  totalSteps: number;
  meta: RevealMeta;
  entries: RevealEntry[]; // 이미 공개된(+현재) 순위들, 순위 오름차순(5위→1위 진행이면 뒤로 갈수록 상위)
  fullStandings: RevealEntry[] | null; // 마지막 step 에서 11팀 전체
};

// results: computeResults() 결과(rank 오름차순, 1위가 앞). 현재 step 기준으로 노출 범위를 잘라 반환.
export function buildRevealPayload(step: number, results: TeamResult[]): RevealPayload {
  const meta = revealMeta(step);
  const byRank = new Map<number, TeamResult>();
  for (const r of results) byRank.set(r.rank, r);

  const full = (r: TeamResult, current = false): RevealEntry => ({
    rank: r.rank,
    current,
    label: r.label,
    participantShare: r.participantShare,
    judgeShare: r.judgeShare,
    finalScore: r.finalScore,
    displayScore: r.displayScore,
  });

  if (meta.fullStandings) {
    return {
      step,
      totalSteps: TOTAL_REVEAL_STEPS,
      meta,
      entries: results.map((r) => full(r)),
      fullStandings: results.map((r) => full(r)),
    };
  }

  const entries: RevealEntry[] = [];
  // 5위부터 현재 순위까지(이미 완전히 공개된 순위 + 현재 진행 순위)
  for (let rank = TOP_N; rank >= meta.rank && rank >= 1; rank--) {
    if (meta.idle) break;
    const r = byRank.get(rank);
    if (!r) continue;
    if (rank > meta.rank) {
      // 이전에 완전히 공개된 순위
      entries.push(full(r));
    } else {
      // 현재 진행 중인 순위 — phase 에 따라 점진 공개
      const p = meta.phase;
      entries.push({
        rank: r.rank,
        current: true,
        participantShare: p >= REVEAL_PHASE.PARTICIPANT ? r.participantShare : null,
        judgeShare: p >= REVEAL_PHASE.JUDGE ? r.judgeShare : null,
        finalScore: p >= REVEAL_PHASE.TOTAL ? r.finalScore : null,
        displayScore: p >= REVEAL_PHASE.TOTAL ? r.displayScore : null,
        label: p >= REVEAL_PHASE.TEAM ? r.label : null,
      });
    }
  }
  // entries 는 5위→1위 순서(위→아래로 쌓임). 화면에서 원하는 대로 정렬.
  return { step, totalSteps: TOTAL_REVEAL_STEPS, meta, entries, fullStandings: null };
}
