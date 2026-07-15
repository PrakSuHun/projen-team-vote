"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import type { ScoringConfig, Settings, TeamResult } from "@/lib/types";

// ───────────────────────── 타입 ─────────────────────────

type AdminState = {
  ok: true;
  settings: Settings;
  results: TeamResult[];
  counts: { participants: number; judges: number };
  totalParticipants: number;
  judgeCodes: string[];
  totalRevealSteps: number;
};

const PW_STORAGE_KEY = "projen-admin-pw";

// ───────────────────────── 발표 단계 설명 ─────────────────────────

const PHASE_LABELS = [
  "두구두구(팀 공개 전)",
  "참가자 점수 공개",
  "심사위원 점수 공개",
  "총점 공개",
  "팀 공개",
] as const;

function describeStep(step: number, totalSteps: number): string {
  if (step <= 0) return "발표 대기 중";
  if (step >= totalSteps) return "전체 순위표";
  const idx = step - 1;
  const rankOrder = Math.floor(idx / 5); // 0=5위 … 4=1위
  const rank = 5 - rankOrder;
  const phase = idx % 5;
  return `${rank}위 — ${PHASE_LABELS[phase]}`;
}

// ───────────────────────── API 헬퍼 ─────────────────────────

class AuthError extends Error {}

async function apiGetState(pw: string): Promise<AdminState> {
  const res = await fetch("/api/admin/state", {
    headers: { "x-admin-password": pw },
    cache: "no-store",
  });
  if (res.status === 401) throw new AuthError("unauthorized");
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.json();
}

async function apiPost(pw: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "x-admin-password": pw,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError("unauthorized");
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

// ───────────────────────── 소형 컴포넌트 ─────────────────────────

function SectionCard({
  title,
  badge,
  children,
  className = "",
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.05)] ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  sublabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
        checked
          ? "border-violet-200 bg-violet-50/60"
          : "border-slate-200 bg-slate-50"
      } ${disabled ? "cursor-wait opacity-60" : "hover:border-violet-300"}`}
    >
      <div>
        <div className="text-base font-semibold text-slate-800">{label}</div>
        <div
          className={`mt-0.5 text-sm font-medium ${
            checked ? "text-violet-600" : "text-slate-400"
          }`}
        >
          {checked ? "열림 · 지금 투표를 받는 중" : "닫힘"}
          {sublabel ? ` · ${sublabel}` : ""}
        </div>
      </div>
      <span
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked
            ? "bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]"
            : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-7" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard 권한이 없으면 fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        copied
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700"
      }`}
    >
      {copied ? "복사됨 ✓" : "복사"}
    </button>
  );
}

function LinkRow({ url, secret }: { url: string; secret?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <code
        className={`min-w-0 flex-1 truncate font-mono text-[13px] ${
          secret ? "text-amber-700" : "text-slate-600"
        }`}
        title={url}
      >
        {url}
      </code>
      <CopyButton text={url} />
    </div>
  );
}

// ───────────────────────── 비밀번호 게이트 ─────────────────────────

