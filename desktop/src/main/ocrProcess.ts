// OCR 유틸리티 프로세스 — Electron utilityProcess.fork()로 실행되는 별도 Node 프로세스.
// 메인 프로세스 안에서는 tesseract.js의 worker_threads가 동작하지 않아(초기화 정지) 여기서 돌린다.
// 메시지: { id, langPath, workerPath, images: base64[] } → { id, ok, texts? , error? }
import { createWorker } from 'tesseract.js'

interface Req {
  id: number
  langPath: string
  workerPath: string
  cachePath: string
  images: string[]
}

const port = process.parentPort

async function run(req: Req): Promise<string[]> {
  const worker = await createWorker('kor+eng', 1, {
    workerPath: req.workerPath,
    langPath: req.langPath,
    cachePath: req.cachePath,
    gzip: false,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status && (m.progress === 0 || m.progress === 1)) console.log(`[ocr-process] ${m.status} ${m.progress}`)
    },
    errorHandler: (e: unknown) => console.error('[ocr-process] worker error:', e instanceof Error ? e.message : String(e))
  })
  try {
    const out: string[] = []
    for (const b64 of req.images) {
      const { data } = await worker.recognize(Buffer.from(b64, 'base64'))
      out.push(data.text)
    }
    return out
  } finally {
    await worker.terminate().catch(() => undefined)
  }
}

port.on('message', (e: { data: Req }) => {
  const req = e.data
  run(req).then(
    (texts) => port.postMessage({ id: req.id, ok: true, texts }),
    (err) => port.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  )
})
