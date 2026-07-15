import JudgeClient from "./JudgeClient";

export const dynamic = "force-dynamic";

export default async function JudgePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <JudgeClient code={code ?? ""} />;
}
