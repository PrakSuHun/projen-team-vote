// 결과 발표(리빌 쇼)용 사운드 엔진 — 2계층 구조.
//
//   Layer 1: public/audio/ 의 실제 음원 파일(있으면 우선 사용, 전부 선택 사항)
//     - /audio/tension.mp3  긴장감 브금(루프) — 발표/점수 단계 내내 재생
//     - /audio/reveal.mp3   점수 한 줄 공개용 히트
//     - /audio/fanfare.mp3  팀 공개 팡파레
//     - /audio/winner.mp3   1위/최종 순위표용(없으면 fanfare.mp3 로 폴백)
//   Layer 2: Web Audio API 합성 폴백 — 어둡고 시네마틱한 긴장 베드/임팩트/팡파레.
//
// 클라이언트 전용: import 시점에는 window/AudioContext/Audio 를 건드리지 않고,
// unlock()(사용자 제스처 안) 이후에만 생성한다. 파일이 없거나 로드에 실패해도
// 절대 throw 하지 않고 합성음으로 대체한다.

export type AudioEngine = {
  /** 사용자 제스처(클릭) 안에서 호출 — AudioContext 생성/resume + 음원 파일 로드 시도 */
  unlock: () => void;
  /** 긴장 베드 시작(이미 재생 중이면 no-op). 파일(tension.mp3) 우선, 없으면 합성 드론+심장박동 */
  tensionStart: () => void;
  /** 긴장 베드 정지(약 300ms 페이드아웃) */
  tensionStop: () => void;
  /** 점수 공개 임팩트(저음 붐). strong=true 면 총점용 강한 버전 */
  hit: (strong?: boolean) => void;
  /** 팀 공개 팡파레. big=true 면 우승(1위)/최종 순위표용 롱 버전 */
  fanfare: (big?: boolean) => void;
  /** 루프(긴장 베드) 전부 페이드아웃 정지 */
  stopAll: () => void;
};

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

const FILE_SRC = {
  tension: "/audio/tension.mp3",
  reveal: "/audio/reveal.mp3",
  fanfare: "/audio/fanfare.mp3",
  winner: "/audio/winner.mp3",
} as const;

type CueName = keyof typeof FILE_SRC;

