"use client";

// 결과 발표 쇼 — 프로젝터/TV 전체화면용 시상식 리빌 화면.
// GET /api/reveal 을 800ms 간격으로 폴링하고, step 변화에만 사운드/컨페티를 발사한다.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { createAudioEngine, type AudioEngine } from "@/lib/audio";
import type { RevealPayload, RevealEntry } from "@/lib/reveal";

const POLL_MS = 800;

// ─── 프리미엄 시상식 팔레트 ──────────────────────────────────────────
const GOLD = "#d4af37";
const GOLD_LIGHT = "#e8c96a";
const GOLD_PALE = "#f3e3b3";
const IVORY = "#f5f0e6";
const MUTED = "#8a857b";

const SERIF =
  '"Apple Myungjo", "Nanum Myeongjo", "Noto Serif KR", Georgia, "Times New Roman", serif';

const CONFETTI_GOLD = [GOLD, GOLD_LIGHT, GOLD_PALE, IVORY, "#b8962e"];

function fireConfetti(): void {
  confetti({
    particleCount: 140,
    spread: 80,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.62 },
    colors: CONFETTI_GOLD,
    disableForReducedMotion: true,
  });
}

function fireWinnerConfetti(): void {
  const waves: Array<[number, () => void]> = [
    [0, () =>
      confetti({
        particleCount: 220,
        spread: 100,
        startVelocity: 55,
        origin: { x: 0.5, y: 0.6 },
        colors: CONFETTI_GOLD,
        disableForReducedMotion: true,
      })],
    [350, () =>
      confetti({
        particleCount: 120,
        angle: 60,
        spread: 65,
        startVelocity: 60,
        origin: { x: 0, y: 0.75 },
        colors: CONFETTI_GOLD,
        disableForReducedMotion: true,
      })],
    [350, () =>
      confetti({
        particleCount: 120,
        angle: 120,
        spread: 65,
        startVelocity: 60,
        origin: { x: 1, y: 0.75 },
        colors: CONFETTI_GOLD,
        disableForReducedMotion: true,
      })],
    [900, () =>
      confetti({
        particleCount: 180,
        spread: 140,
        startVelocity: 45,
        scalar: 1.2,
        origin: { x: 0.5, y: 0.5 },
        colors: CONFETTI_GOLD,
        disableForReducedMotion: true,
      })],
    [1600, () =>
      confetti({
        particleCount: 100,
        spread: 120,
        startVelocity: 35,
        scalar: 0.9,
        origin: { x: 0.5, y: 0.4 },
        colors: CONFETTI_GOLD,
        disableForReducedMotion: true,
      })],
  ];
  for (const [delay, fire] of waves) window.setTimeout(fire, delay);
}

/** 0 → value 카운트업 숫자(약 0.8초, ease-out) */
function CountUp({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 800;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

/** 얇은 골드 헤어라인(양끝 페이드) — 중앙 ◆ 옵션 */
function GoldRule({ diamond = false, width = "100%" }: { diamond?: boolean; width?: string }) {
  const line = (
    <div
      className="h-px flex-1"
      style={{
        background: `linear-gradient(90deg, transparent, ${GOLD}66 30%, ${GOLD}99 50%, ${GOLD}66 70%, transparent)`,
      }}
    />
  );
  if (!diamond) return <div style={{ width }}>{line}</div>;
  return (
    <div className="flex items-center gap-4" style={{ width }}>
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(90deg, transparent, ${GOLD}88)` }}
      />
      <span
        className="text-[0.55rem] leading-none"
        style={{ color: GOLD, transform: "translateY(-0.5px)" }}
      >
        ◆
      </span>
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(90deg, ${GOLD}88, transparent)` }}
      />
    </div>
  );
}

/** 네 모서리 얇은 골드 오너먼트(이중 라인 프레임의 코너 강조) */
function CornerOrnaments({ inset = "0.6rem", size = "1.6rem" }: { inset?: string; size?: string }) {
  const corners: Array<[string, string]> = [
    ["top", "left"],
    ["top", "right"],
    ["bottom", "left"],
    ["bottom", "right"],
  ];
  return (
    <>
      {corners.map(([v, h]) => (
        <div
          key={`${v}-${h}`}
          className="pointer-events-none absolute"
          style={{
            [v]: inset,
            [h]: inset,
            width: size,
            height: size,
            [`border${v === "top" ? "Top" : "Bottom"}`]: `1px solid ${GOLD}cc`,
            [`border${h === "left" ? "Left" : "Right"}`]: `1px solid ${GOLD}cc`,
          }}
        />
      ))}
    </>
  );
}

