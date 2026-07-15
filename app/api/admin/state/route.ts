import { NextRequest, NextResponse } from "next/server";
import { checkAdmin, getJudgeCodes } from "@/lib/auth";
import { getFullState } from "@/lib/server";
import { PARTICIPANTS } from "@/lib/roster";
import { TOTAL_REVEAL_STEPS } from "@/lib/reveal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdmin(req.headers.get("x-admin-password"))) {
    return NextResponse.json({ ok: false, reason: "인증 실패" }, { status: 401 });
  }
  const state = await getFullState();
  return NextResponse.json({
    ok: true,
    settings: state.settings,
    results: state.results,
    counts: state.counts,
    totalParticipants: PARTICIPANTS.length,
    judgeCodes: getJudgeCodes(),
    totalRevealSteps: TOTAL_REVEAL_STEPS,
  });
}
