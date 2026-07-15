import { promises as fs } from "fs";
import path from "path";
import type { Store } from "./store";
import type { Settings, ParticipantVote, JudgeVote } from "./types";
import { DEFAULT_SETTINGS, mergeSettings } from "./config";

type Data = {
  settings: Settings;
  participantVotes: ParticipantVote[];
  judgeVotes: JudgeVote[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

/**
 * 로컬 파일 기반 저장소 — Supabase 미설정 시 개발/테스트용.
 * 서버리스(Vercel)에서는 인스턴스마다 파일이 분리되므로 실제 행사에는 Supabase 사용.
 */
export class FileStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();

  private async read(): Promise<Data> {
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<Data>;
      return {
        // 예전 형식으로 저장된 설정에도 새 기본값 필드를 채워서 반환
        settings: mergeSettings(parsed.settings),
        participantVotes: parsed.participantVotes ?? [],
        judgeVotes: parsed.judgeVotes ?? [],
      };
    } catch {
      return {
        settings: structuredClone(DEFAULT_SETTINGS),
        participantVotes: [],
        judgeVotes: [],
      };
    }
  }

  private async write(data: Data): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  // 쓰기 작업을 직렬화(같은 인스턴스 내 경합 방지)
  private serialize<T>(fn: (data: Data) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      return fn(data);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async getSettings(): Promise<Settings> {
    return (await this.read()).settings;
  }

  async setSettings(settings: Settings): Promise<Settings> {
    return this.serialize(async (data) => {
      data.settings = settings;
      await this.write(data);
      return settings;
    });
  }

  async listParticipantVotes(): Promise<ParticipantVote[]> {
    return (await this.read()).participantVotes;
  }

  async getParticipantVote(participantId: string): Promise<ParticipantVote | null> {
    const votes = (await this.read()).participantVotes;
    return votes.find((v) => v.participantId === participantId) ?? null;
  }

  async addParticipantVote(vote: ParticipantVote): Promise<boolean> {
    return this.serialize(async (data) => {
      if (data.participantVotes.some((v) => v.participantId === vote.participantId)) {
        return false;
      }
      data.participantVotes.push(vote);
      await this.write(data);
      return true;
    });
  }

  async listJudgeVotes(): Promise<JudgeVote[]> {
    return (await this.read()).judgeVotes;
  }

  async getJudgeVote(judgeId: string): Promise<JudgeVote | null> {
    const votes = (await this.read()).judgeVotes;
    return votes.find((v) => v.judgeId === judgeId) ?? null;
  }

  async addJudgeVote(vote: JudgeVote): Promise<boolean> {
    return this.serialize(async (data) => {
      if (data.judgeVotes.some((v) => v.judgeId === vote.judgeId)) {
        return false;
      }
      data.judgeVotes.push(vote);
      await this.write(data);
      return true;
    });
  }

  async resetVotes(): Promise<void> {
    return this.serialize(async (data) => {
      data.participantVotes = [];
      data.judgeVotes = [];
      await this.write(data);
    });
  }
}
