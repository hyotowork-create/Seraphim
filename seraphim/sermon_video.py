"""설교 영상 자동화 파이프라인 (ShortsForge 를 교회용으로 통합·재해석).

설교/예배 실황 영상을 입력하면:
  1) STT(자막 추출, faster-whisper 로컬 또는 OpenAI) → 대본 생성·캐시
  2) LLM(Gemini/OpenAI)으로 은혜로운 핵심 구간을 선별
  3) 9:16(또는 선택 비율) 세로 영상 + 한글 자막 번인 + 하단밴드(교회명·설교제목)
     쇼츠 클립으로 인코딩 → 전도·SNS 용
  4) (별도) 설교 요약 PDF(성도 배포용 핸드아웃) 생성

원본 대비 변경점:
  - Huey(별도 워커) → 앱 내부 백그라운드 스레드(jobs.py) + 진행상황 폴링
  - Slack 필수 → 선택. 토큰 없으면 로컬 저장 + 화면 로그만 사용
  - 협회/세미나 홍보 → 교회명/설교제목 하단밴드
  - 무거운 의존성(ffmpeg/faster-whisper/openai/google-genai/fpdf/slack)은
    모두 함수 내부 지연 import → 미설치 시에도 PPT·주보 기능은 정상 동작
"""

from __future__ import annotations

import os
import re
import json
import shutil
import hashlib
import tempfile
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor

from .config import settings

# ── 의존성 가용성 점검 ────────────────────────────────────────────────
REQUIRED_MODULES = ("ffmpeg", "faster_whisper")


def missing_dependencies() -> list[str]:
    """영상 기능에 필요한데 설치되지 않은 패키지 목록."""
    missing = []
    import importlib.util
    for mod in ("ffmpeg", "faster_whisper", "fpdf"):
        if importlib.util.find_spec(mod) is None:
            missing.append({"ffmpeg": "ffmpeg-python", "faster_whisper": "faster-whisper",
                            "fpdf": "fpdf2"}[mod])
    return missing


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def video_feature_status() -> dict:
    """프런트엔드에 영상 기능 사용 가능 여부를 알려주기 위한 상태."""
    miss = missing_dependencies()
    return {
        "python_packages_ok": not miss,
        "missing_packages": miss,
        "ffmpeg_ok": ffmpeg_available(),
        "llm_ok": settings.has_llm,
        "slack_ok": settings.has_slack,
        "llm_provider": settings.effective_llm_provider if settings.has_llm else None,
    }


# ── 경로/STT 유틸 ──────────────────────────────────────────────────────
def resolve_path(raw: str) -> str:
    """입력 경로 정리 후 실제 존재 경로 반환(없으면 ""). 한글 NFC/NFD 폴백."""
    import unicodedata
    p = (raw or "").strip().strip('"').strip("'").strip()
    if not p:
        return ""
    for cand in (p, unicodedata.normalize("NFC", p), unicodedata.normalize("NFD", p)):
        if os.path.exists(cand):
            return cand
    return ""


# STT 옵션 버튼 → (엔진, 모델). A/B/C=로컬 faster-whisper, CLOUD=OpenAI.
STT_OPTIONS = {"A": "medium", "B": "large-v3", "C": "small"}
OPENAI_STT_MODEL = "whisper-1"


def resolve_stt(option: str) -> tuple[str, str]:
    """STT 옵션 → (backend, model_name)."""
    if (option or "").upper() == "CLOUD":
        return "openai", OPENAI_STT_MODEL
    return "local", STT_OPTIONS.get(option, "medium")


# 공유 시스템 지시문 — 교회 설교/간증 맥락으로 조정
LLM_SHORTS_INSTRUCTION = (
    "You are a professional video editor for a Christian church's media team. "
    "Each input line is 'start|end|text' (start/end in seconds, Korean sermon/worship). "
    "Return a JSON object with a 'shorts' array; each item: 'start_time' (number), "
    "'end_time' (number), 'suggested_title' (string), 'viral_score' (number 0-100). "
    "Only clips 15-60 seconds long. Choose the most moving, encouraging, gospel-centered "
    "moments that work as standalone short-form testimony/encouragement clips. "
    "'suggested_title' MUST be a warm, inviting Korean hook of AT MOST 18 characters "
    "(fits two lines of ~9 characters each); never exceed 18 characters. "
    "Pick the best moments across the ENTIRE transcript."
)

