import { useEffect, useRef, useState } from 'react'

function fmt(sec: number): string {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** [7] 오디오 — MP3 재생(재생바·볼륨·곡명) */
export function AudioPanel(): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [name, setName] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const pick = async (): Promise<void> => {
    const r = await window.seraphim.pickAudio()
    if (!r) return
    setName(r.name)
    const el = audioRef.current
    if (el) {
      el.src = r.url
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  const toggle = (): void => {
    const el = audioRef.current
    if (!el || !el.src) return
    if (el.paused) void el.play().then(() => setPlaying(true))
    else {
      el.pause()
      setPlaying(false)
    }
  }

  const seek = (v: number): void => {
    const el = audioRef.current
    if (el) el.currentTime = v
    setTime(v)
  }

  return (
    <div className="flex flex-col border border-line rounded-lg bg-panel2/40 p-2 gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">[7] 오디오</span>
        <button
          onClick={() => void pick()}
          className="text-[11px] px-2 py-0.5 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500"
        >
          MP3 열기
        </button>
      </div>

      <div className="text-[11px] text-slate-400 truncate">{name ?? '선택된 곡 없음'}</div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-full bg-accent/20 border border-accent text-white hover:bg-accent/30 shrink-0"
          title={playing ? '일시정지' : '재생'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>{fmt(time)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <span>🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
      </label>

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        hidden
      />
    </div>
  )
}
