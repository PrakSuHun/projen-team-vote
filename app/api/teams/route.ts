import { NextResponse } from "next/server";
import { TEAMS } from "@/lib/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ teams: TEAMS });
}
