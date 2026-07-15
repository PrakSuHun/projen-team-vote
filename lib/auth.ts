// 관리자 비밀번호 / 심사위원 접속 코드 (환경변수로 재정의 가능)

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "projen-admin";
}

export function checkAdmin(password: string | null | undefined): boolean {
  return !!password && password === getAdminPassword();
}

// 심사위원 코드 목록. 각 코드가 곧 judgeId (표 중복 방지 키).
export function getJudgeCodes(): string[] {
  const raw = process.env.JUDGE_CODES;
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["judge-alpha", "judge-bravo"]; // 기본 심사위원 2명
}

export function validJudgeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim();
  return getJudgeCodes().includes(c) ? c : null;
}
