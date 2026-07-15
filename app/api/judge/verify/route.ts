import { NextRequest, NextResponse } from "next/server";
import { validJudgeCode } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const judgeId = validJudgeCode(code);
  if (!judgeId) {
    return NextResponse.json({ ok: false, reason: "유효하지 않은 심사위원 코드입니다." }, { status: 403 });
  }
  const store = getStore();
  const [settings, existing] = await Promise.all([
    store.getSettings(),
    store.getJudgeVote(judgeId),
  ]);
  return NextResponse.json({
    ok: true,
    judgeId,
    alreadyVoted: !!existing,
    votingOpen: settings.judgeVotingOpen,
    previousRanking: existing?.ranking ?? null,
  });
}
