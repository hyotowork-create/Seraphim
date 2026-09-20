import { useEffect, useMemo, useState } from 'react'
import { buildBulletinHtml, type BulletinData } from '@shared/bulletin'
import type { Playlist } from '@shared/ipc'
import { useUi } from '../store/ui'

const linesToArr = (s: string): string[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function Labeled({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent'

/** 온라인 주보 발행 — 예배 데이터 폼 + 실시간 미리보기 + HTML 저장 + QR */
export function BulletinModal(): JSX.Element | null {
  const open = useUi((s) => s.bulletinOpen)
  const close = useUi((s) => s.closeBulletin)

  const [church, setChurch] = useState('')
  const [serviceType, setServiceType] = useState('주일예배')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [orderText, setOrderText] = useState('예배로의 부름, 인도자\n찬양, 다같이\n대표기도, \n말씀, ')
  const [songsText, setSongsText] = useState('')
  const [sermonTitle, setSermonTitle] = useState('')
  const [sermonPassage, setSermonPassage] = useState('')
  const [sermonPreacher, setSermonPreacher] = useState('')
  const [annText, setAnnText] = useState('')
  const [offering, setOffering] = useState('')
  const [prayerText, setPrayerText] = useState('')

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [playlistId, setPlaylistId] = useState<number | ''>('')
  const [publicUrl, setPublicUrl] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQr(null)
    setSavedPath(null)
    void window.seraphim.listPlaylists().then(setPlaylists)
  }, [open])

  const data: BulletinData = useMemo(
    () => ({
      churchName: church,
      serviceType,
      date,
      order: linesToArr(orderText).map((l) => {
        const [name, person] = l.split(',').map((x) => x.trim())
        return { name, person: person || undefined }
      }),
      songs: linesToArr(songsText),
      sermon: { title: sermonTitle, passage: sermonPassage, preacher: sermonPreacher },
      announcements: linesToArr(annText),
      offering,
      prayer: linesToArr(prayerText)
    }),
    [church, serviceType, date, orderText, songsText, sermonTitle, sermonPassage, sermonPreacher, annText, offering, prayerText]
  )

  if (!open) return null

  const loadPlaylistSongs = async (): Promise<void> => {
    if (playlistId === '') return
    const items = await window.seraphim.playlistItems(Number(playlistId))
    const titles = items.filter((i) => i.itemType === 'song').map((i) => i.title)
    setSongsText(titles.join('\n'))
  }

  const publish = async (): Promise<void> => {
    const p = await window.seraphim.publishBulletin(data)
    if (p) setSavedPath(p)
    void window.seraphim.saveBulletin(data)
  }

  const makeQr = async (): Promise<void> => {
    if (!publicUrl.trim()) return
    setQr(await window.seraphim.bulletinQr(publicUrl.trim()))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={close}>
      <div
        className="w-[1100px] max-w-full h-[88vh] flex flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line bg-panel2">
          <span className="font-semibold text-slate-100">온라인 주보 발행</span>
          <button onClick={close} className="text-slate-400 hover:text-white text-lg px-2">
            ✕
          </button>
        </div>

        <div className="flex-1 grid grid-cols-[1fr_400px] min-h-0">
          {/* 폼 */}
          <div className="overflow-auto p-5 space-y-3 border-r border-line">
            <div className="grid grid-cols-3 gap-2">
              <Labeled label="교회명">
                <input value={church} onChange={(e) => setChurch(e.target.value)} className={inputCls} placeholder="○○교회" />
              </Labeled>
              <Labeled label="예배 종류">
                <input value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={inputCls} />
              </Labeled>
              <Labeled label="날짜">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </Labeled>
            </div>

            <Labeled label="예배 순서 (한 줄에 하나: 순서명, 담당자)">
              <textarea value={orderText} onChange={(e) => setOrderText(e.target.value)} rows={5} className={inputCls} />
            </Labeled>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-slate-400">찬양 (플레이리스트 자동 연동)</span>
                <select
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value ? Number(e.target.value) : '')}
                  className="bg-black/40 border border-line rounded px-1 py-0.5 text-[11px] text-slate-100"
                >
                  <option value="">플레이리스트 선택</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.itemCount})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void loadPlaylistSongs()}
                  disabled={playlistId === ''}
                  className="text-[11px] px-2 py-0.5 rounded bg-accent/20 border border-accent text-white hover:bg-accent/30 disabled:opacity-40"
                >
                  불러오기
                </button>
              </div>
              <textarea value={songsText} onChange={(e) => setSongsText(e.target.value)} rows={3} className={inputCls} placeholder="곡 제목 (한 줄에 하나)" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Labeled label="설교 제목">
                <input value={sermonTitle} onChange={(e) => setSermonTitle(e.target.value)} className={inputCls} />
              </Labeled>
              <Labeled label="본문 (장·절)">
                <input value={sermonPassage} onChange={(e) => setSermonPassage(e.target.value)} className={inputCls} placeholder="요 3:16" />
              </Labeled>
              <Labeled label="설교자">
                <input value={sermonPreacher} onChange={(e) => setSermonPreacher(e.target.value)} className={inputCls} />
              </Labeled>
            </div>

            <Labeled label="광고 (한 줄에 하나)">
              <textarea value={annText} onChange={(e) => setAnnText(e.target.value)} rows={3} className={inputCls} />
            </Labeled>
            <Labeled label="헌금 계좌">
              <textarea value={offering} onChange={(e) => setOffering(e.target.value)} rows={2} className={inputCls} placeholder="○○은행 000-00-0000 (예금주)" />
            </Labeled>
            <Labeled label="기도 제목 (한 줄에 하나, 선택)">
              <textarea value={prayerText} onChange={(e) => setPrayerText(e.target.value)} rows={2} className={inputCls} />
            </Labeled>

            {/* QR */}
            <div className="pt-2 border-t border-line">
              <div className="text-[11px] text-slate-400 mb-1">
                공개 URL → QR (주보를 호스팅한 주소; 예: GitHub Pages/Netlify)
              </div>
              <div className="flex items-center gap-2">
                <input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} className={inputCls} placeholder="https://..." />
                <button onClick={() => void makeQr()} className="text-xs px-3 py-1 rounded bg-panel2 border border-line text-slate-200 hover:border-slate-500 shrink-0">
                  QR 생성
                </button>
              </div>
              {qr && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={qr} alt="QR" className="w-28 h-28 bg-white p-1 rounded" />
                  <a href={qr} download={`qr-${date}.png`} className="text-xs text-accent underline">
                    QR 이미지 저장
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="flex flex-col min-h-0 p-3 gap-2">
            <div className="text-[11px] text-slate-400">미리보기 (모바일 폭)</div>
            <div className="flex-1 min-h-0 rounded-md overflow-hidden bg-white flex justify-center">
              <iframe title="주보 미리보기" srcDoc={buildBulletinHtml(data)} className="w-[390px] h-full border-0" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 h-14 border-t border-line bg-panel2">
          <span className="text-[11px] text-slate-500">
            {savedPath ? `저장됨: ${savedPath}` : '발행 전 미리보기로 확인하세요.'}
          </span>
          <div className="flex gap-2">
            <button onClick={close} className="px-4 py-2 rounded bg-panel border border-line text-sm text-slate-200 hover:border-slate-500">
              닫기
            </button>
            <button onClick={() => void publish()} className="px-4 py-2 rounded bg-accent/30 border border-accent text-sm text-white hover:bg-accent/40">
              HTML 저장 · 발행
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
