import { getDb } from './db'
import { normalizeTitle } from './db/songs'
import type { DupGroup, DupSong } from '../shared/ipc'

// 유사 제목 곡 정리 — 같은(정규화) 제목, 또는 끝 조사(은/는/이/가/을/를)만 다른 제목을 묶어 보여 주고 하나로 합친다

interface Row {
  id: number
  title: string
  hymn_no: number | null
  category: string
  author: string | null
  verseCount: number
  lineCount: number
  scoreCount: number
  playlistCount: number
}

/** 정규화 제목에서 끝 조사 제거(4글자 이상일 때만) — "예수 사랑하심은" ≈ "예수 사랑하심을" */
function looseKey(norm: string): string {
  if (norm.length >= 4) return norm.replace(/(은|는|이|가|을|를|요|여|에|의)$/, '')
  return norm
}

export function findDuplicateGroups(): DupGroup[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.title, s.hymn_no, s.category, s.author,
         (SELECT COUNT(*) FROM verses v WHERE v.song_id = s.id) AS verseCount,
         (SELECT COALESCE(SUM(LENGTH(v.text) - LENGTH(REPLACE(v.text, char(10), '')) + 1), 0) FROM verses v WHERE v.song_id = s.id) AS lineCount,
         (SELECT COUNT(*) FROM song_scores ss WHERE ss.song_id = s.id) AS scoreCount,
         (SELECT COUNT(*) FROM playlist_items p WHERE p.item_type = 'song' AND p.ref_id = s.id) AS playlistCount
       FROM songs s`
    )
    .all() as Row[]
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const key = looseKey(normalizeTitle(r.title))
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  const out: DupGroup[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    // 찬송가끼리 장 번호가 다르면 다른 곡 → 같은 장 번호이거나 장 번호 없는 것끼리만 묶음
    const noHymn = list.filter((r) => r.hymn_no == null)
    const byNo = new Map<number, Row[]>()
    for (const r of list) if (r.hymn_no != null) byNo.set(r.hymn_no, [...(byNo.get(r.hymn_no) ?? []), r])
    const clusters: Row[][] = []
    if (noHymn.length + (byNo.size ? 1 : 0) >= 2 || noHymn.length >= 2) {
      // 장 번호 없는 곡들 + (있다면) 장 번호 있는 곡 하나씩을 한 묶음으로
      const hymnReps = [...byNo.values()].map((l) => l[0])
      const merged = [...hymnReps, ...noHymn]
      if (merged.length >= 2) clusters.push(merged)
    }
    for (const l of byNo.values()) if (l.length >= 2) clusters.push(l)
    for (const c of clusters) {
      const songs: DupSong[] = c.map((r) => ({
        id: r.id,
        title: r.title,
        hymnNo: r.hymn_no,
        category: r.category,
        author: r.author,
        verseCount: r.verseCount,
        lineCount: r.lineCount,
        hasScore: r.scoreCount > 0,
        playlistCount: r.playlistCount
      }))
      // 추천 유지: 장 번호 있는 곡 > 악보 있는 곡 > 줄 수 많은 곡
      const rec = [...songs].sort(
        (a, b) => Number(b.hymnNo != null) - Number(a.hymnNo != null) || Number(b.hasScore) - Number(a.hasScore) || b.lineCount - a.lineCount
      )[0]
      out.push({ key, songs, recommendedKeepId: rec.id })
    }
  }
  return out.sort((a, b) => a.songs[0].title.localeCompare(b.songs[0].title, 'ko'))
}

/** keepId 하나만 남기고 나머지 삭제 — 플레이리스트 항목·악보 연결은 유지 곡으로 옮김 */
export function mergeSongs(keepId: number, removeIds: number[]): number {
  const db = getDb()
  const ids = removeIds.filter((id) => id !== keepId)
  if (!ids.length) return 0
  const tx = db.transaction((): number => {
    const upd = db.prepare("UPDATE playlist_items SET ref_id = ? WHERE item_type = 'song' AND ref_id = ?")
    const nextOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM song_scores WHERE song_id = ?')
    const moveScore = db.prepare('UPDATE song_scores SET song_id = ?, order_index = ? WHERE id = ?')
    const scoresOf = db.prepare('SELECT id FROM song_scores WHERE song_id = ? ORDER BY order_index')
    const del = db.prepare('DELETE FROM songs WHERE id = ?')
    let n = 0
    for (const id of ids) {
      upd.run(keepId, id)
      for (const sc of scoresOf.all(id) as { id: number }[]) {
        const { n: order } = nextOrder.get(keepId) as { n: number }
        moveScore.run(keepId, order, sc.id)
      }
      del.run(id)
      n++
    }
    return n
  })
  return tx()
}
