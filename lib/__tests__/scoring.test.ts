import { describe, it, expect } from "vitest";
import { computeResults } from "../scoring";
import { DEFAULT_CONFIG } from "../config";
import { PARTICIPANTS, teamSize } from "../roster";
import type { ParticipantVote, JudgeVote } from "../types";

const now = "2026-01-01T00:00:00.000Z";

// 특정 팀 소속이 아닌 참가자들 id 목록
function votersNotInTeam(teamId: number): string[] {
  return PARTICIPANTS.filter((p) => p.teamId !== teamId).map((p) => p.id);
}

describe("computeResults — 참가자 20~50 / 심사 35~50, 명단 기준 모수", () => {
  it("만점 시나리오: 투표 가능자 전원 선택 + 심사 전원 1등 = 100점", () => {
    const pVotes: ParticipantVote[] = votersNotInTeam(1).map((id) => ({
      participantId: id,
      ranks: [1, 2, 3], // 전원이 1팀 포함 (집계 로직만 검증)
      createdAt: now,
    }));
    const jVotes: JudgeVote[] = [
      { judgeId: "a", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
      { judgeId: "b", ranking: [1, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10], createdAt: now },
    ];
    const res = computeResults(pVotes, jVotes, DEFAULT_CONFIG);
    const t1 = res.find((r) => r.teamId === 1)!;
    expect(t1.participantShare).toBe(50); // 20 + 100% × 30
    expect(t1.judgeShare).toBe(50);
    expect(t1.finalScore).toBe(100);
    expect(t1.rank).toBe(1);
  });

  it("한 표도 못 받은 팀도 기본 20점 (참가자 표가 존재할 때)", () => {
    const [v1] = votersNotInTeam(1);
    const pVotes: ParticipantVote[] = [
      { participantId: v1, ranks: [1, 2, 3], createdAt: now },
    ];
    const res = computeResults(pVotes, [], DEFAULT_CONFIG);
    const t11 = res.find((r) => r.teamId === 11)!;
    expect(t11.participantShare).toBe(20); // 득표 0 → 기본점
  });

  it("모수는 실제 투표자가 아닌 전체 명단 기준(기권 포함)", () => {
    // 1명만 투표해도 만점이 되지 않는다: 20 + (1/모수) × 30
    const [v1] = votersNotInTeam(1);
    const pVotes: ParticipantVote[] = [
      { participantId: v1, ranks: [1, 2, 3], createdAt: now },
    ];
    const res = computeResults(pVotes, [], DEFAULT_CONFIG);
    const t1 = res.find((r) => r.teamId === 1)!;
    const denom = PARTICIPANTS.length - teamSize(1); // 33 - 2 = 31
    expect(t1.participantShare).toBeCloseTo(20 + (1 / denom) * 30, 2); // ≈ 20.97
  });

  it("심사 꼴등 기본점: 두 심사위원 모두 11등이면 35점", () => {
    const jVotes: JudgeVote[] = [
      { judgeId: "a", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
      { judgeId: "b", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
    ];
    const res = computeResults([], jVotes, DEFAULT_CONFIG);
    const t11 = res.find((r) => r.teamId === 11)!;
    expect(t11.judgeShare).toBe(35);
    expect(t11.finalScore).toBe(35); // 참가자 표 없음 → 참가자 파트 0
  });

  it("심사 등수당 1.5점 차이 (합산 기준)", () => {
    const jVotes: JudgeVote[] = [
      { judgeId: "a", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
      { judgeId: "b", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
    ];
    const res = computeResults([], jVotes, DEFAULT_CONFIG);
    expect(res.find((r) => r.teamId === 1)!.judgeShare).toBe(50);
    expect(res.find((r) => r.teamId === 2)!.judgeShare).toBe(48.5);
  });

  it("심사위원끼리는 평균: 1등+3등 = (50+47)/2 = 48.5", () => {
    const jVotes: JudgeVote[] = [
      { judgeId: "a", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
      { judgeId: "b", ranking: [2, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
    ];
    const res = computeResults([], jVotes, DEFAULT_CONFIG);
    expect(res.find((r) => r.teamId === 1)!.judgeShare).toBe(48.5);
  });

  it("선택 순서는 점수에 영향이 없다 (동일 배점)", () => {
    const [v1, v2] = votersNotInTeam(2);
    const a = computeResults(
      [{ participantId: v1, ranks: [2, 3, 4], createdAt: now }],
      [],
      DEFAULT_CONFIG,
    );
    const b = computeResults(
      [{ participantId: v2, ranks: [4, 3, 2], createdAt: now }],
      [],
      DEFAULT_CONFIG,
    );
    expect(a.find((r) => r.teamId === 2)!.participantShare).toBe(
      b.find((r) => r.teamId === 2)!.participantShare,
    );
  });

  it("표가 하나도 없으면 0점이고 크래시하지 않는다", () => {
    const res = computeResults([], [], DEFAULT_CONFIG);
    expect(res).toHaveLength(11);
    expect(res.every((r) => r.finalScore === 0)).toBe(true);
    expect(res.map((r) => r.rank).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1),
    );
  });
});
