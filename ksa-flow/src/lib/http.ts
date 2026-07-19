import { NextResponse } from "next/server";
import { AppError } from "./errors";
import type { Actor } from "./roles";
import { getActor } from "./session";

/** 서비스 계층 에러를 HTTP 응답으로 변환 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.code ?? "ERROR", message: err.message },
      { status: err.status },
    );
  }
  console.error("[unhandled]", err);
  return NextResponse.json(
    { error: "INTERNAL", message: "서버 오류" },
    { status: 500 },
  );
}

/**
 * handler 이중 검사: 미인증이면 401.
 * (미들웨어가 1차로 막지만, SPEC §9에 따라 handler에서도 재확인)
 */
export async function requireActor(): Promise<Actor | NextResponse> {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return actor;
}

/** 요청 body를 안전하게 JSON 파싱 */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
