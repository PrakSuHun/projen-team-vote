import type { Settings, ParticipantVote, JudgeVote } from "./types";
import { DEFAULT_SETTINGS } from "./config";
import { FileStore } from "./store-file";
import { SupabaseStore } from "./store-supabase";
import { RedisStore } from "./store-redis";

export interface Store {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<Settings>;

  listParticipantVotes(): Promise<ParticipantVote[]>;
  getParticipantVote(participantId: string): Promise<ParticipantVote | null>;
  /** 이미 투표했으면 false, 저장하면 true */
  addParticipantVote(vote: ParticipantVote): Promise<boolean>;

  listJudgeVotes(): Promise<JudgeVote[]>;
  getJudgeVote(judgeId: string): Promise<JudgeVote | null>;
  addJudgeVote(vote: JudgeVote): Promise<boolean>;

  /** 표만 초기화(설정 유지) */
  resetVotes(): Promise<void>;
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;

  // 1순위: Upstash Redis (Vercel 배포 권장 — 설정 간단, SQL 불필요)
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    cached = new RedisStore(redisUrl, redisToken);
    return cached;
  }

  // 2순위: Supabase
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    cached = new SupabaseStore(url, key);
    return cached;
  }

  // 그 외: 로컬 파일 저장소(개발/리허설용)
  cached = new FileStore();
  return cached;
}

export { DEFAULT_SETTINGS };
