import { useEffect } from 'react'
import { useLive } from '../store/live'
import { useDeck } from '../store/deck'
import { CAMERA_SLOT_COUNT, resolveCameraLayers } from '@shared/stream'

/** 글자를 입력하는 칸인지 (슬라이더·체크박스는 아님 — 줌 슬라이더를 만진 뒤에도 단축키가 먹도록) */
function isTypingTarget(t: HTMLElement): boolean {
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  if (t.tagName !== 'INPUT') return false
  const type = ((t as HTMLInputElement).type || 'text').toLowerCase()
  return !['range', 'checkbox', 'radio', 'button', 'color'].includes(type)
}

/** 단축키: Space(다음) / Backspace(이전) / B(검정) / L(로고) / P(일시정지) / 1 2 3(카메라 전환) / + − 0(화면에 나가는 카메라 줌 인·아웃·원래대로)
 *  다음/이전은 슬라이드 목록 연동(M2/M3) 후 활성화. B/L/P는 M0부터 동작. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      // 글자 입력 칸에서는 단축키 무시 (타이핑 방해 방지)
      if (isTypingTarget(t)) return
      // ⌘/Ctrl/Alt 조합(앱 확대 ⌘+ 등)은 건드리지 않음
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const { state, patch } = useLive.getState()
      const vis = resolveCameraLayers(state.cameras, state.activeCamera, 'program').visible
      const zoom = vis != null ? state.cameras[vis].view.zoom : 1
      // 1·2·3: 카메라 전환 (연결된 카메라만)
      if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1
        if (n < CAMERA_SLOT_COUNT && state.cameras[n]?.deviceId) {
          e.preventDefault()
          void patch({ activeCamera: n })
        }
        return
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          void useDeck.getState().next()
          break
        case 'Backspace':
          e.preventDefault()
          void useDeck.getState().prev()
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
        case '+':
        case '=':
          e.preventDefault()
          void patch({ camera: { zoom: Math.round((zoom + 0.25) * 4) / 4 } })
          break
        case '-':
        case '_':
          e.preventDefault()
          void patch({ camera: { zoom: Math.round((zoom - 0.25) * 4) / 4 } })
          break
        case '0':
          e.preventDefault()
          void patch({ camera: { zoom: 1, x: 0.5, y: 0.5 } })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
