def _clip(text: str, max_len: int = 600) -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def _format_notes(notes: dict[str, str]) -> str:
    if not notes:
        return "(The student has not filled in any framework notes yet.)"
    lines: list[str] = []
    for section, content in notes.items():
        clean = (content or "").strip()
        if not clean:
            lines.append(f"- {section}: (empty)")
        else:
            lines.append(f"- {section}:\n    {_clip(clean, 500)}")
    return "\n".join(lines) if lines else "(empty)"


def _format_papers(papers: list[dict]) -> str:
    if not papers:
        return "(The student has not saved any papers yet.)"
    lines: list[str] = []
    for index, paper in enumerate(papers, start=1):
        title = (paper.get("nickname") or paper.get("title") or "Untitled").strip()
        authors = ", ".join((paper.get("authors") or [])[:4]) or "Unknown authors"
        year = paper.get("year") or "n.d."
        abstract = _clip(paper.get("abstract") or "", 400)
        abstract_part = f"\n    Abstract: {abstract}" if abstract else ""
        lines.append(f"{index}. {title} — {authors} ({year}){abstract_part}")
    return "\n".join(lines)


def project_advisor_prompt(
    *,
    project_title: str,
    project_description: str,
    framework_type: str,
    project_goal: str,
    notes: dict[str, str],
    papers: list[dict],
) -> str:
    """Prompt that asks the model for direction suggestions and scores.

    The response must be a single JSON object with this shape:

        {
          "summary": str,                 # 2-3 sentence overall read-out
          "scores": {
              "innovation": int 0-10,
              "feasibility": int 0-10,
              "scope_clarity": int 0-10,
              "literature_coverage": int 0-10,
              "methodology_strength": int 0-10
          },
          "score_rationales": {           # 1 short sentence per score
              "innovation": str,
              ...
          },
          "writing_directions": [         # 3-5 items
              {"title": str, "description": str, "based_on": str}
          ],
          "innovation_angles": [          # 3-5 items
              {"title": str, "description": str, "rationale": str}
          ],
          "risks": [                      # 2-4 items
              {"label": str, "mitigation": str}
          ],
          "next_steps": [str, ...]        # 3-5 items
        }
    """
    notes_block = _format_notes(notes)
    papers_block = _format_papers(papers)

    schema_hint = (
        '{\n'
        '  "summary": "2-3 sentence read-out of the project\'s current state",\n'
        '  "scores": {\n'
        '    "innovation": 0-10 integer,\n'
        '    "feasibility": 0-10 integer,\n'
        '    "scope_clarity": 0-10 integer,\n'
        '    "literature_coverage": 0-10 integer,\n'
        '    "methodology_strength": 0-10 integer\n'
        '  },\n'
        '  "score_rationales": {\n'
        '    "innovation": "short sentence",\n'
        '    "feasibility": "short sentence",\n'
        '    "scope_clarity": "short sentence",\n'
        '    "literature_coverage": "short sentence",\n'
        '    "methodology_strength": "short sentence"\n'
        '  },\n'
        '  "writing_directions": [\n'
        '    {"title": "direction name", "description": "why this angle works in 1-2 sentences", "based_on": "which note or paper grounds it"}\n'
        '  ],\n'
        '  "innovation_angles": [\n'
        '    {"title": "angle name", "description": "the novel twist in 1-2 sentences", "rationale": "why this is under-explored"}\n'
        '  ],\n'
        '  "risks": [\n'
        '    {"label": "risk in a few words", "mitigation": "1 concrete way to lower it"}\n'
        '  ],\n'
        '  "next_steps": ["concrete next action", "..."]\n'
        '}'
    )

    return f"""
You are LitLab's research direction advisor for a beginner student researcher.
You are given the project's metadata, the student's framework notes, and the
papers they have saved to the project. Based ONLY on these inputs, propose
concrete writing directions and innovation angles and score the project
across several dimensions.

Project title: {project_title or "(untitled)"}
Framework: {framework_type or "(unspecified)"}
Goal: {_clip(project_goal, 800) or "(not provided)"}
Description: {_clip(project_description, 800) or "(not provided)"}

Framework notes (keyed by section):
{notes_block}

Saved papers:
{papers_block}

Rules:
- Be concrete and grounded. Reference specific notes or paper titles in
  "based_on" / "rationale" where it helps.
- If the inputs are sparse, lower the scores accordingly and say so in
  score_rationales; do not invent facts or papers.
- Scores are integers 0-10. 5 is "adequate"; 8+ means genuinely strong.
- Keep every sentence short and easy to read for a first-time researcher.
- Return 3-5 writing_directions, 3-5 innovation_angles, 2-4 risks, 3-5 next_steps.
- Respond with exactly one JSON object, no prose around it.

JSON schema you MUST follow (types and keys):
{schema_hint}
""".strip()
