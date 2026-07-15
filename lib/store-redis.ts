import { Redis } from "@upstash/redis";
import type { Store } from "./store";
import type { Settings, ParticipantVote, JudgeVote } from "./types";
import { DEFAULT_SETTINGS, mergeSettings } from "./config";

const K_SETTINGS = "settings";
const K_PVOTES = "participant_votes"; // hash: field=participantId, value=ParticipantVote
const K_JVOTES = "judge_votes"; // hash: field=judgeId, value=JudgeVote

/**
 * Upstash Redis 저장소 — Vercel 배포용(설정 간단, SQL 불필요).
 * 환경변수 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 로 자동 연결.
 * (Vercel > Storage 에서 Upstash 연결 시 자동 주입)
 *
 * 중복 투표 방지는 Redis HSETNX(원자적)로 처리 — 동시 제출도 안전.
 * @upstash/redis 는 값을 JSON 으로 자동 직렬화/역직렬화한다.
 */
export class RedisStore implements Store {
  private redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async getSettings(): Promise<Settings> {
    const data = await this.redis.get<Partial<Settings>>(K_SETTINGS);
    if (!data) {
      await this.setSettings(DEFAULT_SETTINGS);
      return structuredClone(DEFAULT_SETTINGS);
    }
    return mergeSettings(data);
  }

  async setSettings(settings: Settings): Promise<Settings> {
    await this.redis.set(K_SETTINGS, settings);
    return settings;
  }

  async listParticipantVotes(): Promise<ParticipantVote[]> {
    const all = await this.redis.hgetall<Record<string, ParticipantVote>>(K_PVOTES);
    return all ? Object.values(all) : [];
  }

  async getParticipantVote(participantId: string): Promise<ParticipantVote | null> {
    return (await this.redis.hget<ParticipantVote>(K_PVOTES, participantId)) ?? null;
  }

  async addParticipantVote(vote: ParticipantVote): Promise<boolean> {
    // HSETNX: 이미 있으면 0(=이미 투표), 새로 저장하면 1
    const set = await this.redis.hsetnx(K_PVOTES, vote.participantId, vote);
    return set === 1;
  }

  async listJudgeVotes(): Promise<JudgeVote[]> {
    const all = await this.redis.hgetall<Record<string, JudgeVote>>(K_JVOTES);
    return all ? Object.values(all) : [];
  }

  async getJudgeVote(judgeId: string): Promise<JudgeVote | null> {
    return (await this.redis.hget<JudgeVote>(K_JVOTES, judgeId)) ?? null;
  }

  async addJudgeVote(vote: JudgeVote): Promise<boolean> {
    const set = await this.redis.hsetnx(K_JVOTES, vote.judgeId, vote);
    return set === 1;
  }

  async resetVotes(): Promise<void> {
    await this.redis.del(K_PVOTES, K_JVOTES);
  }
}