SUMMARY_SYSTEM = (
    "당신은 교회 주보/소그룹 나눔용 '설교 요약 핸드아웃'을 만드는 전문 에디터입니다. "
    "입력 각 줄은 'start|end|text'(초 단위)입니다. 성도 배포용 한국어 요약본"
    "(1~2페이지 분량)을 JSON 으로 작성하세요. 필드: "
    "overview(string; 설교 전체 요지 3~4문장), "
    "sections(array; 각 {title, timecode 'MM:SS', points[핵심 3~5개 string]}), "
    "key_verses(array; 각 {reference 성경구절, note 적용/설명}), "
    "application(array of string; 삶에 적용할 묵상·실천 포인트). "
    "반드시 설교 내용에 근거하고 과장·창작하지 마세요."
)


# ── Whisper 모델 캐시 / 대본 캐시 ──────────────────────────────────────
_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".transcript_cache")
LOCAL_CHUNK_SEC = 600
LOCAL_PARALLEL = 3
OPENAI_CHUNK_SEC = 900
OPENAI_MAX_PARALLEL = 5
_tl = threading.local()


def _worker_whisper(model_name: str):
    from faster_whisper import WhisperModel
    if getattr(_tl, "name", None) != model_name:
        _tl.model = WhisperModel(
            model_name, device=settings.whisper_device,
            compute_type=settings.whisper_compute_type, cpu_threads=4,
        )
        _tl.name = model_name
    return _tl.model


def _transcript_cache_path(video_path: str, model_name: str) -> str:
    try:
        size = os.path.getsize(video_path)
    except OSError:
        size = 0
    key = f"{os.path.abspath(video_path)}|{size}|{model_name}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return os.path.join(_CACHE_DIR, f"{digest}.json")


def _probe_duration(path: str) -> float:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True,
        )
        return float(r.stdout.strip() or 0)
    except (ValueError, OSError):
        return 0.0


