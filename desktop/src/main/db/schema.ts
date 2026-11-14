export interface Migration {
  version: number
  sql: string
}

/**
 * 승인된 스키마 (설계안 §3). 마이그레이션은 append-only — 기존 항목 수정 금지, 새 version 추가.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: /* sql */ `
      CREATE TABLE songs (
        id           INTEGER PRIMARY KEY,
        title        TEXT NOT NULL,
        category     TEXT NOT NULL,
        favorite     INTEGER NOT NULL DEFAULT 0,
        subtitle     TEXT,
        author       TEXT,
        copyright    TEXT,
        last_used_at TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE verses (
        id          INTEGER PRIMARY KEY,
        song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        label       TEXT,
        order_index INTEGER NOT NULL,
        text        TEXT NOT NULL
      );
      CREATE INDEX idx_verses_song ON verses(song_id, order_index);

      CREATE TABLE bible_slides (
        id          INTEGER PRIMARY KEY,
        book        TEXT NOT NULL,
        chapter     INTEGER NOT NULL,
        verse_range TEXT NOT NULL,
        text        TEXT NOT NULL,
        translation TEXT,
        order_index INTEGER
      );

      CREATE TABLE playlists (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE playlist_items (
        id          INTEGER PRIMARY KEY,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        item_type   TEXT NOT NULL,          -- 'song' | 'bible' | 'media' | 'blank' | 'logo'
        ref_id      INTEGER,
        order_index INTEGER NOT NULL,
        bg_media_id INTEGER REFERENCES media(id),
        note        TEXT
      );
      CREATE INDEX idx_playlist_items ON playlist_items(playlist_id, order_index);

      CREATE TABLE media (
        id             INTEGER PRIMARY KEY,
        type           TEXT NOT NULL,       -- background|video|overlay|logo|audio|score
        rel_path       TEXT NOT NULL,       -- 데이터 폴더 기준 상대경로
        name           TEXT NOT NULL,
        thumb_rel_path TEXT,
        duration_ms    INTEGER,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX idx_media_type ON media(type);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE bulletins (
        id           INTEGER PRIMARY KEY,
        service_date TEXT NOT NULL,
        church_name  TEXT,
        service_type TEXT,
        data_json    TEXT NOT NULL,
        playlist_id  INTEGER REFERENCES playlists(id),
        published_url TEXT,
        created_at   TEXT NOT NULL
      );
    `
  },
  {
    version: 2,
    sql: /* sql */ `
      ALTER TABLE songs ADD COLUMN bg_media_id INTEGER REFERENCES media(id);
    `
  },
  {
    // 곡 ↔ 원본 악보 이미지(여러 페이지) 연결 — 재검수/재추출용
    version: 3,
    sql: /* sql */ `
      CREATE TABLE song_scores (
        id          INTEGER PRIMARY KEY,
        song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        media_id    INTEGER NOT NULL REFERENCES media(id),
        order_index INTEGER NOT NULL
      );
      CREATE INDEX idx_song_scores ON song_scores(song_id, order_index);
    `
  },
  {
    // 찬송가 장 번호 — "478장" 검색·중복 판별용
    version: 4,
    sql: /* sql */ `
      ALTER TABLE songs ADD COLUMN hymn_no INTEGER;
      CREATE INDEX idx_songs_hymn_no ON songs(hymn_no);
    `
  },
  {
    // 성경 본문 DB — 구절 입력으로 본문 불러오기. 번역본별 66권 × 장 × 절
    version: 5,
    sql: /* sql */ `
      CREATE TABLE bible_text (
        translation TEXT    NOT NULL,   -- 'KRV'(개역한글, 내장) / 'NKRV'(개역개정, 가져오기) …
        book        INTEGER NOT NULL,   -- 1~66
        chapter     INTEGER NOT NULL,
        verse       INTEGER NOT NULL,
        text        TEXT    NOT NULL,
        PRIMARY KEY (translation, book, chapter, verse)
      ) WITHOUT ROWID;
      CREATE TABLE bible_translations (
        code       TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        bundled    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `
  }
]