function PasswordGate({
  onSuccess,
  autoTrying,
}: {
  onSuccess: (pw: string, state: AdminState) => void;
  autoTrying: boolean;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      const state = await apiGetState(pw);
      onSuccess(pw, state);
    } catch (err) {
      setError(
        err instanceof AuthError
          ? "비밀번호가 틀렸어요"
          : "서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.08)]"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-xl font-black text-white shadow-lg shadow-violet-200">
            P
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            프로젠 운영 콘솔
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {autoTrying
              ? "저장된 비밀번호로 확인 중…"
              : "관리자 비밀번호를 입력하세요"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
          />
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !pw}
            className="w-full rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] py-3 text-base font-bold text-white shadow-lg shadow-violet-200 transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
          >
            {busy ? "확인 중…" : "입장하기"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ───────────────────────── 대시보드 ─────────────────────────

function Dashboard({
  password,
  initialState,
  onLogout,
}: {
  password: string;
  initialState: AdminState;
  onLogout: () => void;
}) {
  const [state, setState] = useState<AdminState>(initialState);
  const [stale, setStale] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [base, setBase] = useState("");

  const pwRef = useRef(password);
  pwRef.current = password;
  const logoutRef = useRef(onLogout);
  logoutRef.current = onLogout;

  // 2초마다 상태 폴링 — 실패 시 마지막 상태 유지 + "연결 재시도 중" 표시
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await apiGetState(pwRef.current);
        if (!alive) return;
        setState(next);
        setStale(false);
      } catch (err) {
        if (!alive) return;
        if (err instanceof AuthError) {
          logoutRef.current();
          return;
        }
        setStale(true);
      }
    };
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // base URL + 참가자 링크 QR 생성
  useEffect(() => {
    setBase(window.location.origin);
  }, []);
  const participantUrl = base ? `${base}/` : "";
  const revealUrl = base ? `${base}/reveal` : "";

  useEffect(() => {
    if (!participantUrl) return;
    let alive = true;
    QRCode.toDataURL(participantUrl, {
      width: 480,
      margin: 1,
      color: { dark: "#1e1b4b", light: "#ffffff" },
    })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [participantUrl]);

  // ── 액션 ──
  const refresh = useCallback(async () => {
    try {
      const next = await apiGetState(pwRef.current);
      setState(next);
      setStale(false);
    } catch (err) {
      if (err instanceof AuthError) logoutRef.current();
      else setStale(true);
    }
  }, []);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusyAction(key);
      try {
        await fn();
        await refresh();
      } catch (err) {
        if (err instanceof AuthError) logoutRef.current();
        else setStale(true);
      } finally {
        setBusyAction(null);
      }
    },
    [refresh]
  );

  const setVoting = (
    key: "participantVotingOpen" | "judgeVotingOpen",
    value: boolean
  ) =>
    runAction(key, async () => {
      const res = await apiPost(pwRef.current, "/api/admin/settings", {
        [key]: value,
      });
      if (res?.settings) {
        setState((s) => ({ ...s, settings: res.settings }));
      }
    });

  const reveal = (body: { delta?: number; step?: number }, key: string) =>
    runAction(key, async () => {
      const res = await apiPost(pwRef.current, "/api/admin/reveal", body);
      if (typeof res?.revealStep === "number") {
        setState((s) => ({
          ...s,
          settings: { ...s.settings, revealStep: res.revealStep },
        }));
      }
    });

  const resetAll = () => {
    if (
      !window.confirm(
        "정말 모든 표를 초기화할까요?\n참가자·심사위원 투표가 전부 삭제되고 발표 단계가 0으로 돌아갑니다.\n이 작업은 되돌릴 수 없습니다."
      )
    )
      return;
    runAction("reset", async () => {
      await apiPost(pwRef.current, "/api/admin/reset");
    });
  };

  // ── 파생 값 ──
  const { settings, results, counts, totalParticipants, judgeCodes, totalRevealSteps } =
    state;
  const step = settings.revealStep;
  const stepDesc = describeStep(step, totalRevealSteps);
  const nextDesc =
    step < totalRevealSteps ? describeStep(step + 1, totalRevealSteps) : null;
  const participantPct = totalParticipants
    ? Math.min(100, Math.round((counts.participants / totalParticipants) * 100))
    : 0;
  const cfg: ScoringConfig = settings.config;
  const revealBusy = busyAction?.startsWith("reveal") ?? false;

  return (
    <div className="min-h-screen bg-[#f5f6f8] pb-16">
      <style>{`
        @keyframes adminPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>

      {/* 상단 바 */}
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-[#f5f6f8]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] text-sm font-black text-white shadow-md shadow-violet-200">
              P
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">
                프로젠 운영 콘솔
              </h1>
              <p className="text-xs text-slate-400">
                팀 대항전 집계 · 발표 컨트롤
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stale ? (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <span
                  className="inline-block h-2 w-2 rounded-full bg-amber-500"
                  style={{ animation: "adminPulse 1.2s ease-in-out infinite" }}
                />
                연결 재시도 중
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                실시간 연결됨
              </span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-200/70"
            >
              잠금
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-6">
        {/* 1행: 투표 현황 + 투표 열기/닫기 */}
        <div className="grid gap-6 lg:grid-cols-5">
          <SectionCard title="투표 현황" className="lg:col-span-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
                <div className="text-sm font-semibold text-slate-500">
                  참가자 투표
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-5xl font-black tabular-nums tracking-tight text-slate-900">
                    {counts.participants}
                  </span>
                  <span className="text-xl font-semibold text-slate-400">
                    / {totalParticipants}
                  </span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]"
                    animate={{ width: `${participantPct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                <div className="mt-1.5 text-right text-xs font-semibold text-violet-600">
                  {participantPct}%
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
                <div className="text-sm font-semibold text-slate-500">
                  심사 제출
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-5xl font-black tabular-nums tracking-tight text-slate-900">
                    {counts.judges}
                  </span>
                  <span className="text-xl font-semibold text-slate-400">
                    건
                  </span>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-400">
                  제출된 심사표 수입니다.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="투표 열기 / 닫기" className="lg:col-span-2">
            <div className="flex h-full flex-col justify-center gap-3">
              <ToggleSwitch
                label="참가자 투표"
                checked={settings.participantVotingOpen}
                disabled={busyAction === "participantVotingOpen"}
                onChange={(v) => setVoting("participantVotingOpen", v)}
              />
              <ToggleSwitch
                label="심사 투표"
                checked={settings.judgeVotingOpen}
                disabled={busyAction === "judgeVotingOpen"}
                onChange={(v) => setVoting("judgeVotingOpen", v)}
              />
            </div>
          </SectionCard>
        </div>

        {/* 발표 진행 컨트롤 */}
        <SectionCard
          title="발표 진행 컨트롤"
          badge={
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
              LIVE SHOW
            </span>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-col justify-center rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-violet-400">
                현재 단계
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-4xl font-black tabular-nums text-slate-900">
                  {step}
                  <span className="text-2xl font-bold text-slate-400">
                    {" "}
                    / {totalRevealSteps}
                  </span>
                </span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={step}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="text-2xl font-bold text-violet-700"
                  >
                    {stepDesc}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]"
                  animate={{ width: `${(step / totalRevealSteps) * 100}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <div className="mt-3 text-sm text-slate-500">
                {nextDesc ? (
                  <>
                    다음 단계:{" "}
                    <span className="font-semibold text-slate-700">
                      {nextDesc}
                    </span>
                  </>
                ) : (
                  "마지막 단계입니다."
                )}
                <span className="ml-2 text-xs text-slate-400">
                  · 발표 화면(/reveal)은 약 1초 안에 따라옵니다
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:w-72">
              <button
                type="button"
                disabled={revealBusy || step >= totalRevealSteps}
                onClick={() => reveal({ delta: 1 }, "reveal-next")}
                className="rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] px-8 py-6 text-2xl font-black text-white shadow-xl shadow-violet-200 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:hover:brightness-100"
              >
                다음 ▶
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={revealBusy || step <= 0}
                  onClick={() => reveal({ delta: -1 }, "reveal-prev")}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  ◀ 이전
                </button>
                <button
                  type="button"
                  disabled={revealBusy || step <= 0}
                  onClick={() => {
                    if (
                      step === 0 ||
                      window.confirm("발표를 처음(대기 화면)으로 되돌릴까요?")
                    )
                      reveal({ step: 0 }, "reveal-zero");
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  처음으로(대기)
                </button>
              </div>
              <button
                type="button"
                disabled={revealBusy || step >= totalRevealSteps}
                onClick={() => {
                  if (
                    window.confirm(
                      "중간 단계를 건너뛰고 전체 순위표로 이동할까요?"
                    )
                  )
                    reveal({ step: totalRevealSteps }, "reveal-full");
                }}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40"
              >
                전체 순위표로 ⤒
              </button>
            </div>
          </div>
        </SectionCard>

        {/* 접속 링크 & QR */}
        <SectionCard title="접속 링크 & QR">
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-5">
              <div className="text-sm font-semibold text-slate-600">
                참가자 투표 QR
              </div>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="참가자 투표 링크 QR 코드"
                  className="h-44 w-44 rounded-lg bg-white p-2 shadow-sm"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-white text-xs text-slate-400 shadow-sm">
                  QR 생성 중…
                </div>
              )}
              <p className="text-xs text-slate-400">
                스크린에 띄워 참가자에게 보여주세요
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">
                  참가자 투표 링크
                </div>
                {participantUrl && <LinkRow url={participantUrl} />}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  심사위원 전용 링크(비공개)
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    화면 공유 주의
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {judgeCodes.map((code) => (
                    <LinkRow
                      key={code}
                      url={base ? `${base}/judge?code=${code}` : ""}
                      secret
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">
                  발표 화면 링크
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    {revealUrl && <LinkRow url={revealUrl} />}
                  </div>
                  <a
                    href={revealUrl || "/reveal"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] px-4 py-2.5 text-center text-sm font-bold text-white shadow-md shadow-violet-200 transition hover:brightness-110"
                  >
                    발표 화면 새 탭으로 열기 ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* 집계 미리보기 */}
        <SectionCard
          title="집계 미리보기 (스포일러 주의)"
          badge={
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                previewOpen
                  ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  : "bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white shadow-md shadow-violet-200 hover:brightness-110"
              }`}
            >
              {previewOpen ? "결과 미리보기 닫기" : "결과 미리보기 열기"}
            </button>
          }
        >
          <AnimatePresence initial={false}>
            {previewOpen ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                  ⚠ 최종 결과가 그대로 노출됩니다. 발표 중 화면 공유 상태라면
                  열지 마세요.
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="px-4 py-3">순위</th>
                        <th className="px-4 py-3">팀</th>
                        <th className="px-4 py-3 text-right">참가자 점수(20~50점)</th>
                        <th className="px-4 py-3 text-right">심사 점수(35~50점)</th>
                        <th className="px-4 py-3 text-right">총점</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => {
                        const first = r.rank === 1;
                        return (
                          <tr
                            key={r.teamId}
                            className={`border-t border-slate-100 ${
                              first
                                ? "bg-gradient-to-r from-violet-50 to-indigo-50 font-bold text-slate-900"
                                : "text-slate-600"
                            }`}
                          >
                            <td className="px-4 py-2.5 tabular-nums">
                              {first ? "🏆 " : ""}
                              {r.rank}위
                            </td>
                            <td className="px-4 py-2.5">{r.label}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {r.participantShare.toFixed(1)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {r.judgeShare.toFixed(1)}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right tabular-nums ${
                                first ? "text-violet-700" : ""
                              }`}
                            >
                              {r.finalScore.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                      {results.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-slate-400"
                          >
                            아직 집계된 표가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.p
                key="hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-slate-400"
              >
                결과는 숨겨져 있습니다. 확인이 필요할 때만 여세요.
              </motion.p>
            )}
          </AnimatePresence>
        </SectionCard>

        {/* 설정 & 초기화 */}
        <SectionCard title="설정 & 초기화">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
              <div className="text-sm font-semibold text-slate-500">
                점수 구성 (팀당 100점 만점)
              </div>
              <div className="mt-2 text-3xl font-black tabular-nums text-slate-900">
                {cfg.participantMaxPoints}
                <span className="text-base font-semibold text-slate-400">
                  점 참가자
                </span>
                <span className="mx-2 text-slate-300">+</span>
                {cfg.judgeMaxPoints}
                <span className="text-base font-semibold text-slate-400">
                  점 심사
                </span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full">
                <div
                  className="bg-[#7c3aed]"
                  style={{
                    width: `${(cfg.participantMaxPoints / (cfg.participantMaxPoints + cfg.judgeMaxPoints)) * 100}%`,
                  }}
                />
                <div
                  className="bg-[#4f46e5]/40"
                  style={{
                    width: `${(cfg.judgeMaxPoints / (cfg.participantMaxPoints + cfg.judgeMaxPoints)) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                팀 인원수 보정: {cfg.eligibilityCorrection ? "사용" : "사용 안 함"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
              <div className="text-sm font-semibold text-slate-500">
                배점 규칙
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 font-medium text-slate-500">참가자</dt>
                  <dd className="text-right font-semibold text-slate-800">
                    기본 {cfg.participantMinPoints}점 + 득표율 ×{" "}
                    {cfg.participantMaxPoints - cfg.participantMinPoints}점
                    <span className="block text-xs font-normal text-slate-400">
                      3팀 선택 · 동일 배점 · 모수는 전체 명단(기권 포함)
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 font-medium text-slate-500">심사단</dt>
                  <dd className="text-right font-semibold text-slate-800">
                    1등 {cfg.judgeMaxPoints}점 ~ 꼴등 {cfg.judgeMinPoints}점
                    <span className="block text-xs font-normal text-slate-400">
                      등수당{" "}
                      {((cfg.judgeMaxPoints - cfg.judgeMinPoints) / 10).toFixed(1)}
                      점 · 심사위원 평균
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-rose-100 bg-rose-50/50 p-5">
              <div>
                <div className="text-sm font-semibold text-rose-600">
                  위험 구역
                </div>
                <p className="mt-1 text-xs leading-relaxed text-rose-400">
                  모든 참가자·심사위원 표를 삭제하고 발표 단계를 0으로
                  되돌립니다. 되돌릴 수 없습니다.
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction === "reset"}
                onClick={resetAll}
                className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:opacity-50"
              >
                {busyAction === "reset" ? "초기화 중…" : "모든 표 초기화"}
              </button>
            </div>
          </div>
        </SectionCard>
      </main>
    </div>
  );
}

// ───────────────────────── 페이지 루트 ─────────────────────────

export default function AdminPage() {
  const [auth, setAuth] = useState<{
    password: string;
    initialState: AdminState;
  } | null>(null);
  const [autoTrying, setAutoTrying] = useState(true);

  // 저장된 비밀번호로 자동 로그인 시도
  useEffect(() => {
    let alive = true;
    const stored = window.localStorage.getItem(PW_STORAGE_KEY);
    if (!stored) {
      setAutoTrying(false);
      return;
    }
    apiGetState(stored)
      .then((state) => {
        if (alive) setAuth({ password: stored, initialState: state });
      })
      .catch(() => {
        if (alive) window.localStorage.removeItem(PW_STORAGE_KEY);
      })
      .finally(() => {
        if (alive) setAutoTrying(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSuccess = (pw: string, state: AdminState) => {
    window.localStorage.setItem(PW_STORAGE_KEY, pw);
    setAuth({ password: pw, initialState: state });
  };

  const handleLogout = () => {
    window.localStorage.removeItem(PW_STORAGE_KEY);
    setAuth(null);
  };

  if (!auth) {
    return <PasswordGate onSuccess={handleSuccess} autoTrying={autoTrying} />;
  }
  return (
    <Dashboard
      key={auth.password}
      password={auth.password}
      initialState={auth.initialState}
      onLogout={handleLogout}
    />
  );
}
