import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!checkAdmin(req.headers.get("x-admin-password"))) {
    return NextResponse.json({ ok: false, reason: "인증 실패" }, { status: 401 });
  }
  const store = getStore();
  await store.resetVotes();
  const current = await store.getSettings();
  await store.setSettings({ ...current, revealStep: 0 });
  return NextResponse.json({ ok: true });
}
