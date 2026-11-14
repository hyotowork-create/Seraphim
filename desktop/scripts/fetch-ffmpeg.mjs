// Windows용 ffmpeg 정적 바이너리 내려받기 (YouTube 라이브 송출용) — ffmpeg-static 프로젝트의 GitHub 릴리스(b6.1.1, FFmpeg 6.0)
// macOS용은 재배포 가능한 LGPL 빌드를 직접 만든다: scripts/build-ffmpeg-mac.sh (ffmpeg-static의 mac 빌드는 nonfree라 재배포 불가)
// 사용: node scripts/fetch-ffmpeg.mjs            → win32-x64
//       node scripts/fetch-ffmpeg.mjs win32-x64
// 결과: vendor/ffmpeg/<platform>-<arch>/ffmpeg(.exe) — electron-builder가 Resources/ffmpeg/ 로 복사
import { createWriteStream, existsSync, mkdirSync, chmodSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const TAG = 'b6.1.1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['win32-x64']

for (const t of targets) {
  const exe = t.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg'
  const out = join(root, 'vendor', 'ffmpeg', t, exe)
  if (existsSync(out) && statSync(out).size > 1_000_000) {
    console.log(`이미 있음: ${out}`)
    continue
  }
  mkdirSync(dirname(out), { recursive: true })
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}/ffmpeg-${t}.gz`
  console.log(`내려받는 중: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(out))
  if (!t.startsWith('win32')) chmodSync(out, 0o755)
  console.log(`저장: ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`)
}
