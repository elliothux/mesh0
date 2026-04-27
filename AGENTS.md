# AGENTS - mesh0

## Purpose

- Only encode rules the model cannot infer from general training.
- Prefer explicit commands, paths, and constraints over generic advice.

## Scope & Precedence

- This root `AGENTS.md` applies to the full repository.
- No additional `AGENTS.md` files are allowed anywhere else in the repository.
- Generated files must never be hand-edited.

## Command Checklist

- Format: `bun run format`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Check: `bun run check`

## Hard Rules

Rules below are invariants. Violating any of these creates bugs or maintenance risk.

### Implementation

- Default to the smallest working implementation. Keep code paths short, direct, and local.
- Treat the repository as a monolith. Coupling is acceptable when it keeps the implementation simpler.
- Keep concerns separated by layer. Let the layer that owns an input or behavior assemble it, and let downstream layers consume that structured result directly.
- Assign one source of truth for each piece of data. Compute or normalize it in one place, then pass it through instead of recomputing it in multiple layers.
- When working on Codex-related behavior, treat `externals/codex` as the primary source of truth before external docs, generated artifacts, bundled files, or assumptions.
- Do not add abstraction, wrappers, helper layers, or encapsulation unless they clearly remove real duplication or complexity.
- Forbid no-op wrappers and function-call forwarding. Do not introduce helper functions that only pass arguments through to another function without adding necessary behavior.
- Do not leave partial refactors behind. If a parameter, branch, helper, or state path becomes unused during a change, remove the dead upstream/downstream wiring in the same diff instead of leaving placeholder code like `void foo`.
- Do not preserve historical compatibility by default. For any change, prefer the most reasonable and simplest design now.
- Do not add defensive fallback code that hides the real issue; fix the root cause or fail fast.
- Required config must be validated in schema/env parsing first; prefer schema validation over runtime presence checks.

### Boundaries

- Never run destructive git operations unless explicitly requested by the user.
- Keep changes scoped to the user request; avoid unrelated edits.
- If schema or infrastructure commands are risky, stop and ask before running.

### Data & Persistence

- If persistent storage is added, keep schema as single source of truth in one owned module/package.
- Forbid runtime/manual schema patching in app startup logic.
- All persisted data must be normalized and preprocessed before writing to storage.

### Error Handling

- Fail fast; prefer throwing over local fallbacks.
- `try/catch` is only for semantic transformation, required cleanup, or explicit crash boundaries.
- Fire-and-forget effects: use `void`; no defensive catches unless user-visible behavior must change.
- Preserve raw error messages by default. Do not replace detailed system or tool errors with generic fallback text unless redaction is strictly required for safety.

### Server Responses

- Do not return derived/computed data from server routes by default.
- Prefer returning raw persisted/source data and let downstream layers derive presentation fields when needed.

### Project Structure

- Treat root `package.json` as the single owner of all dependency declarations.
- Declare all external dependencies and internal workspace package dependencies in root `package.json`, including dependencies used by code under `apps/*` and `packages/*`.
- Keep folder ownership explicit: app-local code stays in `apps/*`; shared code stays in `packages/*`.
- Frontend filenames use lowercase with hyphens unless framework conventions require otherwise.
- No re-exports by default; import from the source file that defines the symbol.

### Dependencies

- Add dependencies via package manager commands; do not hand-edit lockfiles.
- Do not add dependency declarations to workspace-local `package.json` files.
- Avoid adding dependencies when existing platform/library APIs already solve the need.

### Code Style

- Prefer destructuring (in assignments and function parameters) over repeated property access.
- Keep exports minimal; do not export symbols unused outside the file.
- KISS aggressively. Prefer fewer branches, fewer helpers, fewer layers, and fewer lines of code.

### Types & Packages

- Reuse shared types and schema from `packages`; do not redeclare or fork duplicates locally.
- Keep types aligned with source schema and runtime behavior; avoid drift between storage, API, and UI shapes.
- Do not use `any`.
- Do not use `as` casts unless there is no sound alternative.
- Prefer narrowing, generics, and deriving types from the source.
- Prefer explicit source types over indexed/reference indirection when the source type can be imported directly.

### Frontend

- Move static non-primitive values outside React components.
- Split components by concern; extract only when reuse is real.
- Keep prop shapes direct; avoid ad-hoc objects at call sites.

### Testing

- Prefer tests that exercise real user-facing paths instead of implementation details.
- Keep fixtures realistic and minimal.
- Avoid test-only hooks that bypass true runtime behavior unless explicitly required.

### Git

- Keep diffs focused; avoid unrelated edits.
- Do not rewrite history unless explicitly requested.

### Debug & Logging

- Prefer structured logging paths over ad-hoc prints in production code.
- Keep full error objects when logging failures.
- Analyze source-level behavior before inspecting bundled/minified/generated artifacts.

## Maintenance

- After each code change: clean up dead code -> run `bun run typecheck` and `bun run lint` -> fix errors.
- Documentation-only and non-code edits do not require `bun run typecheck` or `bun run lint`.
- Split files before they exceed 800 lines.
- Trace issues to root cause; avoid fallback-only fixes.
- After each turn, reflect on the result:
  - Is this the simplest implementation that works?
  - Did I add unnecessary abstraction, encapsulation, or fallback logic?
  - Can the same behavior be achieved with less code or a more direct approach?
  - If yes, refactor immediately.

## Documentation & Communication

- Code comments/docs: English. Conversational responses: Chinese.
- End every response with `喵~`.

## Talk normal

Be direct and informative. No filler, no fluff, but give enough to be useful.

- Lead with the answer, then add context only if it genuinely helps.
- Do not use negation-based contrastive phrasing in any position, including chained or symmetric forms.
- End with a concrete recommendation or next step when relevant.
- Remove filler phrases and repeated framing language.
- Never restate the question.
- Yes/no questions: answer first, then one sentence of reasoning.
- Comparisons: give a recommendation with brief reasoning.
