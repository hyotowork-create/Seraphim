import {
  useCallback,
  useEffect,
  useRef,
  type CompositionEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type TextareaHTMLAttributes
} from 'react'

// 한글 IME(조합입력) 안전 입력 컴포넌트.
//
// 자음/모음이 분리되는 원인 3가지를 모두 차단한다.
//  1) 제어(controlled) 입력은 조합 중 재렌더로 value가 덮어써지면 조합이 끊긴다.
//     → 비제어(defaultValue)로 렌더하고, DOM 값은 "포커스가 없고 조합 중이 아닐 때만" 외부 값으로 동기화.
//  2) 조합 중(compositionstart~compositionend)에는 외부 value가 바뀌어도 DOM을 건드리지 않는다.
//     (조합이 끝난 뒤 남은 차이가 있으면 그때 동기화)
//  3) 조합 중 Enter/Escape 등 keydown이 부모 핸들러로 전달되면 마지막 글자가 잘리거나 두 번 처리된다.
//     → isComposing(또는 keyCode 229)인 keydown은 부모 onKeyDown에 전달하지 않는다.

type Common = {
  value: string
  onValue: (v: string) => void
}

function useImeSafe<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  onValue: (v: string) => void,
  userKeyDown?: (e: KeyboardEvent<T>) => void,
  userCompStart?: (e: CompositionEvent<T>) => void,
  userCompEnd?: (e: CompositionEvent<T>) => void
) {
  const ref = useRef<T>(null)
  const composing = useRef(false)
  const pending = useRef<string | null>(null)

  const syncDom = useCallback((v: string) => {
    const el = ref.current
    if (!el) return
    if (composing.current) {
      pending.current = v
      return
    }
    if (el.value !== v && document.activeElement !== el) el.value = v
  }, [])

  useEffect(() => {
    syncDom(value)
  }, [value, syncDom])

  const onCompositionStart = (e: CompositionEvent<T>): void => {
    composing.current = true
    userCompStart?.(e)
  }

  const onCompositionEnd = (e: CompositionEvent<T>): void => {
    composing.current = false
    // 조합 완료된 최종 값을 상위로 전달 (일부 IME는 compositionend 뒤 input 이벤트가 오지 않음)
    const el = ref.current
    if (el) onValue(el.value)
    if (pending.current !== null) {
      const v = pending.current
      pending.current = null
      syncDom(v)
    }
    userCompEnd?.(e)
  }

  const onKeyDown = (e: KeyboardEvent<T>): void => {
    // 조합 중 keydown(예: 마지막 글자 입력 중 Enter)은 부모로 전달하지 않음
    if (composing.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    userKeyDown?.(e)
  }

  return { ref, onCompositionStart, onCompositionEnd, onKeyDown }
}

type TAProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value' | 'defaultValue' | 'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd'
> &
  Common & {
    onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
    onCompositionStart?: (e: CompositionEvent<HTMLTextAreaElement>) => void
    onCompositionEnd?: (e: CompositionEvent<HTMLTextAreaElement>) => void
  }

export function SyncTextarea({
  value,
  onValue,
  onKeyDown: userKeyDown,
  onCompositionStart: userCompStart,
  onCompositionEnd: userCompEnd,
  ...rest
}: TAProps): JSX.Element {
  const h = useImeSafe<HTMLTextAreaElement>(value, onValue, userKeyDown, userCompStart, userCompEnd)
  return (
    <textarea
      ref={h.ref}
      defaultValue={value}
      onChange={(e) => onValue(e.target.value)}
      onCompositionStart={h.onCompositionStart}
      onCompositionEnd={h.onCompositionEnd}
      onKeyDown={h.onKeyDown}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      {...rest}
    />
  )
}

type INProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'defaultValue' | 'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd'
> &
  Common & {
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
    onCompositionStart?: (e: CompositionEvent<HTMLInputElement>) => void
    onCompositionEnd?: (e: CompositionEvent<HTMLInputElement>) => void
  }

export function SyncInput({
  value,
  onValue,
  onKeyDown: userKeyDown,
  onCompositionStart: userCompStart,
  onCompositionEnd: userCompEnd,
  ...rest
}: INProps): JSX.Element {
  const h = useImeSafe<HTMLInputElement>(value, onValue, userKeyDown, userCompStart, userCompEnd)
  return (
    <input
      ref={h.ref}
      defaultValue={value}
      onChange={(e) => onValue(e.target.value)}
      onCompositionStart={h.onCompositionStart}
      onCompositionEnd={h.onCompositionEnd}
      onKeyDown={h.onKeyDown}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      {...rest}
    />
  )
}
