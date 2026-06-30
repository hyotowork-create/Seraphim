// FaithOps AI Studio - 생성 API
// 본문 입력값을 받아 선택된 산출물들을 생성해 반환한다.
// 저장은 클라이언트(localStorage)에서 담당한다.

import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/provider';
import { ALL_OUTPUT_TYPES } from '@/lib/types';
import type { ProjectInput, OutputType } from '@/lib/types';

export const runtime = 'nodejs';

function sanitizeTypes(value: unknown): OutputType[] {
  if (!Array.isArray(value) || value.length === 0) return ALL_OUTPUT_TYPES;
  const filtered = value.filter((t): t is OutputType =>
    ALL_OUTPUT_TYPES.includes(t as OutputType)
  );
  return filtered.length > 0 ? filtered : ALL_OUTPUT_TYPES;
}

export async function POST(request: Request) {
  let body: { input?: Partial<ProjectInput>; types?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const raw = body.input ?? {};
  if (!raw.bibleReference && !raw.bibleText) {
    return NextResponse.json(
      { error: '성경본문 주소 또는 본문 텍스트를 입력하세요.' },
      { status: 400 }
    );
  }

  const input: ProjectInput = {
    bibleReference: raw.bibleReference ?? '',
    bibleText: raw.bibleText ?? '',
    audience: raw.audience ?? '장년부',
    serviceType: raw.serviceType ?? '주일예배',
    sermonLength: raw.sermonLength ?? '10분',
    tone: raw.tone ?? '복음 중심',
    imageStyle: raw.imageStyle ?? '어린이 성경 그림책',
    churchName: raw.churchName,
    departmentName: raw.departmentName,
    serviceDate: raw.serviceDate,
    outputs: sanitizeTypes(body.types),
  };

  const types = sanitizeTypes(body.types);

  try {
    const provider = getProvider();
    const outputs = await provider.generateAll(input, types);
    return NextResponse.json({ outputs, provider: provider.name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
