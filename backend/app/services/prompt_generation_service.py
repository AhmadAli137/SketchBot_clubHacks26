from __future__ import annotations

import os
import re

from openai import OpenAI


class PromptGenerationService:
    def __init__(self) -> None:
        self._client: OpenAI | None = None

    def _client_or_none(self) -> OpenAI | None:
        if self._client is not None:
            return self._client
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            return None
        self._client = OpenAI(api_key=api_key)
        return self._client

    def generate_svg(self, prompt: str) -> str:
        client = self._client_or_none()
        if client is None:
            return self._fallback_svg(prompt)

        response = client.responses.create(
            model='gpt-5.4',
            input=(
                'Create a minimal black and white SVG for a drawing robot. '
                'Return SVG only, no markdown. '
                'Use white background, black strokes/fills only, simplify aggressively, '
                'prefer line art or iconic shapes, avoid shading, avoid tiny details. '
                f'User prompt: {prompt}'
            ),
        )
        text = getattr(response, 'output_text', '') or ''
        svg = text.strip()
        if '<svg' not in svg:
            return self._fallback_svg(prompt)
        return svg

    def _fallback_svg(self, prompt: str) -> str:
        text = re.sub(r'[^A-Za-z0-9 ]+', '', prompt.strip().upper())[:20] or 'SKETCHBOT'
        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="white"/>
  <rect x="32" y="32" width="448" height="448" fill="none" stroke="black" stroke-width="16"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="54" fill="black">{text}</text>
</svg>'''


prompt_generation_service = PromptGenerationService()
