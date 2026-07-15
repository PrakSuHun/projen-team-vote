import { NextResponse } from "next/server";
import { getFullState } from "@/lib/server";
import { buildRevealPayload } from "@/lib/reveal";

export const dynamic = "force-dynamic";

// 공개용: 현재 발표 step 에 맞게 게이팅된 결과만 반환(미공개 순위/점수 노출 안 함)
export async function GET() {
  const { settings, results } = await getFullState();
  const payload = buildRevealPayload(settings.revealStep, results);
  return NextResponse.json(payload);
}
