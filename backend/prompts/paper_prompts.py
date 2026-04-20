def summary_prompt(paper_title: str, paper_abstract: str, authors: list[str], year: int | None) -> str:
    return f"""
You are helping a beginner student researcher understand a paper.
Only use details provided below. If details are missing, clearly say what is unknown.

Paper title: {paper_title}
Authors: {", ".join(authors) if authors else "Unknown"}
Year: {year or "Unknown"}
Abstract: {paper_abstract or "No abstract provided"}

Return exactly three sections:
1) Main idea
2) Key contribution
3) Why it matters

Keep it concise and beginner-friendly.
""".strip()


def explain_prompt(paper_title: str, paper_abstract: str, authors: list[str], year: int | None) -> str:
    return f"""
You are an academic mentor explaining a paper to a first-time student researcher.
Do not invent facts. If the abstract is limited, mention uncertainty.

Paper title: {paper_title}
Authors: {", ".join(authors) if authors else "Unknown"}
Year: {year or "Unknown"}
Abstract: {paper_abstract or "No abstract provided"}

Return exactly three sections:
1) What this paper is about
2) Key terms in simple words
3) Why a student should care

Use plain language and short paragraphs.
""".strip()


def quiz_prompt(paper_title: str, paper_abstract: str, authors: list[str], year: int | None) -> str:
    return f"""
Create 3 to 5 conceptual quiz questions for a beginner student researcher.
Questions should test understanding (not memorization) and be answerable from the paper context.
Do not include answers.

Paper title: {paper_title}
Authors: {", ".join(authors) if authors else "Unknown"}
Year: {year or "Unknown"}
Abstract: {paper_abstract or "No abstract provided"}

Output as a numbered list only.
""".strip()


def read_paper_analysis_prompt(
    paper_title: str,
    paper_abstract: str,
    authors: list[str],
    year: int | None,
    source: str,
    source_url: str = "",
) -> str:
    return f"""
You are LitLab AI, helping a beginner researcher deeply but clearly understand one paper.
Do not invent details. If information is missing, explicitly state "Unknown from provided material".

Paper metadata:
- Source type: {source}
- Title: {paper_title}
- Authors: {", ".join(authors) if authors else "Unknown"}
- Year: {year or "Unknown"}
- URL: {source_url or "Unknown"}
- Abstract / extracted content:
{paper_abstract or "No abstract or content was provided."}

Return exactly 6 sections using markdown headings:
## 1) Paper Overview
Short summary in 4-6 sentences.

## 2) Key Knowledge Points
Provide 4-8 bullet points explaining the most important ideas.

## 3) Key Terms Explained
Provide 5-10 key terms with one-sentence beginner-friendly definitions.

## 4) Research Domain
Identify the likely research field/subfield and explain why.

## 5) Author Analysis
Based only on available evidence, analyze author perspective, likely expertise signals, and possible blind spots.

## 6) Suggested Next Reads
Recommend what kind of papers should be read next (methods paper, survey, replication, etc.) and why.

Keep output practical, concrete, and beginner-friendly.
""".strip()
