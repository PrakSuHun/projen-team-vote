import type { Team, Participant } from "./types";

// 이름 정규화: 공백 제거 (인증 매칭용)
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

export const TEAMS: Team[] = [
  { id: 1, label: "1팀(Axis)" },
  { id: 2, label: "2팀(위브)" },
  { id: 3, label: "3팀(CUBE)" },
  { id: 4, label: "4팀(RGB)" },
  { id: 5, label: "5팀(Ai디어뱅크)" },
  { id: 6, label: "6팀(Vertex)" },
  { id: 7, label: "7팀(AiAi)" },
  { id: 8, label: "8팀(영크크)" },
  { id: 9, label: "9팀(GPU)" },
  { id: 10, label: "10팀(10sorflow)" },
  { id: 11, label: "11팀" },
];

export function teamLabel(id: number): string {
  return TEAMS.find((t) => t.id === id)?.label ?? `${id}팀`;
}

// 명단 (스크린샷 기준, 33명). school/grade 는 참고용.
type RawRow = [name: string, teamId: number, school: string, grade: string];

const RAW: RawRow[] = [
  // 1팀(Axis)
  ["권현지", 1, "충남대학교", "2학년"],
  ["김희현", 1, "충남대학교", "1학년"],
  // 2팀(위브)
  ["방민정", 2, "충남대학교", "졸업유예"],
  ["곽희정", 2, "충남대학교", "1학년"],
  ["윤혜은", 2, "한밭대학교", "3학년"],
  // 3팀(CUBE)
  ["조선우", 3, "충남대학교", "1학년"],
  ["박한빈", 3, "충남대학교", "1학년"],
  ["한의정", 3, "충남대학교", "1학년"],
  // 4팀(RGB)
  ["신진영", 4, "한남대학교", "졸업유예"],
  ["김서현", 4, "충남대학교", "1학년"],
  ["이예은", 4, "충남대학교", "2학년"],
  // 5팀(Ai디어뱅크)
  ["김영주", 5, "배재대학교", ""],
  ["이주진", 5, "목원대학교", "2학년"],
  ["정민지", 5, "목원대학교", "1학년"],
  // 6팀(Vertex)
  ["배지애", 6, "충남대학교", "4학년"],
  ["손한별", 6, "충남대학교", "1학년"],
  ["전유림", 6, "목원대학교", "1학년"],
  // 7팀(AiAi)
  ["강응현", 7, "목원대학교", "4학년"],
  ["김재욱", 7, "충남대학교", "2학년"],
  ["안대규", 7, "한남대학교", "3학년"],
  ["유상우", 7, "우송대학교", "3학년"],
  // 8팀(영크크)
  ["김민우", 8, "충남대학교", "2학년"],
  ["박채움", 8, "한밭대학교", "3학년"],
  ["배수찬", 8, "충남대학교", "4학년"],
  ["송유영", 8, "한밭대학교", "4학년"],
  // 9팀(GPU)
  ["박주항", 9, "한남대학교", "1학년"],
  ["이현빈", 9, "충남대학교", "1학년"],
  ["최승민", 9, "한남대학교", "2학년"],
  // 10팀(10sorflow)
  ["최정연", 10, "충남대학교", "3학년"],
  ["김가현", 10, "충남대학교", "2학년"],
  ["김윤철", 10, "한밭대학교", "3학년"],
  ["이조은", 10, "충남대학교", "1학년"],
  // 11팀
  ["우승균", 11, "한밭대학교", "1학년"],
];

export const PARTICIPANTS: Participant[] = RAW.map(([name, teamId, school, grade], i) => ({
  id: `p${i + 1}`,
  name,
  key: normalizeName(name),
  teamId,
  school,
  grade,
}));

export function findParticipantByName(name: string): Participant | undefined {
  const key = normalizeName(name);
  return PARTICIPANTS.find((p) => p.key === key);
}

export function teamSize(teamId: number): number {
  return PARTICIPANTS.filter((p) => p.teamId === teamId).length;
}
