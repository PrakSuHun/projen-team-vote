"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "framer-motion";
import confetti from "canvas-confetti";

type Team = { id: number; label: string };

type Phase = "loading" | "invalid" | "closed" | "rank" | "done" | "loadError";

type VerifyResponse =
  | {
      ok: true;
      judgeId: string;
      alreadyVoted: boolean;
      votingOpen: boolean;
      previousRanking: number[] | null;
    }
  | { ok: false; reason: string };

type VoteResponse = { ok: true } | { ok: false; reason: string };

const TOTAL = 11;

function badgeColor(rankIndex: number): string {
  if (rankIndex === 0) return "#f59e0b"; // 금
  if (rankIndex === 1) return "#6366f1"; // 은(인디고)
  if (rankIndex === 2) return "#8b5cf6"; // 동(바이올렛)
  return "#a1a1aa";
}

export default function JudgeClient({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [teams, setTeams] = useState<Team[]>([]);
  // order[0] = 1등 팀id … order[10] = 11등 팀id (항상 11팀 전부 포함)
  const [order, setOrder] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  // 완료 화면에 보여줄 최종 순위 (이번 제출 또는 previousRanking)
  const [finalRanking, setFinalRanking] = useState<number[] | null>(null);
  const [votedNow, setVotedNow] = useState(false);

  const initialize = useCallback(async () => {
    if (!code) {
      setPhase("invalid");
      return;
    }
    setPhase("loading");
    try {
      const [verifyRes, teamsRes] = await Promise.all([
        fetch("/api/judge/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
        fetch("/api/teams"),
      ]);
      const verify = (await verifyRes.json().catch(() => null)) as VerifyResponse | null;
      if (!verify || !verify.ok) {
        setPhase("invalid");
        return;
      }
      if (!teamsRes.ok) {
        setPhase("loadError");
        return;
      }
      const teamsData = (await teamsRes.json()) as { teams: Team[] };
      const sorted = [...teamsData.teams].sort((a, b) => a.id - b.id);
      setTeams(sorted);
      if (verify.alreadyVoted) {
        setVotedNow(false);
        setFinalRanking(verify.previousRanking);
        setPhase("done");
        return;
      }
      if (!verify.votingOpen) {
        setClosedMessage(null);
        setPhase("closed");
        return;
      }
      // 처음엔 팀 번호 순으로 나열 — 위치가 곧 등수. 재시도 시 기존 조정 상태 유지.
      setOrder((prev) =>
        prev.length === TOTAL ? prev : sorted.map((t) => t.id),
      );
      setPhase("rank");
    } catch {
      setPhase("loadError");
    }
  }, [code]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const labelOf = useCallback(
    (teamId: number) => teams.find((t) => t.id === teamId)?.label ?? `${teamId}팀`,
    [teams],
  );

  const baseOrder = useMemo(() => teams.map((t) => t.id), [teams]);

  const move = useCallback((index: number, delta: number) => {
    setSubmitError(null);
    setOrder((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  function handleReset() {
    if (!window.confirm("순위를 처음 상태(팀 번호 순)로 되돌릴까요?")) return;
    setSubmitError(null);
    setOrder(baseOrder);
  }

  async function handleSubmit() {
    if (order.length !== TOTAL || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/judge/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ranking: order }),
      });
      const data = (await res.json().catch(() => null)) as VoteResponse | null;
      if (res.ok && data?.ok) {
        setVotedNow(true);
        setFinalRanking([...order]);
        setPhase("done");
        return;
      }
      if (res.status === 409) {
        setVotedNow(false);
        setFinalRanking(null);
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

  return (
    <div className="flex-1 w-full bg-[#f5f6f8] text-zinc-900">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-8">
        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.section
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-4 pb-16"
            >
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
              <p className="text-sm font-medium text-zinc-500">
                심사위원 정보를 확인하는 중…
              </p>
            </motion.section>
          )}

          {phase === "invalid" && (
            <motion.section
              key="invalid"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center pb-16 text-center"
            >
              <div className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-zinc-200/70">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl">
                  🔒
                </div>
                <h2 className="mt-5 text-2xl font-extrabold">
                  유효하지 않은 접속 링크예요
                </h2>
                <p className="mt-3 leading-relaxed text-zinc-500">
                  운영진에게 전달받은 심사위원 전용 링크로
                  <br />
                  다시 접속해 주세요.
                </p>
              </div>
            </motion.section>
          )}

          {phase === "loadError" && (
            <motion.section
              key="loadError"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center pb-16 text-center"
            >
              <div className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-zinc-200/70">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 text-3xl">
                  📡
                </div>
                <h2 className="mt-5 text-xl font-extrabold">
                  불러오는 데 실패했어요
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  네트워크 상태를 확인하고 다시 시도해 주세요.
                </p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void initialize()}
                  className="mt-5 h-12 w-full rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] font-bold text-white shadow-lg shadow-violet-300/50"
                >
                  다시 시도
                </motion.button>
              </div>
            </motion.section>
          )}

          {phase === "closed" && (
            <motion.section
              key="closed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center pb-16 text-center"
            >
              <div className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-violet-100">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-3xl">
                  ⏰
                </div>
                <h2 className="mt-5 text-2xl font-extrabold">
                  지금은 심사 시간이 아니에요
                </h2>
                <p className="mt-3 leading-relaxed text-zinc-500">
                  {closedMessage ??
                    "아직 심사가 열리지 않았거나 이미 마감되었어요. 진행자의 안내에 따라 다시 접속해 주세요."}
                </p>
              </div>
            </motion.section>
          )}

          {phase === "rank" && (
            <motion.section
              key="rank"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col"
            >
              <header className="rounded-3xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] p-6 text-white shadow-xl shadow-violet-300/40">
                <p className="text-xs font-bold tracking-widest text-violet-200">
                  JUDGE MODE
                </p>
                <h1 className="mt-1.5 text-xl font-extrabold leading-snug">
                  심사위원 팀 순위 평가
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-violet-200">
                  맨 위가 1등, 맨 아래가 11등이에요.{" "}
                  <b className="font-extrabold text-white">▲ ▼ 버튼</b>을
                  누르거나 오른쪽{" "}
                  <b className="font-extrabold text-white">손잡이(⠿)를 잡고
                  드래그</b>해서 몇 번이든 자유롭게 조정한 뒤 제출해 주세요.
                </p>
              </header>

              {/* 순위 리스트 — 항상 11팀 전부 랭크된 상태 */}
              <Reorder.Group
                as="ol"
                axis="y"
                values={order}
                onReorder={(next: number[]) => {
                  setSubmitError(null);
                  setOrder(next);
                }}
                className="mt-4 space-y-2"
              >
                {order.map((teamId, index) => (
                  <RankRow
                    key={teamId}
                    teamId={teamId}
                    index={index}
                    total={order.length}
                    label={labelOf(teamId)}
                    onMove={move}
                  />
                ))}
              </Reorder.Group>

              <button
                type="button"
                onClick={handleReset}
                className="mt-3 h-11 w-full rounded-2xl border border-zinc-200 bg-white text-sm font-bold text-zinc-500 shadow-sm transition active:bg-zinc-50"
              >
                ↺ 처음부터 다시 (팀 번호 순)
              </button>

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
                  whileTap={!submitting ? { scale: 0.97 } : undefined}
                  disabled={order.length !== TOTAL || submitting}
                  onClick={handleSubmit}
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-lg font-bold text-white shadow-lg shadow-violet-400/40 transition disabled:from-zinc-300 disabled:to-zinc-300 disabled:text-zinc-500 disabled:shadow-none"
                >
                  {submitting ? "제출 중…" : "이 순위로 제출하기"}
                </motion.button>
                <p className="mt-2 text-center text-[11px] text-zinc-400">
                  제출 후에는 순위를 수정할 수 없어요
                </p>
              </div>
            </motion.section>
          )}

          {phase === "done" && (
            <DoneScreen
              key="done"
              votedNow={votedNow}
              ranking={finalRanking}
              labelOf={labelOf}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function RankRow({
  teamId,
  index,
  total,
  label,
  onMove,
}: {
  teamId: number;
  index: number;
  total: number;
  label: string;
  onMove: (index: number, delta: number) => void;
}) {
  const dragControls = useDragControls();
  const top3 = index < 3;

  return (
    <Reorder.Item
      value={teamId}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{
        scale: 1.03,
        boxShadow: "0 14px 32px rgba(76, 29, 149, 0.22)",
        zIndex: 20,
      }}
      className={`relative flex items-center gap-2 rounded-2xl bg-white py-2 pl-3 pr-1 shadow-sm ${
        top3 ? "ring-1 ring-violet-100" : ""
      }`}
    >
      {/* 등수 배지 (1~3등 금/은/동 포인트) */}
      <span
        className="flex h-8 w-11 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white shadow-sm"
        style={{ backgroundColor: badgeColor(index) }}
      >
        {index + 1}등
      </span>

      {/* 팀 라벨 */}
      <span
        className={`min-w-0 flex-1 truncate text-sm font-bold ${
          top3 ? "text-violet-900" : "text-zinc-800"
        }`}
      >
        {label}
      </span>

      {/* ▲ ▼ 이동 버튼 — 확실하게 동작하는 기본 조작 */}
      <motion.button
        type="button"
        whileTap={index > 0 ? { scale: 0.85 } : undefined}
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
        aria-label={`${label} 한 칸 위로`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-sm font-extrabold text-violet-600 transition active:bg-violet-100 disabled:bg-zinc-50 disabled:text-zinc-300"
      >
        ▲
      </motion.button>
      <motion.button
        type="button"
        whileTap={index < total - 1 ? { scale: 0.85 } : undefined}
        onClick={() => onMove(index, 1)}
        disabled={index === total - 1}
        aria-label={`${label} 한 칸 아래로`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-sm font-extrabold text-violet-600 transition active:bg-violet-100 disabled:bg-zinc-50 disabled:text-zinc-300"
      >
        ▼
      </motion.button>

      {/* 드래그 손잡이 — 손잡이에서만 드래그가 시작되어 화면 스크롤과 충돌하지 않음 */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          dragControls.start(e);
        }}
        role="button"
        aria-label={`${label} 드래그로 순위 이동`}
        className="flex h-11 w-9 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-xl text-lg font-bold text-zinc-300 transition active:cursor-grabbing active:text-violet-500"
      >
        ⠿
      </div>
    </Reorder.Item>
  );
}

function DoneScreen({
  votedNow,
  ranking,
  labelOf,
}: {
  votedNow: boolean;
  ranking: number[] | null;
  labelOf: (teamId: number) => string;
}) {
  useEffect(() => {
    if (!votedNow) return;
    const timer = window.setTimeout(() => {
      void confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.6 },
        colors: ["#7c3aed", "#4f46e5", "#a78bfa", "#f59e0b"],
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [votedNow]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-1 flex-col justify-center py-10 text-center"
    >
      <div className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-violet-100">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-4xl shadow-lg shadow-violet-300/50"
        >
          {votedNow ? "🎉" : "✅"}
        </motion.div>
        <h2 className="mt-6 text-2xl font-extrabold">
          {votedNow ? "심사 완료! 감사합니다." : "이미 심사를 완료하셨어요"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          {votedNow
            ? "제출해 주신 순위는 최종 집계에 반영돼요."
            : "제출된 심사 결과는 아래와 같아요."}
        </p>

        {ranking && ranking.length > 0 && (
          <div className="mt-6 rounded-2xl bg-violet-50/70 p-4 text-left">
            <p className="mb-3 text-xs font-bold tracking-wide text-violet-400">
              최종 순위
            </p>
            <ol className="space-y-1.5">
              {ranking.map((teamId, i) => (
                <motion.li
                  key={teamId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <span
                    className="flex h-6 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                    style={{ backgroundColor: badgeColor(i) }}
                  >
                    {i + 1}등
                  </span>
                  <span className="truncate text-sm font-bold text-zinc-800">
                    {labelOf(teamId)}
                  </span>
                </motion.li>
              ))}
            </ol>
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-400">
          결과 발표까지 조금만 기다려 주세요!
        </p>
      </div>
    </motion.section>
  );
}