/** 작은 트래킹 라벨 (예: "PARTICIPANT VOTE · 참가자 투표") */
function TrackedLabel({
  children,
  color = GOLD_LIGHT,
  size = "clamp(0.7rem,1.1vw,0.95rem)",
}: {
  children: React.ReactNode;
  color?: string;
  size?: string;
}) {
  return (
    <span
      className="font-medium uppercase"
      style={{ color, fontSize: size, letterSpacing: "0.38em", textIndent: "0.38em" }}
    >
      {children}
    </span>
  );
}

/** 왕관 라인아트(1위 전용) */
function CrownLineArt({ size = "clamp(2rem,4vw,3.2rem)" }: { size?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      fill="none"
      stroke={GOLD_LIGHT}
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ width: size, height: "auto" }}
      aria-hidden
    >
      <path d="M6 25 L4 9 L14 17 L24 5 L34 17 L44 9 L42 25 Z" />
      <path d="M8 29 H40" />
      <circle cx="4" cy="7" r="1.4" />
      <circle cx="24" cy="3" r="1.4" />
      <circle cx="44" cy="7" r="1.4" />
    </svg>
  );
}

/** 점수 한 줄 — 트래킹 라벨 + 세리프 카운트업 + 골드 언더라인 드로우 */
function ScoreRow({
  label,
  title,
  value,
  emphasized = false,
}: {
  label: string;
  title: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 60, damping: 20 }}
      className="w-full"
    >
      <div className="flex items-baseline justify-between gap-8">
        <span className="flex items-baseline gap-3">
          <TrackedLabel
            color={emphasized ? GOLD_LIGHT : `${GOLD_LIGHT}cc`}
            size={
              emphasized
                ? "clamp(0.85rem,1.4vw,1.15rem)"
                : "clamp(0.7rem,1.1vw,0.95rem)"
            }
          >
            {label}
          </TrackedLabel>
          <span
            style={{
              color: MUTED,
              fontSize: emphasized
                ? "clamp(0.95rem,1.6vw,1.3rem)"
                : "clamp(0.85rem,1.4vw,1.1rem)",
            }}
          >
            · {title}
          </span>
        </span>
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: SERIF,
            color: emphasized ? GOLD_LIGHT : IVORY,
            fontSize: emphasized
              ? "clamp(3.2rem,7vw,5.6rem)"
              : "clamp(2rem,4vw,3.2rem)",
            textShadow: emphasized ? `0 0 40px ${GOLD}40` : "none",
          }}
        >
          <CountUp value={value} />
          <span
            className="ml-2"
            style={{
              fontSize: "0.42em",
              color: emphasized ? `${GOLD_PALE}cc` : MUTED,
            }}
          >
            점
          </span>
        </span>
      </div>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="mt-[1.1vh] h-px w-full origin-left"
        style={{
          background: emphasized
            ? `linear-gradient(90deg, ${GOLD}cc, ${GOLD}55 70%, transparent)`
            : `linear-gradient(90deg, ${GOLD}66, ${GOLD}22 70%, transparent)`,
          boxShadow: emphasized ? `0 0 12px ${GOLD}55` : "none",
        }}
      />
    </motion.div>
  );
}

/** 무대 배경 — 비네트 + 은은한 골드 글로우 + 아주 느린 라이트 스윕 */
function StageBackground({ gold }: { gold: boolean }) {
  const glow = gold ? 0.14 : 0.08;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 베이스 그라디언트 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, #111318 0%, #0a0a0a 70%)",
        }}
      />
      {/* 중앙 무대 뒤 골드 글로우 */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[110vh] w-[110vw] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: `radial-gradient(ellipse at center, rgba(212,175,55,${glow}) 0%, rgba(212,175,55,${glow * 0.35}) 30%, transparent 60%)`,
        }}
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* 거의 보이지 않는 회전 라이트 스윕 */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[180vmax] w-[180vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, rgba(232,201,106,0.035) 18deg, transparent 40deg, transparent 180deg, rgba(232,201,106,0.03) 200deg, transparent 224deg)`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      />
      {/* 바닥 반사광 */}
      <div
        className="absolute bottom-0 left-1/2 h-[34vh] w-[140vw] -translate-x-1/2"
        style={{
          background: `radial-gradient(ellipse at 50% 100%, rgba(212,175,55,0.07) 0%, transparent 65%)`,
        }}
      />
      {/* 비네트 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.8) 100%)",
        }}
      />
      {/* 상하 얇은 골드 프레임 라인 */}
      <div
        className="absolute inset-x-[4vw] top-[2.4vh] h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${GOLD}40 20%, ${GOLD}40 80%, transparent)`,
        }}
      />
      <div
        className="absolute inset-x-[4vw] bottom-[2.4vh] h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${GOLD}40 20%, ${GOLD}40 80%, transparent)`,
        }}
      />
    </div>
  );
}

