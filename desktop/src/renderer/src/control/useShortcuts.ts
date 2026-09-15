import { useEffect } from 'react'
import { useLive } from '../store/live'

/** 단축키: Space(다음) / Backspace(이전) / B(검정) / L(로고) / P(일시정지)
 *  다음/이전은 슬라이드 목록 연동(M2/M3) 후 활성화. B/L/P는 M0부터 동작. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      // 입력 필드에서는 단축키 무시 (타이핑 방해 방지)
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return

      const { state, patch } = useLive.getState()
      switch (e.key) {
        case ' ':
          e.preventDefault()
          // TODO(M2/M3): 다음 슬라이드
          break
        case 'Backspace':
          e.preventDefault()
          // TODO(M2/M3): 이전 슬라이드
          break
        case 'b':
        case 'B':
          e.preventDefault()
          void patch({ blackout: !state.blackout })
          break
        case 'l':
        case 'L':
          e.preventDefault()
          void patch({ showLogo: !state.showLogo })
          break
        case 'p':
        case 'P':
          e.preventDefault()
          void patch({ paused: !state.paused })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
