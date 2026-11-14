# 테스트

## 단위 테스트 (순수 모듈, tsx)
```bash
cd desktop && for f in tests/*.mts; do npx --yes tsx "$f"; done
```

## E2E (패키징 앱 + Chrome DevTools Protocol)
사용자 데이터를 건드리지 않도록 임시 userData와 DB 사본으로 격리해 실행한다.
```bash
TD=/tmp/seraphim-test-data; TU=/tmp/seraphim-test-userdata; rm -rf $TD $TU; mkdir -p $TD/media/scores $TU
sqlite3 ~/Downloads/예배/seraphim.db ".backup '$TD/seraphim.db'"     # 또는 빈 DB
printf '{"dataDir":"%s"}' "$TD" > $TU/seraphim-config.json
release/mac-arm64/Seraphim.app/Contents/MacOS/Seraphim --user-data-dir=$TU --remote-debugging-port=9333 &
node tests/e2e/ime-test.mjs 9333
SERAPHIM_TEST_DATADIR=$TD node tests/e2e/score-test.mjs 9333 tests/fixtures/test-score.pdf
node tests/e2e/import-e2e.mjs 9333 tests/fixtures/import-fixtures
node tests/e2e/bible-e2e.mjs 9333 /tmp/seraphim-bible-fixture
node tests/e2e/order-e2e.mjs 9333
node tests/e2e/delete-range-e2e.mjs 9333
node tests/e2e/dedup-e2e.mjs 9333
node tests/e2e/ocr-logo-e2e.mjs 9333
node tests/e2e/pptx-e2e.mjs 9333 /tmp/seraphim-pptx
# YouTube 방송·녹화: 앱을 SERAPHIM_RECORDINGS_DIR=<dir> SERAPHIM_FAKE_DISK_FREE_FILE=<file> 와 --use-fake-device-for-media-stream 로 띄운 뒤 (fake-ui 플래그는 탭 캡처를 막으므로 금지)
# homebrew ffmpeg/ffprobe가 로컬 RTMP 서버·검사에 쓰임 (FFMPEG_LISTENER, FFPROBE 로 경로 변경). 같은 <file>을 넘기면 저장 공간 부족 검사도 한다
SERAPHIM_FAKE_DISK_FREE_FILE=<file> node tests/e2e/stream-e2e.mjs 9333 /tmp/seraphim-stream
# 카메라 1·2·3 전환: 가짜 카메라 2대로 앱을 띄움 (--use-fake-device-for-media-stream=device-count=2)
node tests/e2e/camera-switch-e2e.mjs 9333 /tmp/seraphim-cam   # 플레이리스트/곡 → PPTX (outPath로 대화상자 생략)
node tests/e2e/collect-import-e2e.mjs 9333 <벅스 json/tsv/txt + 유튜브 json이 든 폴더>   # 수집 형식 폴더째 가져오기
node tests/e2e/lyrics-e2e.mjs 9333        # 실제 Gemini 호출 (키 필요)
node tests/e2e/multi-e2e.mjs 9333         # 실제 Gemini 호출 (키 필요)
```
- 실제 데이터 사본으로 돌리면 픽스처와 겹치는 곡(478장 등) 때문에 일부 검사가 실패할 수 있다 — 빈 DB에서 돌리면 전부 통과.
- `score-test`·`import-e2e`·`bible-e2e`는 각각 모달을 열므로 순서대로 돌릴 때는 앱을 재시작하는 편이 안전하다.
