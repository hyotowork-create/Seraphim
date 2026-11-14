# 로컬 OCR 언어 데이터

- `kor.traineddata`, `eng.traineddata` — tesseract-ocr/tessdata_fast (Apache-2.0). 오프라인 악보 가사 추출(정확도 낮음, Gemini 대체용)에 사용.
- electron-builder `extraResources`로 `Contents/Resources/tessdata/`에 복사되며, main 프로세스의 tesseract.js(Node 워커)가 읽는다.
