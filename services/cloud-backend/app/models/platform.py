from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class TutorPersona(BaseModel):
    name: str
    personality: str
    greeting_message: str
    system_prompt: str
    avatar: str
    accent_color: str


class RobotDefinition(BaseModel):
    id: str
    name: str
    tagline: str
    description: str
    version: str
    avatar: str
    accent_color: str
    tutor_persona: TutorPersona
    capabilities: list[str]
    compatible_modules: list[str]
    challenge_pack_ids: list[str]
    firmware_repo: str | None = None


class ModuleDefinition(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    unlocks_capabilities: list[str]
    unlocks_challenge_packs: list[str]


class Badge(BaseModel):
    id: str
    name: str
    description: str
    icon: str


class RobotAction(BaseModel):
    type: str
    payload: dict[str, Any] | None = None


class ChallengeStep(BaseModel):
    id: str
    tutor_message: str
    hint: str | None = None
    robot_action: RobotAction | None = None
    student_prompt: str | None = None
    reflection_question: str | None = None
    completion_condition: str  # automatic | student-confirms | camera-detects
    duration_hint: int | None = None  # seconds


class Challenge(BaseModel):
    id: str
    pack_id: str
    robot_id: str
    required_modules: list[str]
    title: str
    subtitle: str | None = None
    description: str
    subjects: list[str]
    difficulty: int  # 1–5
    estimated_minutes: int
    learning_objectives: list[str]
    steps: list[ChallengeStep]
    completion_badge: Badge | None = None
    prerequisite_challenge_ids: list[str] = []


class ChallengePack(BaseModel):
    id: str
    robot_id: str
    name: str
    description: str
    challenges: list[Challenge]


class RobotRegistryResponse(BaseModel):
    robots: list[RobotDefinition]


class ChallengeLibraryResponse(BaseModel):
    packs: list[ChallengePack]