const TENSION_FILE_VOLUME = 0.85;

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  // ── Layer 1: 파일 큐 상태 ──────────────────────────────────────────
  const files: Record<CueName, { el: HTMLAudioElement | null; ready: boolean }> = {
    tension: { el: null, ready: false },
    reveal: { el: null, ready: false },
    fanfare: { el: null, ready: false },
    winner: { el: null, ready: false },
  };
  let tensionFilePlaying = false;
  let fileFadeTimer: number | null = null;

  // ── Layer 2: 합성 긴장 베드 상태 ──────────────────────────────────
  let tensionBus: GainNode | null = null;
  let heartbeatTimer: number | null = null;
  let tensionNodes: AudioScheduledSourceNode[] = [];

  function loadFiles(): void {
    if (typeof window === "undefined" || typeof Audio === "undefined") return;
    for (const name of Object.keys(FILE_SRC) as CueName[]) {
      if (files[name].el) continue;
      try {
        const el = new Audio(FILE_SRC[name]);
        el.preload = "auto";
        el.addEventListener(
          "canplaythrough",
          () => {
            files[name].ready = true;
          },
          { once: true },
        );
        el.addEventListener(
          "error",
          () => {
            files[name].ready = false;
          },
          { once: true },
        );
        if (name === "tension") {
          el.loop = true;
          el.volume = TENSION_FILE_VOLUME;
        }
        files[name].el = el;
        el.load();
      } catch {
        files[name].el = null; // 파일 계층 실패 → 합성음만 사용
      }
    }
  }

  /** 원샷 파일 재생(로드 완료된 경우만). 성공 여부 반환 */
  function playFile(name: CueName, volume = 1): boolean {
    const f = files[name];
    if (!f.el || !f.ready) return false;
    try {
      const node = f.el.cloneNode(true) as HTMLAudioElement;
      node.loop = false;
      node.volume = Math.max(0, Math.min(1, volume));
      void node.play()?.catch?.(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function tensionFileStart(): boolean {
    const f = files.tension;
    if (!f.el || !f.ready) return false;
    if (tensionFilePlaying) return true;
    try {
      if (typeof window !== "undefined" && fileFadeTimer !== null) {
        window.clearInterval(fileFadeTimer);
        fileFadeTimer = null;
      }
      f.el.currentTime = 0;
      f.el.volume = TENSION_FILE_VOLUME;
      void f.el.play()?.catch?.(() => {});
      tensionFilePlaying = true;
      return true;
    } catch {
      return false;
    }
  }

  function tensionFileStop(): void {
    const el = files.tension.el;
    if (!el || !tensionFilePlaying) return;
    tensionFilePlaying = false;
    if (typeof window === "undefined") {
      try {
        el.pause();
      } catch {
        // 무시
      }
      return;
    }
    // 약 300ms JS 볼륨 페이드 후 pause
    if (fileFadeTimer !== null) window.clearInterval(fileFadeTimer);
    const step = Math.max(0.02, el.volume / 10);
    fileFadeTimer = window.setInterval(() => {
      try {
        if (el.volume > step) {
          el.volume = Math.max(0, el.volume - step);
        } else {
          el.pause();
          el.currentTime = 0;
          el.volume = TENSION_FILE_VOLUME;
          if (fileFadeTimer !== null) {
            window.clearInterval(fileFadeTimer);
            fileFadeTimer = null;
          }
        }
      } catch {
        if (fileFadeTimer !== null) {
          window.clearInterval(fileFadeTimer);
          fileFadeTimer = null;
        }
      }
    }, 30);
  }

  function unlock(): void {
    if (typeof window === "undefined") return;
    try {
      if (!ctx) {
        const AC =
          window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
        if (AC) {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.9;
          master.connect(ctx.destination);
          // 1초 분량 화이트 노이즈 버퍼(임팩트 테일/쉬머 재료)
          noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
      }
      if (ctx && ctx.state === "suspended") void ctx.resume();
      // 일부 브라우저에서 완전 언락을 위해 무음 틱 한 번 재생
      if (ctx && master) {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.02);
      }
      // 음원 파일 로드 시도(있으면 사용, 없으면 합성음)
      loadFiles();
    } catch {
      // 오디오가 실패해도 화면 진행은 막지 않는다
    }
  }

  // ── Layer 2: 합성 긴장 베드(드론 + 심장박동 + 라이저) ─────────────
  function synthTensionStart(): void {
    if (!ctx || !master || typeof window === "undefined") return;
    if (tensionBus) return; // 이미 재생 중
    try {
      if (ctx.state === "suspended") void ctx.resume();
      const t = ctx.currentTime;
      const bus = ctx.createGain();
      // 절제된 시작 → 약 13초에 걸쳐 서서히 고조
      bus.gain.setValueAtTime(0.55, t);
      bus.gain.linearRampToValueAtTime(1.0, t + 13);
      bus.connect(master);
      tensionBus = bus;

      // 저역 드론: 디튠된 saw 두 겹 → 로우패스(느린 LFO 로 필터가 숨쉬듯 움직임)
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 170;
      lp.Q.value = 0.8;
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.14;
      lp.connect(droneGain);
      droneGain.connect(bus);
      for (const [freq, det] of [
        [55, 0],
        [55.7, -7],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        tensionNodes.push(o);
      }
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 70;
      lfo.connect(lfoAmt);
      lfoAmt.connect(lp.frequency);
      lfo.start(t);
      tensionNodes.push(lfo);

      // 아주 은은한 라이저(쉬머): 루프 노이즈 → 밴드패스 주파수가 14초에 걸쳐 상승
      if (noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 6;
        bp.frequency.setValueAtTime(700, t);
        bp.frequency.exponentialRampToValueAtTime(3800, t + 14);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.012, t);
        g.gain.linearRampToValueAtTime(0.05, t + 14);
        src.connect(bp);
        bp.connect(g);
        g.connect(bus);
        src.start(t);
        tensionNodes.push(src);
      }

      // 심장박동: 깊은 사인 킥(피치 드롭) 더블 썸프, 약 48 BPM
      const thump = (at: number, vol: number): void => {
        if (!ctx || !tensionBus) return;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(82, at);
        o.frequency.exponentialRampToValueAtTime(38, at + 0.22);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
        o.connect(g);
        g.connect(tensionBus);
        o.start(at);
        o.stop(at + 0.35);
      };
      const beat = (): void => {
        if (!ctx || !tensionBus) return;
        try {
          const at = ctx.currentTime;
          thump(at, 0.5);
          thump(at + 0.3, 0.32);
        } catch {
          // 개별 박동 실패는 무시
        }
      };
      beat();
      heartbeatTimer = window.setInterval(beat, 1250);
    } catch {
      tensionBus = null;
    }
  }

  function synthTensionStop(): void {
    if (typeof window !== "undefined" && heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    const bus = tensionBus;
    const nodes = tensionNodes;
    tensionBus = null;
    tensionNodes = [];
    if (!ctx || !bus) return;
    try {
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    } catch {
      // 무시
    }
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            // 무시
          }
        }
        try {
          bus.disconnect();
        } catch {
          // 무시
        }
      }, 450);
    }
  }

  // ── Layer 2: 시네마틱 임팩트(저음 붐 + 노이즈 테일) ────────────────
  function synthHit(strong: boolean): void {
    if (!ctx || !master) return;
    try {
      const t = ctx.currentTime;

      // 저음 붐: 사인 피치 드롭 120 → 45Hz
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(strong ? 0.85 : 0.55, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + (strong ? 0.7 : 0.5));
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + (strong ? 0.8 : 0.6));

      // 총점용 강한 버전: 서브 레이어 한 겹 추가
      if (strong) {
        const s = ctx.createOscillator();
        s.type = "sine";
        s.frequency.setValueAtTime(60, t);
        s.frequency.exponentialRampToValueAtTime(30, t + 0.5);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        s.connect(sg);
        sg.connect(master);
        s.start(t);
        s.stop(t + 1);
      }

      // 필터드 노이즈 테일(잔향감)
      if (noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(strong ? 900 : 600, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
        const env = ctx.createGain();
        env.gain.setValueAtTime(strong ? 0.35 : 0.22, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + (strong ? 0.8 : 0.55));
        src.connect(lp);
        lp.connect(env);
        env.connect(master);
        src.start(t, Math.random() * 0.2, strong ? 0.9 : 0.65);
      }
    } catch {
      // 무시
    }
  }

  /** 심벌(하이패스 노이즈) */
  function cymbal(at: number, vol = 0.35, dur = 0.7): void {
    if (!ctx || !master || !noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(hp);
    hp.connect(env);
    env.connect(master);
    src.start(at, Math.random() * 0.3, dur + 0.05);
  }

  /** 팀파니 한 타(저음 글라이드 사인) */
  function timpani(at: number, vol = 0.6): void {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(100, at);
    o.frequency.exponentialRampToValueAtTime(50, at + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    o.connect(g);
    g.connect(master);
    o.start(at);
    o.stop(at + 0.5);
  }

  /** 가속하며 고조되는 팀파니 롤(코드 진입 직전 긴장) */
  function timpaniRoll(at: number, dur: number, vol = 0.5): void {
    if (!ctx || !master) return;
    let step = 0.11;
    let tt = at;
    while (tt < at + dur) {
      const progress = (tt - at) / dur;
      timpani(tt, vol * (0.45 + 0.55 * progress));
      tt += step;
      step = Math.max(0.05, step * 0.9);
    }
  }

  // ── Layer 2: 팡파레(팀파니 롤 → 묵직한 브라스 코드) ────────────────
  function synthFanfare(big: boolean): void {
    if (!ctx || !master) return;
    try {
      const t0 = ctx.currentTime + 0.03;

      // 브라스: 디튠 소우투스 3겹 → 로우패스(살짝 어둡게)
      const bus = ctx.createGain();
      bus.gain.value = big ? 0.34 : 0.3;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      bus.connect(lp);
      lp.connect(master);

      const note = (freq: number, start: number, dur: number, vol = 1): void => {
        if (!ctx) return;
        for (const det of [-8, 0, 8]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = freq;
          o.detune.value = det;
          const g = ctx.createGain();
          const at = t0 + start;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(vol * 0.28, at + 0.04);
          g.gain.setValueAtTime(vol * 0.28, at + Math.max(0.05, dur * 0.55));
          g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          o.connect(g);
          g.connect(bus);
          o.start(at);
          o.stop(at + dur + 0.08);
        }
      };

      const C3 = 130.81;
      const C4 = 261.63;
      const E4 = 329.63;
      const G4 = 392.0;
      const C5 = 523.25;
      const E5 = 659.25;
      const G5 = 783.99;

      // 팀파니 롤로 진입
      const roll = big ? 0.7 : 0.45;
      timpaniRoll(t0, roll, big ? 0.55 : 0.42);

      // 상승 아르페지오 → 묵직한 종지 코드(긴 릴리스)
      note(C4, roll, 0.22, 0.85);
      note(E4, roll + 0.16, 0.22, 0.85);
      note(G4, roll + 0.32, 0.22, 0.9);
      const chordAt = roll + 0.48;
      const hold = big ? 2.6 : 1.7;
      note(C5, chordAt, hold, 1);
      note(G4, chordAt, hold, 0.7);
      note(E4, chordAt, hold, 0.7);
      note(C4, chordAt, hold, 0.65);
      note(C3, chordAt, hold, 0.55); // 저역 보강
      timpani(t0 + chordAt, big ? 0.75 : 0.55);
      cymbal(t0 + chordAt, big ? 0.4 : 0.3, big ? 1.2 : 0.8);

      if (big) {
        // 우승자용 두 번째 상승 프레이즈 + 하이 코드
        const p2 = chordAt + 0.75;
        note(E5, p2, 0.2, 0.9);
        note(G5, p2 + 0.22, 2.4, 1);
        note(E5, p2 + 0.22, 2.4, 0.75);
        note(C5, p2 + 0.22, 2.4, 0.7);
        note(G4, p2 + 0.22, 2.4, 0.55);
        note(C3, p2 + 0.22, 2.4, 0.5);
        timpaniRoll(t0 + p2 - 0.3, 0.5, 0.5);
        timpani(t0 + p2 + 0.22, 0.8);
        cymbal(t0 + p2 + 0.22, 0.45, 1.6);
        cymbal(t0 + p2 + 1.1, 0.25, 1.2);
      }
    } catch {
      // 무시
    }
  }

  // ── 공개 API(파일 우선 → 합성 폴백) ────────────────────────────────
  function tensionStart(): void {
    if (tensionFilePlaying) return;
    if (tensionFileStart()) {
      synthTensionStop(); // 파일이 늦게 준비된 경우 합성 베드와 겹치지 않게
      return;
    }
    synthTensionStart();
  }

  function tensionStop(): void {
    tensionFileStop();
    synthTensionStop();
  }

  function hit(strong = false): void {
    if (playFile("reveal", strong ? 1 : 0.85)) return;
    synthHit(strong);
  }

  function fanfare(big = false): void {
    if (big && playFile("winner")) return;
    if (playFile("fanfare", big ? 1 : 0.9)) return;
    synthFanfare(big);
  }

  function stopAll(): void {
    tensionStop();
  }

  return { unlock, tensionStart, tensionStop, hit, fanfare, stopAll };
}
