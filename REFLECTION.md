# Reflection

## What went well

- Designed a simple end-to-end flow that matches the MVP success criteria.
- Kept paper search normalization explicit and beginner-friendly.
- Implemented framework guidance in both backend and frontend for explainability.

## Trade-offs

- Used localStorage-based frontend configuration for a static, no-build setup.
- Chose lightweight recommendation logic (keyword extraction + follow-up search) over ranking complexity.

## Next improvements

- Add saved AI output history in `ai_outputs`.
- Add richer edit UI and optimistic updates for project metadata.
- Add automated tests for core endpoint behavior.
