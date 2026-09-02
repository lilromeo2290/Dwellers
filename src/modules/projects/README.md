# Module: Projects

Owns customer projects and the delivery work performed on them: tasks,
milestones, budgets, documents and progress reporting.

## Responsibilities
- Project lifecycle: draft → active → completed → archived.
- Task/milestone breakdown with provider assignment.
- Budget tracking in integer pesewas with line items.
- Document/image attachments (via storage module, permission-checked).
- Progress reports from assigned providers (artisan/contractor/company).

## Design rules
- A project belongs to one customer; participants see only their projects.
- Every read/write verifies membership before returning data (IDOR).
- State transitions are validated server-side; the UI cannot skip steps.

## Planned API surface
- `GET/POST /api/projects` · `GET/PATCH /api/projects/[id]`
- `POST /api/projects/[id]/milestones` · `/api/projects/[id]/documents`
- `POST /api/projects/[id]/progress`

## Dependencies
Identity (roles), Communication (notifications), Storage, Commerce (quotes).
