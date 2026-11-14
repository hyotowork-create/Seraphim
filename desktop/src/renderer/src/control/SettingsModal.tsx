import { useEffect, useState } from 'react'
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_PRECISE_MODEL, GEMINI_MODEL_CHOICES, SONG_CATEGORIES, BUNDLED_BIBLE_CODE, BIBLE_TRANSLATION_NAMES, type BibleTranslationInfo, type DupGroup, type ImportReport, type DataDirInfo, type DbStats, type ExtractMethod } from '@shared/ipc'
import { SyncInput } from '../components/SyncField'

/** 악보 가사 추출 설정 — Gemini API 키(무료 티어) + 방식 */
function GeminiSection(): JSX.Element {
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [method, setMethod] = useState<ExtractMethod>('gemini')
  const [saved, setSaved] = useState(false)
  const [model, setModel] = useState('')
  const [preciseModel, setPreciseModel] = useState('')

  useEffect(() => {
    void window.seraphim.hasGeminiKey().then(setHasKey)
    void window.seraphim.getSetting('extract.method').then((m) => {
      if (m === 'ocr' || m === 'gemini') setMethod(m)
    })
    void window.seraphim.getSetting('gemini.model').then((m) => setModel(m ?? ''))
    void window.seraphim.getSetting('gemini.model.precise').then((m) => setPreciseModel(m ?? ''))
  }, [])

  const commitModel = (): void => {
    void window.seraphim.setSetting('gemini.model', model.trim())
  }
  const commitPreciseModel = (): void => {
    void window.seraphim.setSetting('gemini.model.precise', preciseModel.trim())
  }

  const saveKey = async (): Promise<void> => {
    await window.seraphim.setGeminiKey(key)
    setKey('')
    setHasKey(await window.seraphim.hasGeminiKey())
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const changeMethod = (m: ExtractMethod): void => {
    setMethod(m)
    void window.seraphim.setSetting('extract.method', m)
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-accent mb-2">악보 가사 추출 (Gemini)</h3>
      <div className="rounded-lg bg-panel2/60 border border-line p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-20 shrink-0">API 키</span>
          <SyncInput
            type="password"
            value={key}
            onValue={setKey}
            placeholder={hasKey ? '저장됨 (다시 입력해 변경)' : 'Gemini API 키 입력'}
            className="flex-1 bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <button
            onClick={() => void saveKey()}
            disabled={!key.trim()}
            className="px-3 py-1 rounded bg-accent/20 border border-accent text-sm text-white hover:bg-accent/30 disabled:opacity-40"
          >
            {saved ? '저장됨' : '저장'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-20 shrink-0">모델</span>
          <SyncInput
            value={model}
            onValue={setModel}
            onBlur={commitModel}
            list="gemini-model-choices"
            placeholder={`비우면 기본값 (${DEFAULT_GEMINI_MODEL})`}
            className="flex-1 bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <datalist id="gemini-model-choices">
            {GEMINI_MODEL_CHOICES.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-20 shrink-0">정밀 모델</span>
          <SyncInput
            value={preciseModel}
            onValue={setPreciseModel}
            onBlur={commitPreciseModel}
            list="gemini-model-choices"
            placeholder={`비우면 기본값 (${DEFAULT_GEMINI_PRECISE_MODEL})`}
            className="flex-1 bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent"
          />
        </div>
        <p className="text-[11px] text-slate-500">
          정밀 모델은 글자가 작은 악보나 1차 추출이 빈약할 때 자동 재시도에 쓰입니다(비용이 조금 더 듭니다).
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-20 shrink-0">추출 방식</span>
          <select
            value={method}
            onChange={(e) => changeMethod(e.target.value as ExtractMethod)}
            className="bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100"
          >
            <option value="gemini">Gemini Vision (온라인)</option>
            <option value="ocr">로컬 OCR (오프라인 · 정확도 낮음)</option>
          </select>
          <span className={'text-[11px] ' + (hasKey ? 'text-emerald-400' : 'text-slate-500')}>
            {hasKey ? '● 키 저장됨' : '키 없음'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          키는 이 PC에 안전하게 저장됩니다(가능 시 OS 암호화). Google AI Studio에서 무료로 발급받을 수
          있습니다. 라이브러리 상단 “악보” 버튼으로 악보 사진·PDF에서 가사를 추출하세요. Google이 모델을
          종료하면 위 모델명만 새 모델로 바꾸면 됩니다.
        </p>
      </div>
    </section>
  )
}

/** 곡 가져오기 — 교회가 가진 찬양 PPT/텍스트/JSON을 곡·절로 나눠 DB에 넣는다 */
function ImportSection(): JSX.Element {
  const [category, setCategory] = useState<string>(SONG_CATEGORIES[1] ?? SONG_CATEGORIES[0])
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'overwrite'>('skip')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)

  const run = async (): Promise<void> => {
    const paths = await window.seraphim.pickImportFiles()
    if (!paths.length) return
    setBusy(true)
    setReport(null)
    try {
      const r = await window.seraphim.importSongs(paths, { category, onDuplicate })
      setReport(r)
      if (r.imported + r.overwritten > 0) window.dispatchEvent(new Event('seraphim:songs-changed'))
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
      setReport({ imported: 0, overwritten: 0, skipped: 0, failed: [{ file: '가져오기', reason: m }], titles: [] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-accent mb-2">곡 가져오기 (PPT · 텍스트 · JSON)</h3>
      <div className="rounded-lg bg-panel2/60 border border-line p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 w-20 shrink-0">카테고리</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100"
            title="장 번호가 없는 곡에 붙일 카테고리 (장 번호가 있으면 새찬송가)"
          >
            {SONG_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400 shrink-0 ml-2">중복 시</span>
          <select
            value={onDuplicate}
            onChange={(e) => setOnDuplicate(e.target.value as 'skip' | 'overwrite')}
            className="bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100"
          >
            <option value="skip">건너뛰기</option>
            <option value="overwrite">덮어쓰기</option>
          </select>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="ml-auto px-3 py-1 rounded bg-accent/20 border border-accent text-sm text-white hover:bg-accent/30 disabled:opacity-40"
          >
            {busy ? '가져오는 중…' : '파일/폴더 선택…'}
          </button>
        </div>
        {report && (
          <div className="text-[11px] text-slate-300 space-y-1">
            <div>
              <b className="text-emerald-400">{report.imported}곡 추가</b>
              {report.overwritten > 0 && <> · {report.overwritten}곡 덮어씀</>}
              {report.skipped > 0 && <> · {report.skipped}곡 중복 건너뜀</>}
              {report.failed.length > 0 && <> · <span className="text-red-400">{report.failed.length}개 파일 실패</span></>}
            </div>
            {report.titles.length > 0 && (
              <div className="text-slate-400 max-h-24 overflow-auto">{report.titles.join(' · ')}</div>
            )}
            {report.failed.slice(0, 5).map((f) => (
              <div key={f.file} className="text-red-400">
                {f.file}: {f.reason}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          PPT는 파일 하나가 곡 하나(제목은 파일명), 슬라이드 하나가 절 하나로 들어옵니다. 한 PPT에 곡이 여러 개면 짧은 제목
          슬라이드를 기준으로 나눕니다. 텍스트 파일은 첫 줄이 제목("478장 참 아름다워라" 형식이면 장 번호 인식), 이후 빈 줄로
          절을 구분합니다. 폴더를 고르면 안의 파일을 모두 가져옵니다. 같은 장 번호나 제목이 있으면 중복으로 봅니다.
        </p>
      </div>
    </section>
  )
}

/** 유사 제목 곡 정리 — 같은 제목(공백·구두점·끝 조사 무시)끼리 묶어 하나만 남김 */
function DedupSection(): JSX.Element {
  const [groups, setGroups] = useState<DupGroup[] | null>(null)
  const [keep, setKeep] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const scan = async (): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      const g = await window.seraphim.dupGroups()
      setGroups(g)
      setKeep(Object.fromEntries(g.map((x) => [x.key, x.recommendedKeepId])))
      if (!g.length) setMsg('유사한 제목의 곡이 없습니다.')
    } finally {
      setBusy(false)
    }
  }

  const mergeOne = async (g: DupGroup): Promise<void> => {
    const keepId = keep[g.key] ?? g.recommendedKeepId
    const removeIds = g.songs.filter((s) => s.id !== keepId).map((s) => s.id)
    if (!removeIds.length) return
    const keepTitle = g.songs.find((s) => s.id === keepId)?.title ?? ''
    if (!confirm(`"${keepTitle}"만 남기고 ${removeIds.length}곡을 삭제할까요?\n플레이리스트와 악보 연결은 남기는 곡으로 옮겨집니다.`)) return
    setBusy(true)
    try {
      await window.seraphim.mergeSongs(keepId, removeIds)
      setGroups((prev) => (prev ?? []).filter((x) => x.key !== g.key))
      window.dispatchEvent(new Event('seraphim:songs-changed'))
    } finally {
      setBusy(false)
    }
  }

  const mergeAll = async (): Promise<void> => {
    if (!groups?.length) return
    const total = groups.reduce((n, g) => n + g.songs.length - 1, 0)
    if (!confirm(`${groups.length}개 묶음에서 추천(또는 선택)한 곡만 남기고 ${total}곡을 삭제할까요?`)) return
    setBusy(true)
    try {
      for (const g of groups) {
        const keepId = keep[g.key] ?? g.recommendedKeepId
        await window.seraphim.mergeSongs(keepId, g.songs.filter((s) => s.id !== keepId).map((s) => s.id))
      }
      setGroups([])
      setMsg(`${total}곡을 정리했습니다.`)
      window.dispatchEvent(new Event('seraphim:songs-changed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-accent mb-2">유사 제목 곡 정리</h3>
      <div className="rounded-lg bg-panel2/60 border border-line p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void scan()}
            disabled={busy}
            className="px-3 py-1 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40"
          >
            {busy ? '처리 중…' : '유사 곡 찾기'}
          </button>
          {groups && groups.length > 0 && (
            <>
              <span className="text-[11px] text-slate-400">{groups.length}개 묶음</span>
              <button
                onClick={() => void mergeAll()}
                disabled={busy}
                className="ml-auto px-3 py-1 rounded bg-accent/20 border border-accent text-sm text-white hover:bg-accent/30 disabled:opacity-40"
              >
                모두 정리 (선택한 곡만 남김)
              </button>
            </>
          )}
        </div>
        {msg && <div className="text-[11px] text-slate-300">{msg}</div>}
        {groups && groups.length > 0 && (
          <div className="max-h-72 overflow-auto space-y-2">
            {groups.map((g) => (
              <div key={g.key} className="rounded border border-line bg-black/20 p-2">
                {g.songs.map((sg) => (
                  <label key={sg.id} className="flex items-center gap-2 text-[12px] text-slate-200 py-0.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`keep-${g.key}`}
                      checked={(keep[g.key] ?? g.recommendedKeepId) === sg.id}
                      onChange={() => setKeep((k) => ({ ...k, [g.key]: sg.id }))}
                      className="accent-accent"
                    />
                    <span className="truncate">
                      {sg.hymnNo != null && <span className="text-accent">{sg.hymnNo}장 </span>}
                      {sg.title}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {sg.category} · {sg.verseCount}절 {sg.lineCount}줄{sg.author ? ` · ${sg.author}` : ''}
                      {sg.hasScore ? ' · 악보' : ''}
                      {sg.playlistCount ? ` · 플레이리스트 ${sg.playlistCount}` : ''}
                    </span>
                  </label>
                ))}
                <div className="text-right mt-1">
                  <button
                    onClick={() => void mergeOne(g)}
                    disabled={busy}
                    className="text-[11px] px-2 py-0.5 rounded border border-line bg-panel2 text-slate-200 hover:border-slate-500 disabled:opacity-40"
                  >
                    선택한 곡만 남기기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          공백·구두점과 끝 조사(은/는/이/가/을/를)만 다른 제목을 같은 곡으로 봅니다. 찬송가는 장 번호가 같을 때만 묶습니다. 추천은
          장 번호가 있는 곡, 악보가 붙은 곡, 가사가 긴 곡 순입니다. 남기는 곡으로 플레이리스트 항목과 악보 연결이 옮겨집니다.
        </p>
      </div>
    </section>
  )
}

/** 성경 본문 — 내장 개역한글(저작권 만료) + 교회가 가진 번역본 파일 가져오기 */
function BibleTextSection(): JSX.Element {
  const [list, setList] = useState<BibleTranslationInfo[]>([])
  const [code, setCode] = useState('NKRV')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = async (): Promise<void> => setList(await window.seraphim.listBibleTranslations())
  useEffect(() => {
    void refresh()
  }, [])

  const installBundled = async (): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      const n = await window.seraphim.installBundledBible()
      setMsg(`개역한글 ${n.toLocaleString()}절 설치 완료`)
      await refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const importText = async (): Promise<void> => {
    const paths = await window.seraphim.pickBibleTextFiles()
    if (!paths.length) return
    setBusy(true)
    setMsg('')
    try {
      const r = await window.seraphim.importBibleText(paths, code, name || BIBLE_TRANSLATION_NAMES[code.toUpperCase()] || code)
      setMsg(`${r.name}(${r.code}) ${r.inserted.toLocaleString()}절 가져옴${r.unparsed ? ` · 해석 못 한 줄 ${r.unparsed}` : ''}`)
      await refresh()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setMsg(m.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, ''))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (c: string): Promise<void> => {
    if (!confirm(`${BIBLE_TRANSLATION_NAMES[c] ?? c} 번역본을 삭제할까요?`)) return
    await window.seraphim.removeBibleTranslation(c)
    await refresh()
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-accent mb-2">성경 본문 (구절 입력 → 본문 불러오기)</h3>
      <div className="rounded-lg bg-panel2/60 border border-line p-3 space-y-2">
        <div className="space-y-1">
          {list.length === 0 && <div className="text-[11px] text-slate-500">설치된 번역본이 없습니다.</div>}
          {list.map((t) => (
            <div key={t.code} className="flex items-center gap-2 text-sm">
              <span className="text-slate-100">{t.name}</span>
              <span className="text-[11px] text-slate-500">
                {t.code} · {t.verseCount.toLocaleString()}절{t.bundled ? ' · 내장' : ''}
              </span>
              {!t.bundled && (
                <button onClick={() => void remove(t.code)} className="ml-auto text-[11px] text-red-300 hover:text-red-200">
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!list.some((t) => t.code === BUNDLED_BIBLE_CODE) && (
            <button
              onClick={() => void installBundled()}
              disabled={busy}
              className="px-3 py-1 rounded bg-accent/20 border border-accent text-sm text-white hover:bg-accent/30 disabled:opacity-40"
            >
              개역한글 설치 (내장)
            </button>
          )}
          <span className="text-xs text-slate-400">번역본 추가</span>
          <SyncInput
            value={code}
            onValue={(v) => setCode(v.toUpperCase())}
            placeholder="코드 (NKRV)"
            className="w-24 bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <SyncInput
            value={name}
            onValue={setName}
            placeholder={BIBLE_TRANSLATION_NAMES[code] ? `이름 (${BIBLE_TRANSLATION_NAMES[code]})` : '이름 (예: 개역개정)'}
            className="w-36 bg-black/40 border border-line rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent"
          />
          <button
            onClick={() => void importText()}
            disabled={busy || code.trim().length < 2}
            className="px-3 py-1 rounded bg-panel2 border border-line text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40"
          >
            {busy ? '처리 중…' : '본문 파일 가져오기…'}
          </button>
        </div>
        {msg && <div className="text-[11px] text-slate-300">{msg}</div>}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          개역한글판(1961)은 저작권이 만료되어 내장되어 있습니다. 개역개정·새번역 등은 대한성서공회 저작권이 있어 교회가
          허가받아 보유한 본문 파일(txt/tsv/csv/json)을 가져와 쓰세요. 한 줄에 한 절, "창1:1 태초에…" 또는 "창세기 1:1 …",
          "책번호[탭]장[탭]절[탭]본문" 형식을 인식합니다. 편집기와 라이브러리의 구절 입력에서 번역본을 고를 수 있습니다.
        </p>
      </div>
    </section>
  )
}

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

          {/* 악보 가사 추출 */}
          <GeminiSection />

          <ImportSection />

          <DedupSection />

          <BibleTextSection />

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
