import os

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
