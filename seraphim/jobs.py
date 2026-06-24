"""간단한 백그라운드 작업 큐 + 진행상황 추적.

원본 ShortsForge 는 Huey(별도 워커 프로세스) + Slack 으로 상태를 전했지만,
교회용 단일 EXE 실행에 맞춰 **앱 내부 스레드 + 메모리 상태 + 폴링**으로 단순화한다.

- 별도 워커/DB/메시지큐 불필요 → EXE 더블클릭만으로 동작
- 작업 진행 로그를 프런트엔드가 `/api/jobs/<id>` 로 폴링해 표시
- Slack 토큰이 있으면 동일 로그를 Slack 스레드에도 전송(선택)
"""

from __future__ import annotations

import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime


class Job:
    def __init__(self, kind: str):
        self.id = uuid.uuid4().hex[:12]
        self.kind = kind                  # "shorts" | "summary"
        self.status = "queued"            # queued | running | done | error
        self.logs: list[dict] = []
        self.result: dict | None = None
        self.created_at = datetime.now().isoformat(timespec="seconds")
        self._lock = threading.Lock()

    def log(self, message: str) -> None:
        with self._lock:
            self.logs.append({
                "t": datetime.now().strftime("%H:%M:%S"),
                "msg": message,
            })

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "id": self.id,
                "kind": self.kind,
                "status": self.status,
                "logs": list(self.logs),
                "result": self.result,
                "created_at": self.created_at,
            }


class JobManager:
    """프로세스 수명 동안 유지되는 단순 인메모리 작업 관리자."""

    def __init__(self, max_workers: int = 1):
        # STT/인코딩은 CPU·메모리를 크게 쓰므로 기본 1개씩 직렬 처리
        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._jobs: dict[str, Job] = {}

    def submit(self, kind: str, fn, *args, **kwargs) -> Job:
        """fn(job, *args, **kwargs) 를 백그라운드에서 실행. job 객체를 즉시 반환."""
        job = Job(kind)
        self._jobs[job.id] = job

        def _run():
            job.status = "running"
            try:
                result = fn(job, *args, **kwargs)
                job.result = result if isinstance(result, dict) else None
                job.status = "done"
                job.log("✅ 작업이 완료되었습니다.")
            except Exception as e:  # noqa: BLE001 - 작업 실패를 상태로 보존
                job.status = "error"
                job.log(f"❌ 오류: {e}")
                traceback.print_exc()

        self._pool.submit(_run)
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)


# 앱 전역 단일 인스턴스
manager = JobManager()
