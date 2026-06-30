// FaithOps AI Studio - Slack 전송 헬퍼
// Incoming Webhook 으로 일일보고 메시지를 전송한다.

export interface SlackSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Slack Incoming Webhook 으로 텍스트 메시지를 전송한다.
 * 서버(api/slack)에서 호출하는 것을 권장한다.
 */
export async function sendToSlack(
  webhookUrl: string,
  text: string
): Promise<SlackSendResult> {
  if (!webhookUrl || !/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    return { ok: false, error: '유효한 Slack Webhook URL 이 아닙니다.' };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      return { ok: false, error: `Slack 응답 오류: ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '전송 실패' };
  }
}
