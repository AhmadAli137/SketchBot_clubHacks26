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
                'You create SVGs for a pen plotter / drawing robot. '
                'Return ONLY valid SVG markup. No markdown, no explanation, no code fences. '
                'Hard requirements: white background, black line art only, no text, no captions, no labels, no decorative border, no frame, no poster layout, no shading, no gradients, no color except black on white. '
                'The drawing must depict the requested subject itself, not the words describing it. '
                'Keep it centered, large on the page, simple, bold, and robot-friendly. '
                'Prefer a single subject with thick clean strokes and very few paths. '
                'Use a square 512x512 viewBox. '
                'Do not include tiny details. Do not include any <text> elements. '
                f'User request: {prompt}'
            ),
        )
        text = getattr(response, 'output_text', '') or ''
        svg = text.strip()
        if '<svg' not in svg or '<text' in svg.lower():
            return self._fallback_svg(prompt)
        return svg

    def _fallback_svg(self, prompt: str) -> str:
        prompt_l = prompt.lower()
        if 'smiley' in prompt_l or 'smile' in prompt_l or 'happy face' in prompt_l:
            return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="white"/>
  <circle cx="100" cy="100" r="70" fill="none" stroke="black" stroke-width="8"/>
  <circle cx="75" cy="80" r="7" fill="black"/>
  <circle cx="125" cy="80" r="7" fill="black"/>
  <path d="M65 120 Q100 150 135 120" fill="none" stroke="black" stroke-width="8" stroke-linecap="round"/>
</svg>'''
        if 'cat' in prompt_l:
            return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="white"/>
  <path d="M50 80 L70 40 L95 70 Q100 75 105 70 L130 40 L150 80 Q150 130 100 150 Q50 130 50 80 Z" fill="none" stroke="black" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="78" cy="95" r="5" fill="black"/>
  <circle cx="122" cy="95" r="5" fill="black"/>
  <path d="M100 108 L94 118 L106 118 Z" fill="black"/>
  <path d="M100 118 Q92 126 84 124" fill="none" stroke="black" stroke-width="4" stroke-linecap="round"/>
  <path d="M100 118 Q108 126 116 124" fill="none" stroke="black" stroke-width="4" stroke-linecap="round"/>
  <path d="M92 116 L58 110 M92 120 L58 120 M92 124 L58 130" fill="none" stroke="black" stroke-width="4" stroke-linecap="round"/>
  <path d="M108 116 L142 110 M108 120 L142 120 M108 124 L142 130" fill="none" stroke="black" stroke-width="4" stroke-linecap="round"/>
</svg>'''
        if 'house' in prompt_l:
            return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="white"/>
  <path d="M45 95 L100 45 L155 95" fill="none" stroke="black" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="60" y="95" width="80" height="60" fill="none" stroke="black" stroke-width="8"/>
  <rect x="90" y="118" width="20" height="37" fill="none" stroke="black" stroke-width="6"/>
  <rect x="70" y="108" width="18" height="18" fill="none" stroke="black" stroke-width="5"/>
  <rect x="112" y="108" width="18" height="18" fill="none" stroke="black" stroke-width="5"/>
</svg>'''
        return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="white"/>
  <circle cx="100" cy="100" r="60" fill="none" stroke="black" stroke-width="8"/>
  <path d="M100 55 L100 145" fill="none" stroke="black" stroke-width="8" stroke-linecap="round"/>
  <path d="M55 100 L145 100" fill="none" stroke="black" stroke-width="8" stroke-linecap="round"/>
</svg>'''


prompt_generation_service = PromptGenerationService()
