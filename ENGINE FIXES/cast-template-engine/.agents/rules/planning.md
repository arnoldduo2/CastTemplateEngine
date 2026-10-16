# Planning Protocol & Artifact Rules

Whenever the user asks for a plan, design, or architecture ("plan", "plan mode", "tell me how", etc.):
1. **Always generate a markdown artifact document** in `<appDataDir>\brain\<conversation-id>\<descriptive_plan_name>.md`.
2. **Set `RequestFeedback: true` and `UserFacing: true`** on the artifact so the user can interactively comment, review, and make design decisions directly in the IDE UI.
3. **Do not execute code** until the plan artifact has been reviewed and approved by the user.
4. Highlight open questions, options, and key decisions prominently within the artifact.
