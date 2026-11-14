import { app, utilityProcess } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import type { ExtractedSong } from '../shared/ipc'
import { normalizeSongs } from '../shared/scoreText'
import type { VisionImage } from './score'

// 로컬 OCR(오프라인) — tesseract.js(Node 워커) + tessdata_fast kor/eng.
// Gemini를 쓸 수 없는 교회 PC용 대체 경로. 악보의 가사 줄은 읽히지만 절 구조·멜리스마 처리는 Gemini보다 훨씬 거칠다.

/** 패키징: Contents/Resources/tessdata, 개발: desktop/data/tessdata */
function langPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tessdata') : join(app.getAppPath(), 'data', 'tessdata')
}

/** asar 안의 경로를 언팩 경로로 (worker_threads·wasm은 실제 파일이어야 함) */
function unpacked(p: string): string {
  return p.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked')
}

function workerScriptPath(): string {
  // tesseract.js/src/worker/node/defaultOptions.js 와 동일한 위치
  const pkg = require.resolve('tesseract.js/package.json')
  return unpacked(join(pkg, '..', 'src', 'worker-script', 'node', 'index.js'))
}

/** 노이즈 줄 제거: 라벨("1절", "후렴")은 유지, 저작권·꼬리말 제거, 한글 2자 이상 또는 영문 3자 이상이 있어야 가사 줄로 인정 */
function isLyricLine(l: string): boolean {
  if (/^\d{1,2}\s*[.)절]?\s*$/.test(l) || /^(후렴|chorus)\s*[:.]?\s*$/i.test(l)) return true
  if (/©|ⓒ|CCLI|저작권|All rights|찬송가공회|Copyright/i.test(l)) return false
  const hangul = (l.match(/[가-힣]/g) ?? []).length
  const latin = (l.match(/[A-Za-z]/g) ?? []).length
  const junk = (l.match(/[^가-힣A-Za-z0-9\s.,!?'"()\-~]/g) ?? []).length
  if (junk > Math.max(2, l.length / 3)) return false
  return hangul >= 2 || latin >= 3
}

export async function ocrImages(images: VisionImage[], onProgress?: (i: number, n: number) => void): Promise<string[]> {
  const lp = langPath()
  if (!existsSync(join(lp, 'kor.traineddata'))) {
    throw new Error(`OCR 언어 데이터가 없습니다: ${join(lp, 'kor.traineddata')}`)
  }
  // 메인 프로세스에서는 tesseract.js의 worker_threads가 초기화되지 않으므로 utilityProcess(별도 Node)에서 실행
  const script = join(__dirname, 'ocrProcess.js')
  const child = utilityProcess.fork(script, [], { serviceName: 'seraphim-ocr', stdio: 'pipe' })
  child.stdout?.on('data', (d) => console.log(String(d).trim()))
  child.stderr?.on('data', (d) => console.error(String(d).trim()))
  const timeoutMs = 60_000 + images.length * 120_000
  try {
    const texts = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`OCR 시간 초과(${Math.round(timeoutMs / 1000)}초)`)), timeoutMs)
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`OCR 프로세스가 종료됨(code ${code})`))
      })
      child.on('message', (msg: { id: number; ok: boolean; texts?: string[]; error?: string }) => {
        if (msg.id !== 1) return
        clearTimeout(timer)
        if (msg.ok && msg.texts) resolve(msg.texts)
        else reject(new Error(`OCR 실패: ${msg.error ?? '알 수 없는 오류'}`))
      })
      child.postMessage({
        id: 1,
        langPath: lp,
        workerPath: workerScriptPath(),
        cachePath: join(app.getPath('userData'), 'tessdata-cache'),
        images: images.map((im) => im.base64)
      })
    })
    onProgress?.(images.length, images.length)
    return texts
  } finally {
    child.kill()
  }
}

/** OCR 텍스트(페이지별) → 곡 하나. 번호/후렴 표기는 라벨로, 그 외는 빈 줄 기준 절 */
export function ocrTextToSongs(pages: string[]): ExtractedSong[] {
  const lines: string[] = []
  for (const page of pages) {
    for (const raw of page.split('\n')) {
      const l = raw.replace(/\s{2,}/g, ' ').trim()
      if (!l) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('')
        continue
      }
      if (!isLyricLine(l)) continue
      lines.push(l)
    }
    if (lines.length && lines[lines.length - 1] !== '') lines.push('')
  }
  // 빈 줄 기준 블록 → verses. 블록 첫 줄이 "1." "1절" "후렴"이면 라벨
  const verses: { label: string; lines: string[] }[] = []
  let cur: { label: string; lines: string[] } | null = null
  const flush = (): void => {
    if (cur && cur.lines.length) verses.push(cur)
    cur = null
  }
  for (const l of lines) {
    if (l === '') {
      flush()
      continue
    }
    const m = l.match(/^(\d{1,2})\s*[.)절]\s*(.*)$/)
    const chorus = /^(후렴|chorus)\s*[:.]?\s*(.*)$/i.exec(l)
    if (m || chorus) {
      flush()
      cur = { label: m ? `${m[1]}절` : '후렴', lines: [] }
      const rest = (m ? m[2] : chorus?.[2]) ?? ''
      if (rest.trim()) cur.lines.push(rest.trim())
      continue
    }
    if (!cur) cur = { label: '', lines: [] }
    cur.lines.push(l)
  }
  flush()
  return normalizeSongs({ songs: [{ title: '', verses }] })
}