def _transcribe_local(audio_path, model_name, update_status, chunk_key="single"):
    """로컬 faster-whisper — 청크 분할 + 병렬 + 청크별 재개 캐시."""
    total = _probe_duration(audio_path)
    chunk_cache_dir = os.path.join(_CACHE_DIR, "chunks", chunk_key)
    os.makedirs(chunk_cache_dir, exist_ok=True)

    bounds: list[tuple[int, float, float]] = []
    i, t = 0, 0.0
    while t < total or not bounds:
        dur = (min(LOCAL_CHUNK_SEC, total - t) if total else LOCAL_CHUNK_SEC)
        bounds.append((i, t, dur))
        t += LOCAL_CHUNK_SEC
        i += 1
        if total == 0:
            break

    done = sum(1 for b in bounds
               if os.path.exists(os.path.join(chunk_cache_dir, f"{b[0]:03d}.json")))
    update_status(f"🧠 로컬 Whisper({model_name}) — {len(bounds)}개 구간 병렬·재개"
                  + (f" (캐시 {done}개 건너뜀)" if done else ""))

    tmpdir = tempfile.mkdtemp(prefix="lstt_")

    def _do(b):
        idx, off, dur = b
        cpath = os.path.join(chunk_cache_dir, f"{idx:03d}.json")
        if os.path.exists(cpath):
            with open(cpath, encoding="utf-8") as f:
                return idx, json.load(f)
        cp = os.path.join(tmpdir, f"c{idx:03d}.mp3")
        subprocess.run(["ffmpeg", "-y", "-ss", str(off), "-t", str(dur),
                        "-i", audio_path, "-c", "copy", cp, "-loglevel", "error"], check=True)
        m = _worker_whisper(model_name)
        segments, info = m.transcribe(cp, beam_size=5, language="ko", word_timestamps=True)
        segs, words = [], []
        for s in segments:
            segs.append({"start": round(s.start + off, 2),
                         "end": round(s.end + off, 2), "text": s.text})
            for w in (s.words or []):
                words.append({"start": round(w.start + off, 2),
                              "end": round(w.end + off, 2), "word": w.word})
        data = {"segs": segs, "words": words, "language": info.language}
        with open(cpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        try:
            os.remove(cp)
        except OSError:
            pass
        return idx, data

    try:
        workers = max(1, min(LOCAL_PARALLEL, len(bounds)))
        with ThreadPoolExecutor(max_workers=workers) as ex:
            results = list(ex.map(_do, bounds))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    results.sort(key=lambda x: x[0])
    transcript_data = [s for _, d in results for s in d["segs"]]
    word_data = [w for _, d in results for w in d["words"]]
    language = next((d["language"] for _, d in results if d.get("segs")), "")
    return transcript_data, word_data, language


def _transcribe_openai(audio_path, update_status):
    """OpenAI Whisper API — 청크 분할 + 병렬 업로드 + 단어 타임스탬프."""
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    total = _probe_duration(audio_path)
    tmpdir = tempfile.mkdtemp(prefix="stt_")
    try:
        chunks: list[tuple[str, float]] = []
        i, t = 0, 0.0
        while t < total or not chunks:
            cp = os.path.join(tmpdir, f"c{i:03d}.mp3")
            subprocess.run(["ffmpeg", "-y", "-ss", str(t), "-t", str(OPENAI_CHUNK_SEC),
                            "-i", audio_path, "-c", "copy", cp, "-loglevel", "error"], check=True)
            if os.path.exists(cp) and os.path.getsize(cp) > 1024:
                chunks.append((cp, t))
            t += OPENAI_CHUNK_SEC
            i += 1
            if total == 0:
                break
        update_status(f"☁️ OpenAI Whisper 전사 — {len(chunks)}개 구간 병렬 업로드")

        def _do(arg):
            cp, off = arg
            with open(cp, "rb") as f:
                r = client.audio.transcriptions.create(
                    model=OPENAI_STT_MODEL, file=f, language="ko",
                    response_format="verbose_json",
                    timestamp_granularities=["segment", "word"],
                )
            segs = [{"start": round(s.start + off, 2), "end": round(s.end + off, 2), "text": s.text}
                    for s in (r.segments or [])]
            words = [{"start": round(w.start + off, 2), "end": round(w.end + off, 2), "word": w.word}
                     for w in (getattr(r, "words", None) or [])]
            return off, segs, words, getattr(r, "language", "ko")

        workers = max(1, min(OPENAI_MAX_PARALLEL, len(chunks)))
        with ThreadPoolExecutor(max_workers=workers) as ex:
            results = list(ex.map(_do, chunks))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    results.sort(key=lambda x: x[0])
    transcript_data = [s for _, segs, _, _ in results for s in segs]
    word_data = [w for _, _, words, _ in results for w in words]
    language = results[0][3] if results else ""
    return transcript_data, word_data, language


def _get_transcript(video_path, model_name, update_status, backend="local"):
    """대본 캐시 우선 반환. 없으면 오디오추출 + STT 후 캐싱."""
    import ffmpeg
    cache_model = f"openai:{OPENAI_STT_MODEL}" if backend == "openai" else model_name
    cache_path = _transcript_cache_path(video_path, cache_model)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                c = json.load(f)
            update_status(f"♻️ 캐시된 대본 재사용 — STT 생략 (문장 {len(c['transcript'])}개)")
            return c["transcript"], c.get("words", []), c.get("language", "")
        except (OSError, json.JSONDecodeError, KeyError):
            pass

    base_dir = os.path.dirname(video_path)
    audio_path = os.path.join(base_dir, "extracted_audio.mp3")
    update_status("🔄 원본 영상에서 오디오 추출 중…")
    (ffmpeg.input(video_path)
        .output(audio_path, acodec="libmp3lame", **{"q:a": 4})
        .overwrite_output().run(capture_stdout=True, capture_stderr=True))

    chunk_key = hashlib.sha1(
        f"{os.path.abspath(video_path)}|{cache_model}".encode("utf-8")).hexdigest()[:16]
    try:
        if backend == "openai":
            transcript_data, word_data, language = _transcribe_openai(audio_path, update_status)
        else:
            transcript_data, word_data, language = _transcribe_local(
                audio_path, model_name, update_status, chunk_key)
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

    if transcript_data:
        try:
            os.makedirs(_CACHE_DIR, exist_ok=True)
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump({"transcript": transcript_data, "words": word_data,
                           "language": language}, f, ensure_ascii=False)
            shutil.rmtree(os.path.join(_CACHE_DIR, "chunks", chunk_key), ignore_errors=True)
        except OSError:
            pass
    update_status(f"✅ 대본 추출 완료 — 언어 {language}, 문장 {len(transcript_data)}개")
    return transcript_data, word_data, language


# ── LLM 하이라이트 선별 ────────────────────────────────────────────────
TRANSCRIPT_CHUNK_SIZE = 300


def _to_lines(chunk: list[dict]) -> str:
    return "\n".join(f"{s['start']}|{s['end']}|{s['text'].strip()}" for s in chunk)


def _valid_clip(c: dict) -> bool:
    try:
        start = float(c["start_time"])
        end = float(c["end_time"])
    except (KeyError, TypeError, ValueError):
        return False
    if not c.get("suggested_title"):
        return False
    return 0 <= start < end and 15 <= (end - start) <= 60


def _parse_shorts(raw: str | None) -> list[dict]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return [c for c in data.get("shorts", []) if _valid_clip(c)]


def _gemini_json(system: str, user: str, want_shorts: bool):
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=settings.gemini_api_key)
    resp = client.models.generate_content(
        model=settings.gemini_model, contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system, response_mime_type="application/json"),
    )
    return resp.text


