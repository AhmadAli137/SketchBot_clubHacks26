from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

TASKS_PATH = Path('/home/ahmad/projects/sketchbot/backend/data/tasks.json')
TASKS_PATH.parent.mkdir(parents=True, exist_ok=True)


class TaskLibrary:
    def __init__(self) -> None:
        self._tasks: list[dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        if TASKS_PATH.exists():
            self._tasks = json.loads(TASKS_PATH.read_text())
        else:
            self._tasks = []

    def _save(self) -> None:
        TASKS_PATH.write_text(json.dumps(self._tasks, indent=2) + '\n')

    def list_tasks(self) -> list[dict[str, Any]]:
        return list(reversed(self._tasks))

    def create_task(self, *, name: str, source_type: str, prompt: str | None = None, original_filename: str | None = None, svg_content: str | None = None, image_data_url: str | None = None, path_count: int = 0) -> dict[str, Any]:
        task = {
            'id': str(uuid4()),
            'name': name,
            'source_type': source_type,
            'prompt': prompt,
            'original_filename': original_filename,
            'svg_content': svg_content,
            'image_data_url': image_data_url,
            'path_count': path_count,
        }
        self._tasks.append(task)
        self._save()
        return task


task_library = TaskLibrary()
