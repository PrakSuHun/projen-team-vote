import { NextRequest, NextResponse } from "next/server";
import { validJudgeCode } from "@/lib/auth";
import { TEAMS } from "@/lib/roster";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const ALL_TEAM_IDS = TEAMS.map((t) => t.id);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    ranking?: number[];
  };
  const judgeId = validJudgeCode(body.code);
  if (!judgeId) {
    return NextResponse.json({ ok: false, reason: "심사위원 인증이 필요합니다." }, { status: 401 });
  }

  const ranking = body.ranking;
  // 11팀 전체의 순열(1등~11등)인지 검증
  if (
    !Array.isArray(ranking) ||
    ranking.length !== ALL_TEAM_IDS.length ||
    new Set(ranking).size !== ALL_TEAM_IDS.length ||
    !ranking.every((id) => ALL_TEAM_IDS.includes(id))
  ) {
    return NextResponse.json(
      { ok: false, reason: "11개 팀 전체의 순위를 빠짐없이 매겨 주세요." },
      { status: 400 },
    );
  }

  const store = getStore();
  const settings = await store.getSettings();
  if (!settings.judgeVotingOpen) {
    return NextResponse.json({ ok: false, reason: "지금은 심사 시간이 아닙니다." }, { status: 403 });
  }

  const saved = await store.addJudgeVote({
    judgeId,
    ranking,
    createdAt: new Date().toISOString(),
  });
  if (!saved) {
    return NextResponse.json({ ok: false, reason: "이미 심사를 완료했습니다." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
