import { getStore } from "./store";
import { computeResults } from "./scoring";
import type { Settings, TeamResult } from "./types";

// 저장소에서 표/설정을 읽어 집계 결과까지 계산
export async function getFullState(): Promise<{
  settings: Settings;
  results: TeamResult[];
  counts: { participants: number; judges: number };
}> {
  const store = getStore();
  const [settings, pv, jv] = await Promise.all([
    store.getSettings(),
    store.listParticipantVotes(),
    store.listJudgeVotes(),
  ]);
  return {
    settings,
    results: computeResults(pv, jv, settings.config),
    counts: { participants: pv.length, judges: jv.length },
  };
}
