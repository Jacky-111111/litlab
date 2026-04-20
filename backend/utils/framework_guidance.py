FRAMEWORK_GUIDANCE = {
    "IMRAD": {
        "description": "Standard empirical research structure.",
        "sections": [
            {
                "title": "Research Question",
                "explanation": "Define the exact question your project tries to answer.",
                "prompt": "What is your research question?",
            },
            {
                "title": "Background",
                "explanation": "Summarize what a new reader should know before reading your study.",
                "prompt": "What background does the reader need?",
            },
            {
                "title": "Method",
                "explanation": "Describe how you plan to collect or analyze evidence.",
                "prompt": "What method will you use?",
            },
            {
                "title": "Results",
                "explanation": "Capture expected or observed outcomes from your method.",
                "prompt": "What results do you expect or observe?",
            },
            {
                "title": "Discussion",
                "explanation": "Interpret what your findings mean and why they matter.",
                "prompt": "What do the results mean?",
            },
        ],
    },
    "Review / Survey": {
        "description": "Summarize and compare existing literature.",
        "sections": [
            {
                "title": "Topic Scope",
                "explanation": "Set clear boundaries for what literature you include.",
                "prompt": "What topic scope are you reviewing?",
            },
            {
                "title": "Search Strategy",
                "explanation": "Plan where and how you will search for sources.",
                "prompt": "How will you search for literature?",
            },
            {
                "title": "Theme Clusters",
                "explanation": "Group sources into recurring themes or categories.",
                "prompt": "What themes appear repeatedly?",
            },
            {
                "title": "Comparison of Sources",
                "explanation": "Identify agreements, disagreements, and methodology differences.",
                "prompt": "How do sources differ?",
            },
            {
                "title": "Research Gap",
                "explanation": "Highlight what remains unanswered in current research.",
                "prompt": "What gap or open question remains?",
            },
        ],
    },
    "Theoretical Paper": {
        "description": "Build an argument or conceptual model.",
        "sections": [
            {
                "title": "Problem Definition",
                "explanation": "State the central conceptual or theoretical challenge.",
                "prompt": "What is the core problem?",
            },
            {
                "title": "Assumptions",
                "explanation": "List assumptions that your argument relies on.",
                "prompt": "What assumptions are you making?",
            },
            {
                "title": "Proposition / Claim",
                "explanation": "Present your core claim or theoretical proposition.",
                "prompt": "What is your claim or proposition?",
            },
            {
                "title": "Reasoning / Proof Sketch",
                "explanation": "Explain why the claim should be accepted.",
                "prompt": "How do you justify it?",
            },
            {
                "title": "Implications",
                "explanation": "Connect your argument to broader impacts or future work.",
                "prompt": "Why does it matter?",
            },
        ],
    },
    "Case Study": {
        "description": "Analyze one specific case in depth.",
        "sections": [
            {
                "title": "Context",
                "explanation": "Describe the setting and stakeholders in the case.",
                "prompt": "What is the context?",
            },
            {
                "title": "Problem",
                "explanation": "Identify the core issue, event, or challenge.",
                "prompt": "What happened or what is the issue?",
            },
            {
                "title": "Evidence / Observations",
                "explanation": "Record observations, data points, or artifacts for analysis.",
                "prompt": "What evidence do you have?",
            },
            {
                "title": "Analysis",
                "explanation": "Interpret evidence and connect it to your research question.",
                "prompt": "What does it reveal?",
            },
            {
                "title": "Reflection / Implications",
                "explanation": "Extract lessons and discuss broader relevance.",
                "prompt": "What broader lesson follows?",
            },
        ],
    },
}


def get_framework_guidance(framework_type: str) -> dict:
    return FRAMEWORK_GUIDANCE.get(framework_type, {"description": "", "sections": []})
