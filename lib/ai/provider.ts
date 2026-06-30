// FaithOps AI Studio - AI Provider 추상화 (섹션 7.4)
// 모델을 코드에 고정하지 않고 provider 인터페이스를 통해 교체 가능하게 한다.

import type { ProjectInput, GeneratedOutput, OutputType } from '@/lib/types';

export interface AIProvider {
  name: string;
  generate(type: OutputType, input: ProjectInput): Promise<GeneratedOutput>;
  generateAll(
    input: ProjectInput,
    types: OutputType[]
  ): Promise<GeneratedOutput[]>;
}

import { mockProvider } from './mockProvider';
import { claudeProvider, hasClaudeCredentials } from './claudeProvider';

/**
 * 현재 활성화된 provider 를 반환한다.
 * - AI_PROVIDER=claude (또는 미설정 + ANTHROPIC_API_KEY 존재) → 실제 Claude 연동
 * - AI_PROVIDER=mock 또는 키가 없을 때 → mock provider (데모/오프라인)
 *
 * 실제 모델 provider 는 이곳에 등록하며, 키가 없으면 mock 으로 안전하게 폴백한다.
 */
export function getProvider(): AIProvider {
  const selected = process.env.AI_PROVIDER ?? (hasClaudeCredentials() ? 'claude' : 'mock');

  switch (selected) {
    case 'claude':
      // claude 를 선택했지만 키가 없으면 mock 으로 폴백한다.
      return hasClaudeCredentials() ? claudeProvider : mockProvider;
    case 'mock':
      return mockProvider;
    // case 'openai': return openAIProvider;
    // case 'gemini': return geminiProvider;
    default:
      return mockProvider;
  }
}
