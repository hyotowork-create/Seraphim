import { nativeImage, type NativeImage } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import { SCORE_LOW_RES_EDGE } from '../shared/ipc'

const execFileP = promisify(execFile)

/** Vision 모델에 보내는 이미지의 긴 변 최대 픽셀 (토큰·용량 절약, 악보 글자는 이 해상도면 충분) */
export const VISION_MAX_EDGE = 2000
/** 정밀 모드에서의 긴 변 최대 픽셀 */
export const VISION_MAX_EDGE_PRECISE = 3000

export const HEIC_EXTS = new Set(['.heic', '.heif'])
export const SCORE_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']

export function isHeic(path: string): boolean {
  return HEIC_EXTS.has(extname(path).toLowerCase())
}

/**
 * HEIC/HEIF → JPEG 변환 (+ 긴 변 축소). macOS 내장 `sips` 사용.
 * 다른 OS에서는 지원하지 않으므로 사용자에게 JPG 변환을 안내한다.
 */
export async function convertHeicToJpeg(src: string, dst: string, maxEdge = VISION_MAX_EDGE * 2): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('HEIC 사진은 macOS에서만 자동 변환됩니다. JPG/PNG로 변환한 뒤 선택해 주세요.')
  }
  await execFileP('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', '-Z', String(maxEdge), src, '--out', dst])
}

export interface VisionImage {
  base64: string
  mimeType: string
}

export interface PrepareOptions {
  /** 정밀 모드: 더 큰 해상도 유지 + 작은 이미지는 더 강하게 확대 */
  precise?: boolean
  /** 0~1 비율 영역 — 지정 시 이 영역만 잘라 전송 */
  crop?: { x: number; y: number; w: number; h: number }
}

/** 이미지 픽셀 크기 (읽지 못하면 null) */
export async function imageDims(abs: string): Promise<{ width: number; height: number } | null> {
  const img = await loadImage(abs)
  if (!img || img.isEmpty()) return null
  return img.getSize()
}

async function loadImage(abs: string): Promise<NativeImage | null> {
  if (isHeic(abs)) return null
  const raw = await readFile(abs)
  let img = nativeImage.createFromBuffer(raw)
  if (img.isEmpty()) img = nativeImage.createFromPath(abs)
  return img.isEmpty() ? null : img
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * 악보 파일을 Vision 호출용 이미지로 준비.
 *  - (선택) 영역 잘라내기 → 가사 부분만 보내면 글자가 상대적으로 커져 인식률 상승
 *  - 큰 이미지는 긴 변 VISION_MAX_EDGE(정밀: 3000)로 축소
 *  - 작은 이미지(긴 변 < SCORE_LOW_RES_EDGE)는 2배(정밀: 3배) 확대 — Gemini는 768px 타일 단위로 읽으므로 확대만으로도 인식률이 오름
 *  - JPEG로 전송. 디코딩이 안 되는 형식은 원본 바이트 그대로.
 */
export async function prepareVisionImage(
  abs: string,
  mimeFallback: string,
  opts: PrepareOptions = {}
): Promise<VisionImage> {
  const maxEdge = opts.precise ? VISION_MAX_EDGE_PRECISE : VISION_MAX_EDGE

  let img: NativeImage | null
  if (isHeic(abs)) {
    const dir = await mkdtemp(join(tmpdir(), 'seraphim-heic-'))
    const out = join(dir, 'page.jpg')
    try {
      await convertHeicToJpeg(abs, out, maxEdge)
      img = nativeImage.createFromPath(out)
      if (img.isEmpty()) return { base64: (await readFile(out)).toString('base64'), mimeType: 'image/jpeg' }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  } else {
    img = await loadImage(abs)
    if (!img) return { base64: (await readFile(abs)).toString('base64'), mimeType: mimeFallback }
  }

  if (opts.crop) {
    const { width, height } = img.getSize()
    const x = Math.round(clamp01(opts.crop.x) * width)
    const y = Math.round(clamp01(opts.crop.y) * height)
    const w = Math.max(16, Math.min(width - x, Math.round(clamp01(opts.crop.w) * width)))
    const h = Math.max(16, Math.min(height - y, Math.round(clamp01(opts.crop.h) * height)))
    img = img.crop({ x, y, width: w, height: h })
  }

  const { width, height } = img.getSize()
  const longEdge = Math.max(width, height)
  let scale = 1
  if (longEdge > maxEdge) scale = maxEdge / longEdge
  else if (longEdge < SCORE_LOW_RES_EDGE) scale = Math.min(opts.precise ? 3 : 2, maxEdge / longEdge)
  if (scale !== 1) {
    img = img.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      quality: 'best'
    })
  }
  return { base64: img.toJPEG(opts.precise ? 92 : 88).toString('base64'), mimeType: 'image/jpeg' }
}
