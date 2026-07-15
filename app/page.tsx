"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";

type Team = { id: number; label: string };

type Me = {
  participantId: string;
  name: string;
  teamId: number;
  teamLabel: string;
};

type Phase = "name" | "vote" | "closed" | "done";

type VerifyResponse =
  | {
      ok: true;
      participantId: string;
      name: string;
      teamId: number;
      teamLabel: string;
      alreadyVoted: boolean;
      votingOpen: boolean;
    }
  | { ok: false; reason: string };

type VoteResponse = { ok: true } | { ok: false; reason: string };

const MAX_PICKS = 3;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("name");
  const [me, setMe] = useState<Me | null>(null);

  // name step
  const [nameInput, setNameInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // teams
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamsError, setTeamsError] = useState(false);

  // vote step — 순서 무관, 3팀 동점 선택
  const [picks, setPicks] = useState<number[]>([]);
  const [limitHint, setLimitHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // done step
  const [votedNow, setVotedNow] = useState(false);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    setTeamsError(false);
    try {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { teams: Team[] };
      setTeams(data.teams);
    } catch {
      setTeamsError(true);
    }
  }, []);

  useEffect(() => {
    if (phase === "vote" && teams === null && !teamsError) {
      void loadTeams();
    }
  }, [phase, teams, teamsError, loadTeams]);

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed || verifying) return;
    setVerifying(true);
    setNameError(null);
    try {
      const res = await fetch("/api/participant/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as VerifyResponse | null;
      if (!data || !data.ok) {
        setNameError(data?.reason ?? "확인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setMe({
        participantId: data.participantId,
        name: data.name,
        teamId: data.teamId,
        teamLabel: data.teamLabel,
      });
      if (data.alreadyVoted) {
        setVotedNow(false);
        setPhase("done");
        return;
      }
      if (!data.votingOpen) {
        setClosedMessage(null);
        setPhase("closed");
        return;
      }
      setPhase("vote");
    } catch {
      setNameError("네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setVerifying(false);
    }
  }

  function toggleTeam(teamId: number) {
    setSubmitError(null);
    if (picks.includes(teamId)) {
      setLimitHint(false);
      setPicks(picks.filter((id) => id !== teamId));
      return;
    }
    if (picks.length >= MAX_PICKS) {
      // 이미 3팀 선택됨 — 안내만 표시
      setLimitHint(true);
      return;
    }
    setLimitHint(false);
    setPicks([...picks, teamId]);
  }

  useEffect(() => {
    if (!limitHint) return;
    const timer = window.setTimeout(() => setLimitHint(false), 2200);
    return () => window.clearTimeout(timer);
  }, [limitHint]);

  async function handleSubmit() {
    if (!me || picks.length !== MAX_PICKS || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/participant/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: me.participantId, ranks: picks }),
      });
      const data = (await res.json().catch(() => null)) as VoteResponse | null;
      if (res.ok && data?.ok) {
        setVotedNow(true);
        setPhase("done");
        return;
      }
      if (res.status === 409) {
        // 이미 투표 완료
        setVotedNow(false);
        setPhase("done");
        return;
      }
      if (res.status === 403) {
        setClosedMessage(data && !data.ok ? data.reason : null);
        setPhase("closed");
        return;
      }
      setSubmitError(
        data && !data.ok && data.reason
          ? data.reason
          : "제출에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
    } catch {
      setSubmitError("네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const labelOf = useCallback(
    (teamId: number) => teams?.find((t) => t.id === teamId)?.label ?? `${teamId}팀`,
    [teams],
  );

  const selectableTeams = useMemo(
    () => (teams ?? []).filter((t) => t.id !== me?.teamId),
    [teams, me],
  );

  return (
    <div className="flex-1 w-full bg-[#f5f6f8] text-zinc-900">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-10">
        <AnimatePresence mode="wait">
          {phase === "name" && (
            <motion.section
              key="name"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col justify-center pb-16"
            >
              <div className="mb-8 text-center">
                <span className="inline-block rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] px-4 py-1.5 text-xs font-bold tracking-widest text-white shadow-md">
                  PROGEN TEAM VOTE
                </span>
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight">
                  프로젠{" "}
                  <span className="bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] bg-clip-text text-transparent">
                    팀 투표
                  </span>
                </h1>
                <p className="mt-3 text-base leading-relaxed text-zinc-500">
                  본인 이름을 입력하면 투표가 시작돼요
                </p>
              </div>

              <form
                onSubmit={handleVerify}
                className="rounded-3xl bg-white p-6 shadow-xl shadow-violet-100"
              >
                <label
                  htmlFor="participant-name"
                  className="mb-2 block text-sm font-semibold text-zinc-700"
                >
                  이름
                </label>
                <input
                  id="participant-name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="예) 홍길동"
                  autoComplete="off"
                  enterKeyHint="go"
                  className="h-14 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-lg font-medium outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-200"
                />
                <AnimatePresence>
                  {nameError && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 overflow-hidden text-sm font-medium text-red-500"
                    >
                      {nameError}
                    </motion.p>
                  )}
                </AnimatePresence>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={verifying || !nameInput.trim()}
                  className="mt-5 h-14 w-full rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-lg font-bold text-white shadow-lg shadow-violet-300/50 transition disabled:from-zinc-300 disabled:to-zinc-300 disabled:text-zinc-500 disabled:shadow-none"
                >
                  {verifying ? "확인 중…" : "투표 시작하기"}
                </motion.button>
              </form>

              <p className="mt-6 text-center text-xs text-zinc-400">
                투표는 1인 1회, 제출 후에는 수정할 수 없어요
              </p>
            </motion.section>
          )}

          {phase === "closed" && me && (
            <motion.section
              key="closed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col items-center justify-center pb-16 text-center"
            >
              <div className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-violet-100">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-3xl">
                  ⏰
                </div>
                <h2 className="mt-5 text-2xl font-extrabold">
                  {me.name}님, 반가워요!
                </h2>
                <p className="mt-1 text-sm font-semibold text-violet-600">
                  {me.teamLabel}
                </p>
                <p className="mt-4 leading-relaxed text-zinc-500">
                  {closedMessage ??
                    "지금은 투표 시간이 아니에요. 아직 투표가 열리지 않았거나 이미 마감되었어요."}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  진행자의 안내에 따라 다시 접속해 주세요.
                </p>
              </div>
            </motion.section>
          )}

          {phase === "vote" && me && (
            <motion.section
              key="vote"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col"
            >
              <header className="rounded-3xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] p-6 text-white shadow-xl shadow-violet-300/40">
                <p className="text-sm font-semibold text-violet-100">
                  {me.teamLabel} · {me.name}님
                </p>
                <h1 className="mt-1.5 text-xl font-extrabold leading-snug">
                  가장 좋았던 3팀을
                  <br />
                  선택해 주세요
                </h1>
                <p className="mt-2 text-xs text-violet-200">
                  순서는 상관없어요 — 세 팀 모두 같은 점수예요. 다시 누르면 취소!
                </p>
              </header>

              {/* 현재 선택 요약 */}
              <div className="mt-4 rounded-3xl bg-white p-4 shadow-lg shadow-zinc-200/60">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold tracking-wide text-zinc-400">
                    내가 고른 팀
                  </p>
                  <span
                    className={`text-xs font-extrabold ${
                      picks.length === MAX_PICKS
                        ? "text-violet-600"
                        : "text-zinc-400"
                    }`}
                  >
                    {picks.length}/{MAX_PICKS} 선택됨
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {picks.map((teamId) => (
                    <motion.button
                      key={teamId}
                      type="button"
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleTeam(teamId)}
                      className="flex items-center gap-1.5 rounded-full bg-violet-50 py-2 pl-3 pr-3.5 text-sm font-bold text-violet-800 ring-1 ring-violet-200"
                    >
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#7c3aed] text-[10px] font-extrabold text-white">
                        ✓
                      </span>
                      {labelOf(teamId)}
                    </motion.button>
                  ))}
                  {Array.from({ length: MAX_PICKS - picks.length }, (_, i) => (
                    <span
                      key={`empty-${i}`}
                      className="flex items-center rounded-full border border-dashed border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-300"
                    >
                      미선택
                    </span>
                  ))}
                </div>
                <AnimatePresence>
                  {limitHint && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 overflow-hidden text-xs font-semibold text-amber-600"
                    >
                      3팀까지만 선택할 수 있어요. 다른 팀을 고르려면 먼저 하나를
                      해제해 주세요.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* 팀 목록 */}
              <div className="mt-4 flex-1">
                {teams === null && !teamsError && (
                  <div className="flex flex-col items-center gap-3 rounded-3xl bg-white py-12 shadow-lg shadow-zinc-200/60">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
                    <p className="text-sm font-medium text-zinc-500">
                      팀 목록을 불러오는 중…
                    </p>
                  </div>
                )}
                {teamsError && (
                  <div className="flex flex-col items-center gap-4 rounded-3xl bg-white py-10 shadow-lg shadow-zinc-200/60">
                    <p className="text-sm font-medium text-zinc-600">
                      팀 목록을 불러오지 못했어요.
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setTeams(null);
                        void loadTeams();
                      }}
                      className="h-11 rounded-2xl bg-violet-600 px-6 text-sm font-bold text-white"
                    >
                      다시 시도
                    </motion.button>
                  </div>
                )}
                {teams !== null && (
                  <ul className="space-y-2.5 pb-3">
                    {selectableTeams.map((team, index) => {
                      const selected = picks.includes(team.id);
                      const full = picks.length >= MAX_PICKS && !selected;
                      return (
                        <motion.li
                          key={team.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.25 }}
                        >
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => toggleTeam(team.id)}
                            aria-pressed={selected}
                            className={`flex h-16 w-full items-center justify-between rounded-2xl px-5 text-left shadow-sm transition ${
                              selected
                                ? "bg-violet-50 ring-2 ring-violet-500"
                                : full
                                  ? "bg-white opacity-45"
                                  : "bg-white active:bg-violet-50/60"
                            }`}
                          >
                            <span
                              className={`text-base font-bold ${
                                selected ? "text-violet-900" : "text-zinc-800"
                              }`}
                            >
                              {team.label}
                            </span>
                            {selected ? (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 24,
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#7c3aed] text-base font-extrabold text-white shadow-md"
                              >
                                ✓
                              </motion.span>
                            ) : (
                              <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed text-sm font-bold ${
                                  full
                                    ? "border-zinc-200 text-zinc-300"
                                    : "border-violet-200 text-violet-300"
                                }`}
                              >
                                +
                              </span>
                            )}
                          </motion.button>
                        </motion.li>
                      );
                    })}
                    <li className="pt-1 text-center text-xs text-zinc-400">
                      내 팀 <span className="font-semibold">{me.teamLabel}</span>
                      은 선택할 수 없어요
                    </li>
                  </ul>
                )}
              </div>

              {/* 하단 고정 제출 */}
              <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-[#f5f6f8] via-[#f5f6f8]/95 to-transparent px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-8">
                <AnimatePresence>
                  {submitError && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mb-2 text-center text-sm font-semibold text-red-500"
                    >
                      {submitError}
                    </motion.p>
                  )}
                </AnimatePresence>
                <motion.button
                  type="button"
                  whileTap={
                    picks.length === MAX_PICKS && !submitting
                      ? { scale: 0.97 }
                      : undefined
                  }
                  disabled={picks.length !== MAX_PICKS || submitting}
                  onClick={handleSubmit}
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-lg font-bold text-white shadow-lg shadow-violet-400/40 transition disabled:from-zinc-300 disabled:to-zinc-300 disabled:text-zinc-500 disabled:shadow-none"
                >
                  {submitting
                    ? "제출 중…"
                    : picks.length === MAX_PICKS
                      ? "제출하기"
                      : `제출하기 (${picks.length}/${MAX_PICKS} 선택됨)`}
                </motion.button>
              </div>
            </motion.section>
          )}

          {phase === "done" && me && (
            <DoneScreen
              key="done"
              name={me.name}
              teamLabel={me.teamLabel}
              votedNow={votedNow}
              picks={picks}
              labelOf={labelOf}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function DoneScreen({
  name,
  teamLabel,
  votedNow,
  picks,
  labelOf,
}: {
  name: string;
  teamLabel: string;
  votedNow: boolean;
  picks: number[];
  labelOf: (teamId: number) => string;
}) {
  useEffect(() => {
    if (!votedNow) return;
    const timer = window.setTimeout(() => {
      void confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.65 },
        colors: ["#7c3aed", "#4f46e5", "#a78bfa", "#f59e0b"],
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [votedNow]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="flex flex-1 flex-col items-center justify-center pb-16 text-center"
    >
      <div className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-violet-100">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-4xl shadow-lg shadow-violet-300/50"
        >
          🎉
        </motion.div>
        <h2 className="mt-6 text-2xl font-extrabold">
          {votedNow ? "투표 완료!" : "이미 투표를 완료했어요 🎉"}
        </h2>
        <p className="mt-2 leading-relaxed text-zinc-500">
          {votedNow
            ? "소중한 한 표 감사합니다 🎉"
            : `${name}님의 투표는 이미 접수되었어요.`}
        </p>
        <p className="mt-1 text-sm font-semibold text-violet-600">
          {teamLabel} · {name}님
        </p>

        {votedNow && picks.length === MAX_PICKS && (
          <div className="mt-6 rounded-2xl bg-violet-50/70 p-4 text-left">
            <p className="mb-3 text-xs font-bold tracking-wide text-violet-400">
              내가 뽑은 팀
            </p>
            <div className="flex flex-wrap gap-2">
              {picks.map((teamId, i) => (
                <motion.span
                  key={teamId}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.12 }}
                  className="flex items-center gap-1.5 rounded-full bg-white py-2 pl-3 pr-3.5 text-sm font-bold text-violet-800 ring-1 ring-violet-200"
                >
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#7c3aed] text-[10px] font-extrabold text-white">
                    ✓
                  </span>
                  {labelOf(teamId)}
                </motion.span>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-400">
          결과 발표까지 조금만 기다려 주세요!
        </p>
      </div>
    </motion.section>
  );
}