def _openai_json(system: str, user: str, model: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    resp = client.chat.completions.create(
        model=model, response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    return resp.choices[0].message.content


def _select_shorts(transcript_data: list[dict]) -> list[dict]:
    provider = settings.effective_llm_provider
    user_prefix = "가장 은혜롭고 핵심적인 15~60초 쇼츠 구간을 찾아 JSON 으로 반환하세요:\n"
    if provider == "gemini":
        candidates = _parse_shorts(_gemini_json(
            LLM_SHORTS_INSTRUCTION, user_prefix + _to_lines(transcript_data), True))
    else:
        candidates = []
        for i in range(0, len(transcript_data), TRANSCRIPT_CHUNK_SIZE):
            raw = _openai_json(LLM_SHORTS_INSTRUCTION,
                               user_prefix + _to_lines(transcript_data[i:i + TRANSCRIPT_CHUNK_SIZE]),
                               settings.openai_map_model)
            candidates.extend(_parse_shorts(raw))
    candidates.sort(key=lambda c: float(c.get("viral_score", 0)), reverse=True)
    return candidates[:20]


def _build_summary(transcript_data: list[dict]) -> dict:
    provider = settings.effective_llm_provider
    user = "다음 설교 대본을 성도 배포용 설교 요약 핸드아웃으로 정리하세요:\n" + _to_lines(transcript_data)
    raw = (_gemini_json(SUMMARY_SYSTEM, user, False) if provider == "gemini"
           else _openai_json(SUMMARY_SYSTEM, user, settings.openai_model))
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


# ── 자막/레이아웃 (ASS) ────────────────────────────────────────────────
LINE_CHARS = 9
MAX_LINES = 2
MAX_TEXT_CHARS = LINE_CHARS * MAX_LINES
_CHAR_W_RATIO = 0.95
SUB_FONT = os.environ.get("SUB_FONT", "Malgun Gothic")
SUB_MAX_CUE_CHARS = 9
TOP_FONT_SCALE = 0.5
BOTTOM_FONT_SCALE = 1.5
SUB_MAX_CUE_DUR = 2.8
SUB_GAP_SPLIT = 0.6
SUB_FADE_MS = 150
ASPECT_PRESETS = {"9:16": (1080, 1920), "4:3": (1440, 1080),
                  "1:1": (1080, 1080), "16:9": (1920, 1080)}
DEFAULT_ASPECT = "9:16"
DEFAULT_TEXT_SCALE = 2.0
ACCENT_GOLD = "&H00D4FF&"    # 교회명 강조(골드, BGR)


def _ass_text(s: str) -> str:
    return (str(s).replace("\\", "").replace("{", "(").replace("}", ")")
            .replace("\r", " ").replace("\n", " ").strip())


def _grid_fs(usable_w: int) -> int:
    return max(20, int(usable_w / (LINE_CHARS * _CHAR_W_RATIO)))


def _fit1(text: str, usable_w: int, max_fs: int) -> int:
    n = max(1, len(" ".join(str(text).split())))
    return max(20, min(max_fs, int(usable_w / (n * _CHAR_W_RATIO))))


def _layout(width: int, height: int) -> dict:
    k = height / 1920.0
    top_band = round(210 * k)
    bottom_band = round(630 * k)
    mid_h = height - top_band - bottom_band
    bottom_y = top_band + mid_h
    title_fs = max(20, round(_grid_fs(width - 80) * TOP_FONT_SCALE))
    stt_fs = _grid_fs(width - 120)
    org_fs = max(20, round(width * 0.092 * BOTTOM_FONT_SCALE))
    sem_fs = max(20, round(width * 0.066 * BOTTOM_FONT_SCALE))
    gap = round(24 * k)
    stt_y = bottom_y + gap
    org_y = stt_y + round(stt_fs * 1.3) + gap
    sem_y = org_y + round(org_fs * 1.3) + gap
    return {"w": width, "h": height, "top_band": top_band, "mid_h": mid_h,
            "bottom_y": bottom_y, "usable": width - 120, "title_fs": title_fs,
            "title_cy": round(top_band / 2), "stt_fs": stt_fs, "stt_y": stt_y,
            "org_max_fs": org_fs, "org_y": org_y, "sem_max_fs": sem_fs, "sem_y": sem_y}


def _ass_header(L: dict) -> str:
    return (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {L['w']}\nPlayResY: {L['h']}\n"
        "WrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Title,{SUB_FONT},{L['title_fs']},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
        "-1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1\n"
        f"Style: Stt,{SUB_FONT},{L['stt_fs']},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
        "-1,0,0,0,100,100,0,0,1,4,1,5,0,0,0,1\n"
        f"Style: Org,{SUB_FONT},{L['org_max_fs']},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
        "-1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1\n"
        f"Style: Sem,{SUB_FONT},{L['sem_max_fs']},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
        "-1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1\n\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )


def _safe_filename(name: str, maxlen: int = 40) -> str:
    name = re.sub(r"""[\\/:*?"<>|'`,\[\]{};=]""", "", name or "").strip()
    name = re.sub(r"\s+", "_", name)
    return (name or "short")[:maxlen].rstrip("_-([ ") or "short"


def _ass_ts(seconds: float) -> str:
    cs = max(0, int(round(seconds * 100)))
    h, cs = divmod(cs, 360_000)
    m, cs = divmod(cs, 6_000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _two_lines(text: str) -> list[str]:
    text = " ".join(_ass_text(text).split())
    if not text:
        return []
    if len(text) <= LINE_CHARS:
        return [text]
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS - 1].rstrip() + "…"
    spaces = [i for i, ch in enumerate(text) if ch == " "]
    mid = len(text) // 2
    if spaces:
        sp = min(spaces, key=lambda i: abs(i - mid))
        l1, l2 = text[:sp].strip(), text[sp + 1:].strip()
    else:
        l1, l2 = text[:mid], text[mid:]

    def cap(s: str) -> str:
        return s if len(s) <= LINE_CHARS else (s[:LINE_CHARS - 1] + "…")

    return [cap(l1), cap(l2)]


def _cues_from_words(words: list[dict]) -> list[dict]:
    cues, cur = [], []

    def flush():
        if not cur:
            return
        text = "".join(w["word"] for w in cur).strip()
        if text:
            cues.append({"start": cur[0]["start"], "end": cur[-1]["end"], "text": text})
        cur.clear()

    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            text_now = "".join(x["word"] for x in cur).strip()
            prospective = len((text_now + w["word"]).strip())
            dur = w["end"] - cur[0]["start"]
            if gap > SUB_GAP_SPLIT or prospective > SUB_MAX_CUE_CHARS or dur > SUB_MAX_CUE_DUR:
                flush()
        cur.append(w)
    flush()
    return cues


def _cues_from_segments(segments: list[dict]) -> list[dict]:
    cues = []
    for seg in segments:
        text = " ".join(str(seg["text"]).split())
        if not text:
            continue
        s, e = float(seg["start"]), float(seg["end"])
        chunks, line = [], ""
        for word in text.split(" "):
            if line and len(line) + 1 + len(word) > SUB_MAX_CUE_CHARS:
                chunks.append(line)
                line = word
            else:
                line = f"{line} {word}".strip()
        if line:
            chunks.append(line)
        if not chunks:
            continue
        step = (e - s) / len(chunks)
        for i, ch in enumerate(chunks):
            cues.append({"start": s + i * step, "end": s + (i + 1) * step, "text": ch})
    return cues


def _build_subtitle_cues(words, segments):
    return _cues_from_words(words) if words else _cues_from_segments(segments)


def _write_clip_ass(cues, start, end, ass_path, L, title="", church_name="", sermon_title=""):
    """클립용 ASS: 상단 제목(2줄) / 하단밴드 STT 1줄 + 교회명(골드)·설교제목(흰색)."""
    out = [_ass_header(L)]
    end_ts = _ass_ts(end - start)
    w = L["w"]

    title_lines = _two_lines(title) if title else []
    if title_lines:
        joined = "\\N".join(title_lines)   # ASS 줄바꿈(f-string 밖에서 결합)
        out.append(
            f"Dialogue: 0,0:00:00.00,{end_ts},Title,,0,0,0,,"
            f"{{\\an5\\q2\\pos({w // 2},{L['title_cy']})}}"
            f"{{\\c{ACCENT_GOLD}}}{joined}\n")

    if church_name:
        org = " ".join(_ass_text(church_name).split())
        ofs = _fit1(org, L["usable"], L["org_max_fs"])
        out.append(
            f"Dialogue: 0,0:00:00.00,{end_ts},Org,,0,0,0,,"
            f"{{\\an8\\q2\\fs{ofs}\\c{ACCENT_GOLD}\\pos({w // 2},{L['org_y']})}}{org}\n")
    if sermon_title:
        sem = " ".join(_ass_text(sermon_title).split())
        sfs = _fit1(sem, L["usable"], L["sem_max_fs"])
        out.append(
            f"Dialogue: 0,0:00:00.00,{end_ts},Sem,,0,0,0,,"
            f"{{\\an8\\q2\\fs{sfs}\\pos({w // 2},{L['sem_y']})}}{sem}\n")

    pending = []
    for c in cues:
        cs, ce = float(c["start"]), float(c["end"])
        if ce <= start or cs >= end:
            continue
        rel_s = max(0.0, cs - start)
        rel_e = min(end, ce) - start
        if rel_e <= rel_s:
            continue
        txt = " ".join(_ass_text(c["text"]).split())
        if txt:
            pending.append((rel_s, rel_e, txt))
    for rel_s, rel_e, txt in pending:
        out.append(
            f"Dialogue: 0,{_ass_ts(rel_s)},{_ass_ts(rel_e)},Stt,,0,0,0,,"
            f"{{\\an8\\q2\\fad({SUB_FADE_MS},{SUB_FADE_MS})\\pos({w // 2},{L['stt_y']})}}{txt}\n")

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write("".join(out))
    return bool(title_lines) or bool(church_name) or bool(sermon_title) or len(pending) > 0


def _cut_short(src_path, clip, cues, output_dir, index,
               church_name="", sermon_title="", aspect=DEFAULT_ASPECT):
    """선별 구간을 3분할 레이아웃(상단 제목 / 중앙 영상 / 하단밴드)으로 인코딩."""
    import ffmpeg
    start = float(clip["start_time"])
    end = float(clip["end_time"])
    duration = end - start
    w, h = ASPECT_PRESETS.get(aspect, ASPECT_PRESETS[DEFAULT_ASPECT])
    L = _layout(w, h)

    base = f"{index:02d}_{_safe_filename(clip.get('suggested_title'))}"
    out_name = f"{base}.mp4"
    ass_name = f"{base}.ass"
    ass_path = os.path.join(output_dir, ass_name)

    has_sub = _write_clip_ass(cues, start, end, ass_path, L,
                              title=str(clip.get("suggested_title") or ""),
                              church_name=church_name, sermon_title=sermon_title)

    vf = (f"scale={w}:{L['mid_h']}:force_original_aspect_ratio=decrease,"
          f"pad={w}:{h}:(ow-iw)/2:{L['top_band']}+({L['mid_h']}-ih)/2:black")
    if has_sub:
        vf += f",subtitles={ass_name}"

    args = (ffmpeg.input(src_path, ss=start, t=duration)
            .output(out_name, vf=vf, vcodec="libx264", acodec="aac", preset="veryfast",
                    **{"b:a": "128k", "movflags": "+faststart"})
            .overwrite_output().compile())
    try:
        proc = subprocess.run(args, cwd=output_dir, capture_output=True)
        if proc.returncode != 0:
            tail = proc.stderr.decode(errors="replace").strip().splitlines()[-3:]
            raise RuntimeError(" | ".join(tail) or "ffmpeg 인코딩 실패")
    finally:
        if os.path.exists(ass_path):
            os.remove(ass_path)
    return os.path.join(output_dir, out_name)


# ── 설교 요약 PDF ──────────────────────────────────────────────────────
def _find_korean_font() -> tuple[str, str] | None:
    """한글 PDF 임베드용 폰트(정규/볼드) 경로. 없으면 None."""
    candidates = [
        (r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"),
        ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
         "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
         "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        ("/System/Library/Fonts/AppleSDGothicNeo.ttc",
         "/System/Library/Fonts/AppleSDGothicNeo.ttc"),
    ]
    for reg, bold in candidates:
        if os.path.exists(reg):
            return reg, (bold if os.path.exists(bold) else reg)
    return None


def _summary_to_pdf(summary: dict, out_path: str, meta: dict | None = None) -> str:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
    meta = meta or {}
    font = _find_korean_font()
    if not font:
        raise RuntimeError(
            "한글 PDF 생성을 위한 폰트를 찾지 못했습니다. "
            "Windows(맑은 고딕) 또는 나눔/Noto CJK 폰트가 필요합니다.")
    reg, bold = font

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(18, 18, 18)
    pdf.add_font("KR", "", reg)
    pdf.add_font("KR", "B", bold)
    pdf.add_page()

    def cell(t, h):
        pdf.multi_cell(0, h, t, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def heading(t, size=14):
        pdf.ln(2)
        pdf.set_font("KR", "B", size)
        pdf.set_text_color(20, 30, 60)
        cell(t, 8)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(1)

    def body(t):
        pdf.set_font("KR", "", 11)
        cell(t, 6.5)

    pdf.set_font("KR", "B", 20)
    cell(str(meta.get("title") or "설교 요약"), 11)
    if meta.get("subtitle"):
        pdf.set_font("KR", "", 10)
        pdf.set_text_color(120, 120, 120)
        cell(str(meta["subtitle"]), 6)
        pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    if summary.get("overview"):
        heading("말씀 요지")
        body(str(summary["overview"]))
    for i, sec in enumerate(summary.get("sections", []), start=1):
        tc = sec.get("timecode", "")
        heading(f"{i}. {sec.get('title', '')}" + (f"   [{tc}]" if tc else ""), size=13)
        for p in sec.get("points", []):
            body(f"  • {p}")
    if summary.get("key_verses"):
        heading("핵심 성경구절")
        for kv in summary["key_verses"]:
            body(f"  • {kv.get('reference', '')} : {kv.get('note', '')}")
    if summary.get("application"):
        heading("삶의 적용 · 묵상")
        for a in summary["application"]:
            body(f"  □ {a}")

    pdf.output(out_path)
    return out_path


# ── Slack(선택) ────────────────────────────────────────────────────────
def _slack_client():
    if not settings.has_slack:
        return None
    try:
        from slack_sdk import WebClient
        return WebClient(token=settings.slack_bot_token)
    except Exception:
        return None


def _make_status_updater(job, channel_id: str):
    """job 로그 + (설정 시)Slack 스레드 양쪽으로 진행상황을 전달하는 콜백 생성."""
    client = _slack_client()
    thread = {"ts": None}

    if client and channel_id:
        try:
            from slack_sdk.errors import SlackApiError
            resp = client.chat_postMessage(
                channel=channel_id,
                text="🎬 *[Seraphim]* 설교 영상 처리 파이프라인을 시작합니다.")
            thread["ts"] = resp["ts"]
        except Exception:
            pass

    def update(text: str):
        job.log(text)
        if client and channel_id and thread["ts"]:
            try:
                client.chat_postMessage(channel=channel_id, text=text, thread_ts=thread["ts"])
            except Exception:
                pass

    return update, client, thread


# ── 공개 진입점 (jobs.manager.submit 으로 호출) ────────────────────────
def run_shorts_pipeline(job, video_path, church_name, sermon_title,
                        aspect, stt_option, slack_channel=""):
    """설교 영상 → 하이라이트 쇼츠 클립 생성 파이프라인."""
    backend, model_name = resolve_stt(stt_option)
    update, _client, _thread = _make_status_updater(job, slack_channel)

    if not ffmpeg_available():
        raise RuntimeError("ffmpeg/ffprobe 가 설치되어 있지 않습니다. (영상 처리 필수)")
    if not settings.has_llm:
        raise RuntimeError("하이라이트 선별용 LLM 키(GEMINI_API_KEY 또는 OPENAI_API_KEY)가 필요합니다.")

    base_dir = os.path.dirname(video_path)
    engine = "클라우드(OpenAI)" if backend == "openai" else f"로컬({model_name})"
    update(f"🧾 [1/3] 대본 준비 — STT: {engine} (캐시 우선)")
    transcript_data, word_data, language = _get_transcript(
        video_path, model_name, update, backend=backend)
    if not transcript_data:
        raise RuntimeError("추출된 대본이 없습니다.")

    update(f"🤖 [2/3] {settings.effective_llm_provider} 로 은혜로운 하이라이트 구간 분석")
    shorts = _select_shorts(transcript_data)
    vdur = _probe_duration(video_path)
    if vdur:
        shorts = [{**c, "end_time": min(float(c["end_time"]), vdur)} for c in shorts
                  if float(c["start_time"]) < vdur
                  and (min(float(c["end_time"]), vdur) - float(c["start_time"])) >= 15]
    update(f"🎯 유효 쇼츠 {len(shorts)}개 선별 완료")

    subtitle_cues = _build_subtitle_cues(word_data, transcript_data)
    output_dir = os.path.join(base_dir, "shorts_output")
    os.makedirs(output_dir, exist_ok=True)
    update(f"🎬 [3/3] {len(shorts)}개 구간을 {aspect} + 한글 자막 번인으로 인코딩 → {output_dir}")

    saved = []
    for idx, clip in enumerate(shorts, start=1):
        try:
            out_path = _cut_short(video_path, clip, subtitle_cues, output_dir, idx,
                                  church_name=church_name, sermon_title=sermon_title, aspect=aspect)
            saved.append(out_path)
            update(f"   ✅ [{idx}/{len(shorts)}] {os.path.basename(out_path)} "
                   f"(score {clip.get('viral_score', '?')})")
        except Exception as e:  # noqa: BLE001
            update(f"   ❌ [{idx}/{len(shorts)}] 인코딩 실패: {e}")

    update(f"🚀 완료! {len(saved)}/{len(shorts)}개 쇼츠 생성 → {output_dir}")
    return {"output_dir": output_dir, "count": len(saved),
            "files": [os.path.basename(p) for p in saved]}


def run_summary_pdf(job, video_path, sermon_title, stt_option, slack_channel=""):
    """설교 영상 → 성도 배포용 설교 요약 PDF 생성."""
    backend, model_name = resolve_stt(stt_option)
    update, client, thread = _make_status_updater(job, slack_channel)

    if not ffmpeg_available():
        raise RuntimeError("ffmpeg/ffprobe 가 설치되어 있지 않습니다.")
    if not settings.has_llm:
        raise RuntimeError("요약용 LLM 키(GEMINI_API_KEY 또는 OPENAI_API_KEY)가 필요합니다.")

    base_dir = os.path.dirname(video_path)
    engine = "클라우드(OpenAI)" if backend == "openai" else f"로컬({model_name})"
    update(f"🧾 [1/3] 대본 준비 — STT: {engine} (캐시 우선)")
    transcript_data, _w, language = _get_transcript(
        video_path, model_name, update, backend=backend)
    if not transcript_data:
        raise RuntimeError("추출된 대본이 없습니다.")

    update(f"🧩 [2/3] {settings.effective_llm_provider} 로 설교 요약 생성")
    summary = _build_summary(transcript_data)
    if not (summary.get("overview") or summary.get("sections")):
        raise RuntimeError("요약 결과가 비었습니다.")

    update("📄 [3/3] 요약 PDF 생성")
    out_dir = os.path.join(base_dir, "summary_output")
    os.makedirs(out_dir, exist_ok=True)
    stem = _safe_filename(sermon_title or os.path.splitext(os.path.basename(video_path))[0])
    pdf_path = os.path.join(out_dir, f"{stem}_설교요약.pdf")
    meta = {"title": f"{sermon_title or '설교'} 요약",
            "subtitle": f"자동 생성 · 언어 {language} · 문장 {len(transcript_data)}개"}
    _summary_to_pdf(summary, pdf_path, meta)

    # Slack 업로드(선택)
    if client and slack_channel:
        try:
            client.files_upload_v2(channel=slack_channel, file=pdf_path,
                                   title=os.path.basename(pdf_path),
                                   thread_ts=thread["ts"])
        except Exception as e:  # noqa: BLE001
            update(f"⚠️ Slack 업로드 생략/실패: {e}")

    update(f"✅ 완료! 설교 요약 PDF 생성 → {pdf_path}")
    return {"pdf_path": pdf_path, "filename": os.path.basename(pdf_path)}
