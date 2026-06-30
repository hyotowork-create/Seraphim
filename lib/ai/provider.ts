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

/**
 * 현재 활성화된 provider 를 반환한다.
 * AI_PROVIDER 환경변수로 전환할 수 있으며, 실제 모델 provider 는
 * 추후 이 곳에 등록한다. 미구현 provider 는 mock 으로 폴백한다.
 */
export function getProvider(): AIProvider {
  const selected = process.env.AI_PROVIDER ?? 'mock';
  switch (selected) {
    case 'mock':
      return mockProvider;
    // case 'openai': return openAIProvider;
    // case 'claude': return claudeProvider;
    // case 'gemini': return geminiProvider;
    default:
      return mockProvider;
  }
}
