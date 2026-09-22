import { useEffect, useRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

// 한글 IME(조합입력) 안전 입력 컴포넌트.
// 제어(controlled) 입력은 조합 중 재렌더로 값이 덮어써지면 자음/모음이 분리된다.
// → 비제어(defaultValue) + 외부 값이 바뀌고 포커스가 없을 때만 DOM 값을 동기화.

type TAProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value' | 'defaultValue'> & {
  value: string
  onValue: (v: string) => void
}

export function SyncTextarea({ value, onValue, ...rest }: TAProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.value !== value && document.activeElement !== el) el.value = value
  }, [value])
  return <textarea ref={ref} defaultValue={value} onChange={(e) => onValue(e.target.value)} {...rest} />
}

type INProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'defaultValue'> & {
  value: string
  onValue: (v: string) => void
}

export function SyncInput({ value, onValue, ...rest }: INProps): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.value !== value && document.activeElement !== el) el.value = value
  }, [value])
  return <input ref={ref} defaultValue={value} onChange={(e) => onValue(e.target.value)} {...rest} />
}
