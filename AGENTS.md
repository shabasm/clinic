# Token-Efficient Development Rules

- Inspect only files relevant to the current task.
- Before exploring, check existing project structure and reuse established patterns.
- Make the smallest complete change. Do not refactor unrelated code.
- Do not scan the entire repository unless necessary.
- Do not spawn subagents or perform browser research unless explicitly needed.
- Avoid repeated terminal commands, redundant tests, and repeated file reads.
- Run only the relevant tests after making changes.
- Keep responses short. Report changed files, test results, and blockers only.
- Never repeat large code blocks or logs unnecessarily.
- Maintain existing architecture and naming conventions.
- For Django, check the relevant models, serializers, views, and URLs before changing API behaviour.
- For React, inspect only the relevant components, services, and routes.
- Never claim that code works without appropriate verification.
- Stop when the requested task is complete. Ask before expanding scope.