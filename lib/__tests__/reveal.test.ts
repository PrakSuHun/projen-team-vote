import { describe, it, expect } from "vitest";
import {
  revealMeta,
  buildRevealPayload,
  TOTAL_REVEAL_STEPS,
  PHASES_PER_RANK,
} from "../reveal";
import { computeResults } from "../scoring";
import { DEFAULT_CONFIG } from "../config";
import type { ParticipantVote, JudgeVote } from "../types";

describe("revealMeta", () => {
  it("step 0 은 대기", () => {
    expect(revealMeta(0).idle).toBe(true);
  });
  it("step 1 은 5위의 첫 단계(announce)", () => {
    const m = revealMeta(1);
    expect(m.rank).toBe(5);
    expect(m.phase).toBe(0);
  });
  it("마지막 순위(1위) 팀 공개 단계", () => {
    const m = revealMeta(PHASES_PER_RANK * 5); // 25
    expect(m.rank).toBe(1);
    expect(m.phase).toBe(4);
  });
  it("마지막 step 은 전체 순위표", () => {
    expect(revealMeta(TOTAL_REVEAL_STEPS).fullStandings).toBe(true);
  });
});

describe("buildRevealPayload gating", () => {
  const now = "2026-01-01T00:00:00.000Z";
  const pVotes: ParticipantVote[] = [
    { participantId: "a", ranks: [1, 2, 3], createdAt: now },
  ];
  const jVotes: JudgeVote[] = [
    { judgeId: "j1", ranking: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], createdAt: now },
  ];
  const results = computeResults(pVotes, jVotes, DEFAULT_CONFIG);

  it("5위 announce 단계에선 점수/팀 모두 숨김", () => {
    const p = buildRevealPayload(1, results);
    const cur = p.entries.find((e) => e.current)!;
    expect(cur.rank).toBe(5);
    expect(cur.participantShare).toBeNull();
    expect(cur.label).toBeNull();
  });

  it("5위 참가자 점수 단계에선 참가자만 공개", () => {
    const p = buildRevealPayload(2, results); // phase 1
    const cur = p.entries.find((e) => e.current)!;
    expect(cur.participantShare).not.toBeNull();
    expect(cur.judgeShare).toBeNull();
    expect(cur.label).toBeNull();
  });

  it("5위 팀 공개 단계에서 팀명 노출", () => {
    const p = buildRevealPayload(5, results); // phase 4
    const cur = p.entries.find((e) => e.current)!;
    expect(cur.label).not.toBeNull();
    expect(cur.finalScore).not.toBeNull();
  });

  it("전체 순위표 step 은 11팀 모두 반환", () => {
    const p = buildRevealPayload(TOTAL_REVEAL_STEPS, results);
    expect(p.fullStandings).toHaveLength(11);
  });
});
