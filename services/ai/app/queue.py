"""Job queue for the LAYERS AI Service.

Provides a simple thread-based job queue that runs tasks in the background.
Jobs are stored in memory with status tracking.
"""

import os
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable

from pydantic import BaseModel, Field

# Ephemeral image storage
IMAGE_DIR = Path("/tmp/layers-ai-images")
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# Image TTL: images older than this are eligible for cleanup.
# Configurable via LAYERS_IMAGE_TTL env var (seconds).
_IMAGE_TTL = int(os.environ.get("LAYERS_IMAGE_TTL", "3600"))  # default 1 hour

# How often (seconds) the worker runs cleanup.
_CLEANUP_INTERVAL = 300  # 5 minutes


class JobResponse(BaseModel):
    """Response model for job status queries."""

    job_id: str
    status: str = Field(
        ..., description="Job status: 'pending' | 'running' | 'complete' | 'error'"
    )
    result: Any | None = Field(default=None, description="Result payload when complete")
    error: str | None = Field(default=None, description="Error message if failed")
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)


class Job:
    """Internal job representation."""

    def __init__(self, func: Callable, *args: Any) -> None:
        self.job_id: str = str(uuid.uuid4())
        self.func = func
        self.args = args
        self.status: str = "pending"
        self.result: Any | None = None
        self.error: str | None = None
        self.created_at: float = time.time()
        self.updated_at: float = time.time()

    def to_response(self) -> JobResponse:
        """Convert to a JobResponse for API output."""
        return JobResponse(
            job_id=self.job_id,
            status=self.status,
            result=self.result,
            error=self.error,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class JobQueue:
    """Thread-safe job queue backed by an in-memory dict.

    A worker thread processes jobs from an internal queue. The worker must be
    started via :meth:`run_worker` (typically once at application startup).
    """

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._worker_running = False
        self._last_cleanup: float = 0.0

    def submit(self, func: Callable, *args: Any) -> str:
        """Submit a callable for asynchronous execution.

        Args:
            func: The callable to execute.
            *args: Positional arguments to pass to ``func``.

        Returns:
            The job_id for the submitted job.
        """
        job = Job(func, *args)
        with self._lock:
            self._jobs[job.job_id] = job
        return job.job_id

    def get_status(self, job_id: str) -> JobResponse | None:
        """Retrieve the status of a job.

        Args:
            job_id: The job identifier.

        Returns:
            A :class:`JobResponse` or ``None`` if the job is not found.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return job.to_response()

    def _execute_job(self, job: Job) -> None:
        """Execute a single job and update its status."""
        job.status = "running"
        job.updated_at = time.time()
        try:
            job.result = job.func(*job.args)
            job.status = "complete"
        except Exception as exc:  # noqa: BLE001
            job.error = str(exc)
            job.status = "error"
        finally:
            job.updated_at = time.time()

    def cleanup_old_images(self) -> int:
        """Remove ephemeral images older than the configured TTL.

        The TTL is read from the ``LAYERS_IMAGE_TTL`` environment variable
        (in seconds; default 3600 = 1 hour).

        Returns:
            The number of images removed.
        """
        count = 0
        if IMAGE_DIR.exists():
            now = time.time()
            for item in IMAGE_DIR.iterdir():
                try:
                    stat = item.stat()
                    if now - stat.st_mtime > _IMAGE_TTL:
                        if item.is_file():
                            item.unlink()
                        elif item.is_dir():
                            shutil.rmtree(item)
                        count += 1
                except OSError:
                    # File may have been deleted between iteration and stat.
                    pass
        return count

    def _maybe_cleanup(self) -> None:
        """Run cleanup at most once per ``_CLEANUP_INTERVAL`` seconds."""
        now = time.time()
        if now - self._last_cleanup >= _CLEANUP_INTERVAL:
            self._last_cleanup = now
            self.cleanup_old_images()

    def run_worker(self) -> None:
        """Start the background worker thread.

        The worker processes pending and running jobs in a loop.  Every
        ``_CLEANUP_INTERVAL`` seconds the worker also prunes ephemeral images
        older than the configured TTL.  This method returns immediately; the
        worker runs in a daemon thread.
        """
        if self._worker_running:
            return
        self._worker_running = True
        self._last_cleanup = time.time()

        def _worker_loop() -> None:
            while self._worker_running:
                with self._lock:
                    pending = [
                        j for j in self._jobs.values() if j.status == "pending"
                    ]
                if not pending:
                    self._maybe_cleanup()
                    time.sleep(0.1)
                    continue
                for job in pending:
                    self._execute_job(job)

        thread = threading.Thread(target=_worker_loop, daemon=True)
        thread.start()

    def shutdown(self) -> None:
        """Signal the worker thread to stop."""
        self._worker_running = False

    @staticmethod
    def cleanup_images() -> int:
        """Remove all ephemeral images from the image directory.

        Returns:
            The number of images removed.
        """
        count = 0
        if IMAGE_DIR.exists():
            for item in IMAGE_DIR.iterdir():
                if item.is_file():
                    item.unlink()
                    count += 1
                elif item.is_dir():
                    shutil.rmtree(item)
                    count += 1
        IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        return count


# Module-level singleton instance
queue: JobQueue = JobQueue()
