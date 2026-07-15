import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { Settings, ScoringConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!checkAdmin(req.headers.get("x-admin-password"))) {
    return NextResponse.json({ ok: false, reason: "인증 실패" }, { status: 401 });
  }
  const patch = (await req.json().catch(() => ({}))) as Partial<Settings> & {
    config?: Partial<ScoringConfig>;
  };

  const store = getStore();
  const current = await store.getSettings();
  const next: Settings = {
    ...current,
    ...("participantVotingOpen" in patch
      ? { participantVotingOpen: !!patch.participantVotingOpen }
      : {}),
    ...("judgeVotingOpen" in patch ? { judgeVotingOpen: !!patch.judgeVotingOpen } : {}),
    ...(typeof patch.revealStep === "number" ? { revealStep: patch.revealStep } : {}),
    config: { ...current.config, ...(patch.config ?? {}) },
  };
  const saved = await store.setSettings(next);
  return NextResponse.json({ ok: true, settings: saved });
}
