import { NextRequest, NextResponse } from "next/server";
import { findParticipantByName, teamLabel } from "@/lib/roster";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name || !name.trim()) {
    return NextResponse.json({ ok: false, reason: "이름을 입력해 주세요." }, { status: 400 });
  }
  const participant = findParticipantByName(name);
  if (!participant) {
    return NextResponse.json(
      { ok: false, reason: "명단에서 이름을 찾을 수 없어요. 오타가 없는지 확인해 주세요." },
      { status: 404 },
    );
  }

  const store = getStore();
  const [settings, existing] = await Promise.all([
    store.getSettings(),
    store.getParticipantVote(participant.id),
  ]);

  return NextResponse.json({
    ok: true,
    participantId: participant.id,
    name: participant.name,
    teamId: participant.teamId,
    teamLabel: teamLabel(participant.teamId),
    alreadyVoted: !!existing,
    votingOpen: settings.participantVotingOpen,
  });
}
