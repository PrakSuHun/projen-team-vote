import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./store";
import type { Settings, ParticipantVote, JudgeVote } from "./types";
import { DEFAULT_SETTINGS, mergeSettings } from "./config";

/**
 * Supabase(Postgres) 저장소 — 실제 행사 배포용.
 * 필요한 테이블은 supabase/schema.sql 참고.
 */
export class SupabaseStore implements Store {
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.client
      .from("settings")
      .select("data")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await this.setSettings(DEFAULT_SETTINGS);
      return structuredClone(DEFAULT_SETTINGS);
    }
    // 예전 형식으로 저장된 설정에도 새 기본값 필드를 채워서 반환
    return mergeSettings(data.data as Partial<Settings>);
  }

  async setSettings(settings: Settings): Promise<Settings> {
    const { error } = await this.client
      .from("settings")
      .upsert({ id: 1, data: settings });
    if (error) throw error;
    return settings;
  }

  async listParticipantVotes(): Promise<ParticipantVote[]> {
    const { data, error } = await this.client
      .from("participant_votes")
      .select("participant_id, ranks, created_at");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      participantId: r.participant_id as string,
      ranks: r.ranks as number[],
      createdAt: r.created_at as string,
    }));
  }

  async getParticipantVote(participantId: string): Promise<ParticipantVote | null> {
    const { data, error } = await this.client
      .from("participant_votes")
      .select("participant_id, ranks, created_at")
      .eq("participant_id", participantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      participantId: data.participant_id as string,
      ranks: data.ranks as number[],
      createdAt: data.created_at as string,
    };
  }

  async addParticipantVote(vote: ParticipantVote): Promise<boolean> {
    const { error } = await this.client.from("participant_votes").insert({
      participant_id: vote.participantId,
      ranks: vote.ranks,
      created_at: vote.createdAt,
    });
    if (error) {
      if (error.code === "23505") return false; // unique 위반 = 이미 투표
      throw error;
    }
    return true;
  }

  async listJudgeVotes(): Promise<JudgeVote[]> {
    const { data, error } = await this.client
      .from("judge_votes")
      .select("judge_id, ranking, created_at");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      judgeId: r.judge_id as string,
      ranking: r.ranking as number[],
      createdAt: r.created_at as string,
    }));
  }

  async getJudgeVote(judgeId: string): Promise<JudgeVote | null> {
    const { data, error } = await this.client
      .from("judge_votes")
      .select("judge_id, ranking, created_at")
      .eq("judge_id", judgeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      judgeId: data.judge_id as string,
      ranking: data.ranking as number[],
      createdAt: data.created_at as string,
    };
  }

  async addJudgeVote(vote: JudgeVote): Promise<boolean> {
    const { error } = await this.client.from("judge_votes").insert({
      judge_id: vote.judgeId,
      ranking: vote.ranking,
      created_at: vote.createdAt,
    });
    if (error) {
      if (error.code === "23505") return false;
      throw error;
    }
    return true;
  }

  async resetVotes(): Promise<void> {
    const a = await this.client.from("participant_votes").delete().neq("participant_id", "");
    if (a.error) throw a.error;
    const b = await this.client.from("judge_votes").delete().neq("judge_id", "");
    if (b.error) throw b.error;
  }
}