/** 대기 화면 */
function IdleScreen() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex w-full max-w-4xl flex-col items-center gap-[4vh] px-8 text-center"
      >
        <TrackedLabel size="clamp(0.85rem,1.5vw,1.2rem)">
          프로젠 팀 경연 · Award Ceremony
        </TrackedLabel>
        <GoldRule diamond width="min(34rem, 70vw)" />
        <motion.div
          animate={{ opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="leading-snug"
          style={{
            fontFamily: SERIF,
            color: IVORY,
            fontSize: "clamp(2.8rem,6.5vw,5.5rem)",
            textShadow: `0 0 60px ${GOLD}22`,
          }}
        >
          잠시 후,
          <br />
          결과를 발표합니다
        </motion.div>
        <GoldRule diamond width="min(34rem, 70vw)" />
        <motion.div
          animate={{ opacity: [0.35, 0.8, 0.35] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <TrackedLabel color={MUTED} size="clamp(0.7rem,1.2vw,0.95rem)">
            The Results Will Be Announced Shortly
          </TrackedLabel>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** 이미 공개된 하위 순위 사다리(하단 스트립) */
function RevealedLadder({ entries }: { entries: RevealEntry[] }) {
  const revealed = entries
    .filter((e) => !e.current && e.label !== null)
    .sort((a, b) => b.rank - a.rank); // 5위 → 2위
  if (revealed.length === 0) return null;
  return (
    <div className="absolute inset-x-0 bottom-[4.5vh] flex flex-col items-center gap-[1.4vh] px-[6vw]">
      <GoldRule width="min(52rem, 80vw)" />
      <div className="flex items-stretch justify-center">
        {revealed.map((e, i) => (
          <motion.div
            key={e.rank}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 70, damping: 18 }}
            className="flex items-center"
          >
            {i > 0 && (
              <div
                className="mx-[2.2vw] w-px self-stretch"
                style={{
                  background: `linear-gradient(180deg, transparent, ${GOLD}44, transparent)`,
                }}
              />
            )}
            <div className="flex flex-col items-center gap-[0.35vh] text-center">
              <span
                className="leading-none tabular-nums"
                style={{
                  fontFamily: SERIF,
                  color: GOLD_LIGHT,
                  fontSize: "clamp(0.95rem,1.5vw,1.3rem)",
                }}
              >
                {e.rank}
                <span style={{ fontSize: "0.7em", color: `${GOLD_LIGHT}aa` }}>위</span>
              </span>
              <span
                className="leading-tight"
                style={{
                  fontFamily: SERIF,
                  color: IVORY,
                  fontSize: "clamp(1.1rem,1.9vw,1.6rem)",
                }}
              >
                {e.label}
              </span>
              <span
                className="tabular-nums"
                style={{ color: MUTED, fontSize: "clamp(0.8rem,1.3vw,1.05rem)" }}
              >
                {e.finalScore !== null ? `${e.finalScore.toFixed(1)}점` : ""}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** 현재 순위 발표 무대 */
function RankStage({ payload }: { payload: RevealPayload }) {
  const current = payload.entries.find((e) => e.current);
  if (!current) return <IdleScreen />;
  const { rank } = current;
  const phase = payload.meta.phase;
  const isWinner = rank === 1;
  const revealed = phase >= 4 && current.label !== null;

  return (
    <div className="relative flex h-full flex-col items-center justify-center pb-[16vh]">
      <div
        key={rank}
        className="flex w-full max-w-5xl flex-col items-center gap-[2.6vh] px-8"
      >
        {/* 순위 표기 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-[1.6vh] text-center"
        >
          <TrackedLabel>
            {isWinner ? "The Grand Prize · 대상 발표" : "The Announcement · 순위 발표"}
          </TrackedLabel>
          <div
            className="leading-none"
            style={{ fontFamily: SERIF, color: IVORY }}
          >
            <span style={{ fontSize: "clamp(2rem,4.5vw,3.6rem)" }}>제 </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: "clamp(4.5rem,11vw,9.5rem)",
                color: isWinner ? GOLD_LIGHT : GOLD,
                textShadow: `0 0 60px ${GOLD}33`,
              }}
            >
              {rank}
            </span>
            <span style={{ fontSize: "clamp(2rem,4.5vw,3.6rem)" }}> 위</span>
          </div>
          <GoldRule diamond width="min(26rem, 56vw)" />
        </motion.div>

        {/* 팀 이름 영역: ? ↔ 공개 */}
        <div className="flex min-h-[17vh] items-center justify-center">
          <AnimatePresence mode="wait">
            {revealed ? (
              <motion.div
                key="team"
                initial={{ opacity: 0, y: 26, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 55, damping: 16 }}
                className="relative px-[5vw] py-[3.2vh] text-center"
                style={{
                  border: `1px solid ${GOLD}${isWinner ? "cc" : "88"}`,
                  boxShadow: isWinner
                    ? `0 0 90px ${GOLD}30, inset 0 0 60px ${GOLD}0d`
                    : `0 0 50px ${GOLD}1a`,
                  background: "rgba(17,19,24,0.55)",
                }}
              >
                {/* 이너 헤어라인(이중 프레임) */}
                <div
                  className="pointer-events-none absolute inset-[0.45rem]"
                  style={{ border: `1px solid ${GOLD}33` }}
                />
                <CornerOrnaments />
                <div className="relative flex flex-col items-center gap-[1.2vh]">
                  {isWinner && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.9 }}
                      className="flex flex-col items-center gap-[0.6vh]"
                    >
                      <CrownLineArt />
                      <TrackedLabel size="clamp(0.75rem,1.3vw,1.05rem)">
                        Winner · 우승
                      </TrackedLabel>
                    </motion.div>
                  )}
                  <div
                    className={`leading-tight ${isWinner ? "reveal-shimmer" : ""}`}
                    style={{
                      fontFamily: SERIF,
                      fontSize: "clamp(3rem,8vw,7rem)",
                      ...(isWinner
                        ? {}
                        : {
                            color: IVORY,
                            textShadow: `0 0 50px ${GOLD}26`,
                          }),
                    }}
                  >
                    {current.label}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="question"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.5 }}
                className="flex items-center justify-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.045, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className="relative flex items-center justify-center rounded-full"
                  style={{
                    width: "clamp(8.5rem,17vh,13rem)",
                    height: "clamp(8.5rem,17vh,13rem)",
                    border: `1px solid ${GOLD}99`,
                    boxShadow: `0 0 60px ${GOLD}26, inset 0 0 40px ${GOLD}14`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-[0.45rem] rounded-full"
                    style={{ border: `1px solid ${GOLD}30` }}
                  />
                  <motion.span
                    animate={{ opacity: [0.65, 1, 0.65] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    className="leading-none"
                    style={{
                      fontFamily: SERIF,
                      color: GOLD_LIGHT,
                      fontSize: "clamp(4rem,9vh,6.5rem)",
                      textShadow: `0 0 40px ${GOLD}55`,
                    }}
                  >
                    ?
                  </motion.span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 점수 단계별 공개 */}
        <div className="flex w-full max-w-3xl flex-col gap-[2.4vh]">
          {current.participantShare !== null && (
            <ScoreRow
              label="Participant Vote"
              title="참가자 투표"
              value={current.participantShare}
            />
          )}
          {current.judgeShare !== null && (
            <ScoreRow label="Jury Score" title="심사위원" value={current.judgeShare} />
          )}
          {current.finalScore !== null && (
            <ScoreRow
              label="Total Score"
              title="총점"
              value={current.finalScore}
              emphasized
            />
          )}
        </div>
      </div>

      <RevealedLadder entries={payload.entries} />
    </div>
  );
}

/** 최종 전체 순위표 — 1~5위 세로 리스트 + 6위 이하 하단 한 줄 */
function FullStandings({ entries }: { entries: RevealEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const first = sorted[0];
  const topRest = sorted.slice(1, 5); // 2위 ~ 5위
  const bottom = sorted.slice(5); // 6위 이하 (최대 6팀)
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-[1.8vh] px-[4vw] py-[3vh]">
      <motion.div
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-[0.9vh] text-center"
      >
        <TrackedLabel>Final Standings · 최종 순위</TrackedLabel>
        <h1
          className="leading-none"
          style={{
            fontFamily: SERIF,
            color: IVORY,
            fontSize: "clamp(1.8rem,4vw,3.2rem)",
          }}
        >
          최종 순위
        </h1>
        <GoldRule diamond width="min(28rem, 60vw)" />
      </motion.div>

      {/* 1위 — 골드 프레임, 최대 강조 */}
      {first && (
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 55, damping: 16, delay: 0.15 }}
          className="relative flex w-full max-w-5xl items-center justify-between gap-6 px-[3vw] py-[1.9vh]"
          style={{
            border: `1px solid ${GOLD}cc`,
            boxShadow: `0 0 80px ${GOLD}2b, inset 0 0 50px ${GOLD}0d`,
            background: "rgba(17,19,24,0.55)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-[0.45rem]"
            style={{ border: `1px solid ${GOLD}33` }}
          />
          <CornerOrnaments />
          <div className="relative flex min-w-0 items-center gap-[2vw]">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <CrownLineArt size="clamp(1.6rem,3vw,2.4rem)" />
              <span
                className="tabular-nums leading-none"
                style={{
                  fontFamily: SERIF,
                  color: GOLD_LIGHT,
                  fontSize: "clamp(1.3rem,2.6vw,2.1rem)",
                }}
              >
                1<span style={{ fontSize: "0.65em" }}>위</span>
              </span>
            </div>
            <span
              className="reveal-shimmer truncate leading-tight"
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(1.9rem,4.4vw,3.4rem)",
              }}
            >
              {first.label}
            </span>
          </div>
          <div className="relative shrink-0 text-right">
            <div
              className="tabular-nums leading-none"
              style={{
                fontFamily: SERIF,
                color: GOLD_LIGHT,
                fontSize: "clamp(1.9rem,4.4vw,3.4rem)",
                textShadow: `0 0 40px ${GOLD}40`,
              }}
            >
              {first.finalScore !== null ? first.finalScore.toFixed(1) : "-"}
              <span className="ml-1" style={{ fontSize: "0.45em", color: `${GOLD_PALE}cc` }}>
                점
              </span>
            </div>
            <div
              className="mt-[0.5vh] tabular-nums"
              style={{ color: MUTED, fontSize: "clamp(0.7rem,1.2vw,0.95rem)" }}
            >
              참가자 {first.participantShare?.toFixed(1) ?? "-"} ◆ 심사위원{" "}
              {first.judgeShare?.toFixed(1) ?? "-"}
            </div>
          </div>
        </motion.div>
      )}

      {/* 2위 ~ 5위 — 세로 리스트 */}
      <div className="flex w-full max-w-5xl flex-col">
        {topRest.map((e, i) => (
          <motion.div
            key={e.rank}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.32 + i * 0.09, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-between gap-4 px-[1vw] py-[1.15vh]"
            style={{
              borderBottom: `1px solid ${GOLD}${e.rank <= 3 ? "38" : "1f"}`,
            }}
          >
            <div className="flex min-w-0 items-center gap-[1.4vw]">
              <span
                className="w-[2.6ch] shrink-0 text-right tabular-nums leading-none"
                style={{
                  fontFamily: SERIF,
                  color: GOLD_LIGHT,
                  fontSize: "clamp(1.4rem,2.8vw,2.3rem)",
                }}
              >
                {e.rank}
                <span style={{ fontSize: "0.6em", color: `${GOLD_LIGHT}aa` }}>위</span>
              </span>
              <span className="shrink-0 text-[0.6rem]" style={{ color: `${GOLD}aa` }}>
                ◆
              </span>
              <span
                className="truncate leading-tight"
                style={{
                  fontFamily: SERIF,
                  color: IVORY,
                  fontSize: "clamp(1.4rem,2.8vw,2.3rem)",
                }}
              >
                {e.label}
              </span>
            </div>
            <div className="flex shrink-0 items-baseline gap-[1.6vw]">
              <span
                className="tabular-nums"
                style={{ color: MUTED, fontSize: "clamp(0.7rem,1.2vw,0.95rem)" }}
              >
                참 {e.participantShare?.toFixed(1) ?? "-"} · 심 {e.judgeShare?.toFixed(1) ?? "-"}
              </span>
              <span
                className="tabular-nums leading-none"
                style={{
                  fontFamily: SERIF,
                  color: GOLD_PALE,
                  fontSize: "clamp(1.4rem,2.8vw,2.3rem)",
                }}
              >
                {e.finalScore !== null ? e.finalScore.toFixed(1) : "-"}
                <span className="ml-0.5" style={{ fontSize: "0.55em", color: MUTED }}>
                  점
                </span>
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 6위 이하 — 하단 한 줄(컴팩트 카드 6개) */}
      {bottom.length > 0 && (
        <div
          className="grid w-full max-w-6xl gap-[0.8vw]"
          style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}
        >
          {bottom.map((e, i) => (
            <motion.div
              key={e.rank}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.75 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-w-0 flex-col items-center gap-[0.4vh] px-[0.5vw] py-[1vh] text-center"
              style={{
                border: `1px solid ${GOLD}22`,
                background: "rgba(17,19,24,0.45)",
              }}
            >
              <span
                className="tabular-nums leading-none"
                style={{
                  fontFamily: SERIF,
                  color: MUTED,
                  fontSize: "clamp(0.85rem,1.4vw,1.15rem)",
                }}
              >
                {e.rank}
                <span style={{ fontSize: "0.7em" }}>위</span>
              </span>
              <span
                className="w-full truncate leading-tight"
                style={{
                  fontFamily: SERIF,
                  color: IVORY,
                  fontSize: "clamp(0.85rem,1.4vw,1.2rem)",
                }}
              >
                {e.label}
              </span>
              <span
                className="tabular-nums leading-none"
                style={{
                  fontFamily: SERIF,
                  color: `${GOLD_PALE}cc`,
                  fontSize: "clamp(0.85rem,1.4vw,1.2rem)",
                }}
              >
                {e.finalScore !== null ? e.finalScore.toFixed(1) : "-"}
                <span className="ml-0.5" style={{ fontSize: "0.7em", color: MUTED }}>
                  점
                </span>
              </span>
            </motion.div>
          ))}
        </div>
      )}

      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        className="flex flex-col items-center gap-[0.7vh]"
      >
        <GoldRule diamond width="min(20rem, 44vw)" />
        <span
          style={{
            fontFamily: SERIF,
            color: GOLD_LIGHT,
            fontSize: "clamp(1.2rem,2.6vw,2rem)",
          }}
        >
          축하합니다
        </span>
      </motion.div>
    </div>
  );
}

export default function RevealPage() {
  const [started, setStarted] = useState(false);
  const [payload, setPayload] = useState<RevealPayload | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const lastStepRef = useRef<number | null>(null);

  // 폴링 (시작 후에만)
  useEffect(() => {
    if (!started) return;
    let stopped = false;
    let inflight = false;
    const tick = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const res = await fetch("/api/reveal", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as RevealPayload;
          if (!stopped) setPayload(data);
        }
      } catch {
        // 다음 폴링에서 재시도
      } finally {
        inflight = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [started]);

  // step 변화에만 사운드/컨페티 발사(같은 step 반복 폴링은 무시)
  useEffect(() => {
    if (!started || !payload) return;
    if (lastStepRef.current === payload.step) return;
    lastStepRef.current = payload.step;

    const engine = engineRef.current;
    if (!engine) return;
    const m = payload.meta;

    if (m.idle) {
      engine.stopAll();
      return;
    }
    if (m.fullStandings) {
      // 전체 순위표: 팡파레 없이 브금이 계속 흐르도록 유지. 축포만.
      engine.tensionStart(); // 이미 재생 중이면 no-op
      fireWinnerConfetti();
      return;
    }
    switch (m.phase) {
      case 0:
        engine.tensionStart();
        break;
      case 1:
      case 2:
        engine.tensionStart(); // 새로고침/점프 대비(이미 돌고 있으면 no-op)
        engine.hit();
        break;
      case 3:
        engine.tensionStart();
        engine.hit(true); // 총점 — 강한 임팩트
        break;
      case 4: {
        // 팀 공개: 효과음(팡파레) 없이 브금이 계속 이어지도록(요청). 축포만.
        engine.tensionStart(); // 이미 재생 중이면 no-op
        const big = m.rank === 1;
        if (big) fireWinnerConfetti();
        else fireConfetti();
        break;
      }
    }
  }, [started, payload]);

  // 언마운트 시 사운드 정리
  useEffect(() => {
    return () => {
      engineRef.current?.stopAll();
    };
  }, []);

  const handleStart = () => {
    // (a) 사용자 제스처 안에서 오디오 언락
    const engine = createAudioEngine();
    engine.unlock();
    engineRef.current = engine;
    // (b) 전체화면 요청
    try {
      void document.documentElement.requestFullscreen?.()?.catch?.(() => {});
    } catch {
      // 전체화면 실패해도 진행
    }
    // (c) 폴링 시작
    setStarted(true);
  };

  const goldMode =
    payload !== null &&
    (payload.meta.fullStandings || (payload.meta.rank === 1 && payload.meta.phase >= 4));

  return (
    <div
      className={`fixed inset-0 overflow-hidden bg-[#0a0a0a] select-none ${
        started ? "cursor-none" : ""
      }`}
      style={{ color: IVORY }}
    >
      {/* 골드 시머(우승 팀명 텍스트 스윕) */}
      <style>{`
        @keyframes reveal-shimmer-sweep {
          0% { background-position: 200% 50%; }
          100% { background-position: -200% 50%; }
        }
        .reveal-shimmer {
          background-image: linear-gradient(
            105deg,
            ${GOLD} 0%,
            ${GOLD_LIGHT} 38%,
            ${GOLD_PALE} 48%,
            #fdf6df 50%,
            ${GOLD_PALE} 52%,
            ${GOLD_LIGHT} 62%,
            ${GOLD} 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: reveal-shimmer-sweep 4.5s ease-in-out infinite;
        }
      `}</style>

      <StageBackground gold={goldMode} />

      {!started ? (
        <div className="relative flex h-full items-center justify-center">
          <motion.button
            type="button"
            onClick={handleStart}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
            whileTap={{ scale: 0.985 }}
            className="relative flex flex-col items-center gap-[3.4vh] px-[7vw] py-[7vh] text-center"
            style={{
              border: `1px solid ${GOLD}99`,
              background: "rgba(10,10,10,0.4)",
              boxShadow: `0 0 70px ${GOLD}1f, inset 0 0 50px ${GOLD}0a`,
            }}
          >
            <div
              className="pointer-events-none absolute inset-[0.5rem]"
              style={{ border: `1px solid ${GOLD}33` }}
            />
            <CornerOrnaments />
            <TrackedLabel size="clamp(0.8rem,1.4vw,1.1rem)">
              프로젠 팀 경연 · Award Ceremony
            </TrackedLabel>
            <span
              className="leading-none"
              style={{
                fontFamily: SERIF,
                color: IVORY,
                fontSize: "clamp(3rem,7vw,6rem)",
                textShadow: `0 0 60px ${GOLD}26`,
              }}
            >
              결과 발표
            </span>
            <GoldRule diamond width="min(22rem, 50vw)" />
            <motion.span
              animate={{ opacity: [0.45, 0.9, 0.45] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ color: MUTED, fontSize: "clamp(0.9rem,1.5vw,1.2rem)" }}
            >
              화면을 클릭하면 시작합니다
            </motion.span>
          </motion.button>
        </div>
      ) : payload === null ? (
        <div className="relative flex h-full items-center justify-center">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          >
            <TrackedLabel color={MUTED} size="clamp(1rem,1.8vw,1.4rem)">
              연결 중
            </TrackedLabel>
          </motion.div>
        </div>
      ) : payload.meta.idle ? (
        <IdleScreen />
      ) : payload.meta.fullStandings && payload.fullStandings ? (
        <FullStandings entries={payload.fullStandings} />
      ) : (
        <RankStage payload={payload} />
      )}

      {/* 진행 표시(구석, 은은하게) */}
      {started && payload !== null && (
        <div
          className="absolute bottom-3 right-4 text-sm tabular-nums"
          style={{ color: `${MUTED}59` }}
        >
          {payload.step} / {payload.totalSteps}
        </div>
      )}
    </div>
  );
}
