// FaithOps AI Studio - Claude Provider (실제 모델 연동)
// Anthropic Claude(Opus 4.8) 로 실제 산출물을 생성한다.
// ANTHROPIC_API_KEY 가 설정되어 있어야 동작하며, 없으면 provider.ts 에서
// mock provider 로 자동 폴백한다.

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider';
import { buildPrompt } from './prompts';
import { mockProvider } from './mockProvider';
import { OUTPUT_META } from '@/lib/types';
import type { ProjectInput, GeneratedOutput, OutputType } from '@/lib/types';

const MODEL = 'claude-opus-4-8';

// 산출물별 출력 분량 상한. 스트리밍을 사용하므로 큰 값도 안전하다.
const MAX_TOKENS: Record<OutputType, number> = {
  bibleAnalysis: 4000,
  sermon: 8000,
  bulletin: 3000,
  pptOutline: 6000,
  youtube: 6000,
  slackReport: 1500,
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic(); // ANTHROPIC_API_KEY 를 환경변수에서 읽는다
  }
  return client;
}

export function hasClaudeCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function generateOne(
  type: OutputType,
  input: ProjectInput
): Promise<GeneratedOutput> {
  const prompt = buildPrompt(type, input);

  // 큰 max_tokens 에서 HTTP 타임아웃을 피하기 위해 스트리밍을 사용한다.
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS[type],
    // 콘텐츠 생성 비용/지연을 고려해 medium effort 를 사용한다.
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });

  const message = await stream.finalMessage();
  const content = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return {
    type,
    title: OUTPUT_META[type].label,
    content: content || '(생성된 내용이 비어 있습니다. 다시 시도해 주세요.)',
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
}

// 단일 산출물 생성이 실패하면 해당 산출물만 mock 으로 폴백한다.
// (예: 일시적 rate limit) 전체 생성이 무너지지 않도록 한다.
async function generateOrFallback(
  type: OutputType,
  input: ProjectInput
): Promise<GeneratedOutput> {
  try {
    return await generateOne(type, input);
  } catch (e) {
    console.error(`[claudeProvider] ${type} 생성 실패, mock 으로 폴백:`, e);
    return mockProvider.generate(type, input);
  }
}

export const claudeProvider: AIProvider = {
  name: 'claude',

  async generate(type, input) {
    return generateOrFallback(type, input);
  },

  async generateAll(input, types) {
    // 여러 산출물을 병렬 생성해 전체 대기시간을 줄인다.
    return Promise.all(types.map((type) => generateOrFallback(type, input)));
  },
};
