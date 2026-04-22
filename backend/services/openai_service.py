import json
import os
import re
from typing import Any

from fastapi import HTTPException, status
from openai import OpenAI


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OpenAI is not configured. Add OPENAI_API_KEY to backend environment.",
        )
    return OpenAI(api_key=api_key)


def generate_text(prompt: str) -> str:
    client = _get_client()
    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.3,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are LitLab AI. Help beginner researchers with short, accurate, structured output."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not generate AI output right now: {exc}",
        ) from exc

    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned empty content.",
        )
    return content.strip()


def generate_json(prompt: str, *, system: str | None = None, temperature: float = 0.4) -> dict[str, Any]:
    """Ask the model for a JSON object and parse it defensively.

    The model is instructed via `response_format` to return JSON. We still
    strip common wrappers (```json ... ```) and fall back to extracting the
    first top-level JSON object if parsing fails, so transient formatting
    issues do not break the feature.
    """
    client = _get_client()
    system_prompt = system or (
        "You are LitLab AI. Respond ONLY with a single valid JSON object that "
        "matches the schema in the user's instructions. Do not include any "
        "prose outside the JSON."
    )

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not generate AI output right now: {exc}",
        ) from exc

    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned empty content.",
        )

    raw = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned invalid JSON. Please retry.",
        )
