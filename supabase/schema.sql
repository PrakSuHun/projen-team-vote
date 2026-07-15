-- 프로젠 팀 투표 — Supabase(Postgres) 스키마
-- Supabase 프로젝트 > SQL Editor 에 붙여넣고 실행하세요.
-- 서버는 service_role 키로 접근하므로 RLS 정책 없이도 동작합니다(익명 접근은 차단).

-- 설정(싱글턴): id=1 한 줄에 전체 설정을 jsonb 로 저장
create table if not exists public.settings (
  id int primary key,
  data jsonb not null
);

-- 참가자 표: 한 사람당 한 줄(참가자 id 유니크 = 중복 투표 방지)
create table if not exists public.participant_votes (
  participant_id text primary key,
  ranks integer[] not null,          -- [1위 팀id, 2위 팀id, 3위 팀id]
  created_at timestamptz not null default now()
);

-- 심사위원 표: 심사위원 코드당 한 줄
create table if not exists public.judge_votes (
  judge_id text primary key,
  ranking integer[] not null,        -- 1등~11등 순서의 팀id 배열(길이 11)
  created_at timestamptz not null default now()
);

-- RLS 켜기(익명/공개 키로는 접근 불가). 서버의 service_role 키는 RLS 를 우회합니다.
alter table public.settings enable row level security;
alter table public.participant_votes enable row level security;
alter table public.judge_votes enable row level security;

-- 기본 설정 한 줄(없으면 서버가 자동 생성하지만, 미리 넣어둬도 됨)
insert into public.settings (id, data)
values (1, '{
  "participantVotingOpen": true,
  "judgeVotingOpen": true,
  "revealStep": 0,
  "config": {
    "participantMaxPoints": 50,
    "participantMinPoints": 20,
    "judgeMaxPoints": 50,
    "judgeMinPoints": 35,
    "participantRankPoints": [1, 1, 1],
    "eligibilityCorrection": true
  }
}'::jsonb)
on conflict (id) do nothing;
