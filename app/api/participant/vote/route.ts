import { NextRequest, NextResponse } from "next/server";
import { PARTICIPANTS } from "@/lib/roster";
import { TEAMS } from "@/lib/roster";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    participantId?: string;
    ranks?: number[];
  };
  const participant = PARTICIPANTS.find((p) => p.id === body.participantId);
  if (!participant) {
    return NextResponse.json({ ok: false, reason: "참가자 인증이 필요합니다." }, { status: 401 });
  }

  const ranks = body.ranks;
  if (!Array.isArray(ranks) || ranks.length !== 3) {
    return NextResponse.json({ ok: false, reason: "1·2·3위를 모두 선택해 주세요." }, { status: 400 });
  }
  if (!ranks.every((id) => VALID_TEAM_IDS.has(id))) {
    return NextResponse.json({ ok: false, reason: "잘못된 팀 선택입니다." }, { status: 400 });
  }
  if (new Set(ranks).size !== 3) {
    return NextResponse.json({ ok: false, reason: "서로 다른 팀을 선택해 주세요." }, { status: 400 });
  }
  if (ranks.includes(participant.teamId)) {
    return NextResponse.json({ ok: false, reason: "본인 팀에는 투표할 수 없습니다." }, { status: 400 });
  }

  const store = getStore();
  const settings = await store.getSettings();
  if (!settings.participantVotingOpen) {
    return NextResponse.json({ ok: false, reason: "지금은 투표 시간이 아닙니다." }, { status: 403 });
  }

  const saved = await store.addParticipantVote({
    participantId: participant.id,
    ranks,
    createdAt: new Date().toISOString(),
  });
  if (!saved) {
    return NextResponse.json({ ok: false, reason: "이미 투표를 완료했습니다." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
