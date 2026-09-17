import { useEffect, useState } from 'react'
import type { DataDirInfo, DbStats } from '@shared/ipc'

interface Props {
  onClose: () => void
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-line/60 text-sm">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-100 text-right break-all">{value}</span>
    </div>
  )
}

/** 설정 화면 — 데이터 폴더(멀티 PC 이동성) + DB 현황 */
export function SettingsModal({ onClose }: Props): JSX.Element {
  const [info, setInfo] = useState<DataDirInfo | null>(null)
  const [stats, setStats] = useState<DbStats | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setInfo(await window.seraphim.getDataDir())
    setStats(await window.seraphim.dbStats())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const changeFolder = async (): Promise<void> => {
    setBusy(true)
    try {
      setInfo(await window.seraphim.chooseDataDir())
      setStats(await window.seraphim.dbStats())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-full max-h-full overflow-auto rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">⚙️ 설정 — 데이터 폴더 / 저장소</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg leading-none px-2"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 데이터 폴더 */}
          <section>
            <h3 className="text-sm font-semibold text-accent mb-2">데이터 저장 폴더</h3>
            <div className="rounded-lg bg-panel2/60 border border-line p-3">
              <Row label="폴더" value={info?.dataDir ?? '…'} />
              <Row label="DB 파일" value={info?.dbPath ?? '…'} />
              <Row
                label="동기화 폴더"
                value={
                  info?.looksSynced ? (
                    <span className="text-emerald-400">감지됨 (멀티 PC 공유 가능)</span>
                  ) : (
                    <span className="text-slate-400">아님</span>
                  )
                }
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => void changeFolder()}
                disabled={busy}
                className="px-3 py-2 rounded bg-accent/20 border border-accent text-sm text-white hover:bg-accent/30 disabled:opacity-50"
              >
                폴더 변경…
              </button>
              <button
                onClick={() => void window.seraphim.openDataDir()}
                className="px-3 py-2 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500"
              >
                폴더 열기
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              이 폴더에 DB와 모든 미디어가 저장됩니다. 미디어는 폴더 기준 <b>상대경로</b>로 저장되어
              PC가 바뀌어도 깨지지 않습니다. 이 폴더를 구글드라이브·드롭박스·원드라이브 동기화 폴더로
              지정하면 여러 PC에서 자동 공유됩니다.
              <br />
              <span className="text-amber-400">
                ※ 동기화 폴더에서는 두 PC에서 동시에 편집하지 마세요(집에서 편집 → 교회에서 송출 권장).
              </span>
            </p>
          </section>

          {/* 백업/복원 */}
          <section>
            <h3 className="text-sm font-semibold text-accent mb-2">백업 / 복원 (.zip)</h3>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const p = await window.seraphim.exportBackup()
                  if (p) alert(`내보내기 완료:\n${p}`)
                }}
                className="px-3 py-2 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500"
              >
                내보내기…
              </button>
              <button
                onClick={async () => {
                  const ok = await window.seraphim.importBackup()
                  if (ok) {
                    await refresh()
                    alert('가져오기 완료. 라이브러리를 새로고침했습니다.')
                    location.reload()
                  }
                }}
                className="px-3 py-2 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500"
              >
                가져오기…
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
              DB와 모든 미디어를 하나의 .zip으로 묶어 USB로 옮기거나 보관할 수 있습니다. 오프라인
              교회 PC에서 “가져오기”로 그대로 복원됩니다.
            </p>
          </section>

          {/* DB 현황 */}
          <section>
            <h3 className="text-sm font-semibold text-accent mb-2">데이터베이스 현황</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['스키마 버전', stats?.schemaVersion],
                ['곡', stats?.songs],
                ['절(가사)', stats?.verses],
                ['플레이리스트', stats?.playlists],
                ['성경 슬라이드', stats?.bibleSlides],
                ['미디어', stats?.media]
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-lg bg-panel2/60 border border-line p-3">
                  <div className="text-[11px] text-slate-400">{label}</div>
                  <div className="text-xl font-bold text-slate-100">{v ?? '—'}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
