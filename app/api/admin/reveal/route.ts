import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { TOTAL_REVEAL_STEPS } from "@/lib/reveal";

export const dynamic = "force-dynamic";

// step 을 직접 지정하거나 delta(+1/-1)로 이동
export async function POST(req: NextRequest) {
  if (!checkAdmin(req.headers.get("x-admin-password"))) {
    return NextResponse.json({ ok: false, reason: "인증 실패" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { step?: number; delta?: number };
  const store = getStore();
  const current = await store.getSettings();

  let step = current.revealStep;
  if (typeof body.step === "number") step = body.step;
  else if (typeof body.delta === "number") step = current.revealStep + body.delta;

  step = Math.max(0, Math.min(step, TOTAL_REVEAL_STEPS));
  const saved = await store.setSettings({ ...current, revealStep: step });
  return NextResponse.json({ ok: true, revealStep: saved.revealStep });
}
