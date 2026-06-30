// FaithOps AI Studio - Slack 전송 API
// Webhook URL 은 요청 본문 또는 SLACK_WEBHOOK_URL 환경변수에서 가져온다.

import { NextResponse } from 'next/server';
import { sendToSlack } from '@/lib/slack';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { text?: string; webhookUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ error: '전송할 메시지가 비어 있습니다.' }, { status: 400 });
  }

  const webhookUrl = body.webhookUrl || process.env.SLACK_WEBHOOK_URL || '';
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Slack Webhook URL 이 설정되지 않았습니다. 설정 화면 또는 환경변수에 등록하세요.' },
      { status: 400 }
    );
  }

  const result = await sendToSlack(webhookUrl, text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
