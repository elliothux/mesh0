---
name: build-loop
description: Manual project-local build loop. Use only when the user explicitly invokes `$build-loop`, `/build-loop`, or says to use the build-loop skill. Do not invoke automatically for ordinary build, implementation, debugging, or long-running work.
---

# Build Loop

Use this skill only after an explicit user invocation.

This skill turns a task into a persistent execution loop. The loop contract lives in repository-root `PROGRESS.md`, and `PROGRESS.md` becomes the source of truth for the goal, scope, cycle process, acceptance criteria, exit conditions, current state, and next action.

The main failure mode is goal drift after long context, interruptions, or context compression. Prevent drift by writing the loop contract clearly, rereading it before each cycle, and updating it after every step.

## Manual Trigger Only

Accepted trigger forms:

- `$build-loop`
- `/build-loop`
- `$build-loop resume`
- `/build-loop resume`
- an explicit phrase such as "use the build-loop skill"

Do not invoke this skill for normal implementation, debugging, test fixing, or long-running work unless the user explicitly names the skill or command.

## Required Intake

Before starting a fresh loop, ask the user for the loop contract and wait for the answer.

Ask these questions in one concise message:

1. What is the current goal?
2. What should each loop cycle do?
3. What are the acceptance criteria?
4. What are the exit conditions and scope boundaries?

If the invocation message already contains all four answers, write a short contract summary and ask for confirmation before starting the loop.

If the user invokes resume mode and `PROGRESS.md` already contains a complete active loop contract, read `PROGRESS.md` and continue from `Next Exact Action`. Ask only when required contract fields are missing or conflict with the latest user message.

## Loop Contract Rules

After intake, create or refresh repository-root `PROGRESS.md`.

If `PROGRESS.md` already exists:

1. Read it first.
2. If it belongs to the same build loop, update it in place.
3. If it belongs to another active task, ask the user whether to replace it or merge the task before editing it.

Treat these fields as locked unless the user explicitly changes them:

- Goal
- Scope boundaries
- Per-cycle procedure
- Acceptance criteria
- Exit conditions

When the user changes a locked field, add an entry to `Contract Amendments` with the timestamp, changed field, previous value, new value, and user-provided reason or quote.

## Execution Loop

Run the loop continuously until the exit conditions are met.

For each cycle:

1. Read `PROGRESS.md`.
2. Restate the locked contract internally before choosing work.
3. Set `Current State > Next Exact Action` before performing the next step.
4. Perform exactly that step.
5. Update `PROGRESS.md` immediately after the step with:
   - what changed
   - files touched
   - commands run
   - raw errors or blockers
   - decision made, if any
   - next exact action
6. Check acceptance criteria and exit conditions.
7. If acceptance is incomplete, start the next cycle from `Next Exact Action`.

Do not stop on ordinary failures. A failed command, test failure, build failure, or rejected hypothesis becomes the next loop input. Record the raw failure and continue with a fix or narrower diagnosis.

Pause only for a real external blocker:

- required user decision that cannot be inferred
- required secret, credential, account action, or device permission
- a destructive action that needs explicit approval
- a repository rule that requires asking the user
- safety or permission boundary

When pausing for a blocker, update `PROGRESS.md` first and make the blocker, attempted actions, raw error, and required user action explicit.

## Resume After Context Compression

After context compression, interruption, or a new session:

1. Read `PROGRESS.md` before planning or editing.
2. Treat `Loop Contract` as the source of truth over chat memory.
3. Confirm the current branch and git state.
4. Inspect files named in `Touched Files` and the latest cycle entries.
5. Continue from `Current State > Next Exact Action`.
6. Keep the same acceptance criteria and exit conditions unless the user explicitly amends them.

If `PROGRESS.md` is missing or incomplete in resume mode, ask the required intake questions again.

## PROGRESS.md Template

Use this template for build-loop work. Keep it concise enough to reread every cycle, but complete enough for a fresh session to continue without chat history.

```markdown
# Build Loop Progress

## Snapshot

- Updated: <YYYY-MM-DD HH:mm:ss TZ>
- Repository: <absolute repository path>
- Branch: <current branch>
- Head: <short commit hash and subject>
- Mode: build-loop
- Status: intake | running | blocked | exit-satisfied

## Loop Contract

### Goal

<The user-approved goal. Keep wording stable.>

### Scope Boundaries

- In scope:
  - <paths, behaviors, modules, workflows, or constraints>
- Out of scope:
  - <explicit exclusions and protected areas>

### Per-Cycle Procedure

1. <What each loop cycle should do, in user-approved terms.>
2. <Repeatable action or verification step.>
3. <How to decide the next cycle input.>

### Acceptance Criteria

- [ ] <criterion with observable evidence>
- [ ] <criterion with observable evidence>

### Exit Conditions

- <Concrete condition that ends the loop>
- <Required verification command or artifact>

### Stop Conditions Requiring User Input

- <Credential, approval, destructive operation, or unresolved product decision>

## Contract Amendments

| Time     | Field | Previous | New | Source |
| -------- | ----- | -------- | --- | ------ |
| None yet |       |          |     |        |

## Current State

- Active Cycle: <number>
- Current Step ID: <BL-001>
- Current Step: <short action being executed>
- Current Hypothesis: <what is being tested or changed>
- Next Exact Action: <one concrete command, edit, inspection, or verification>
- Last Completed Action: <latest completed step>
- Last Command: `<command>` -> <result>
- Last Raw Error: <raw error text or None>

## Work Queue

| ID     | Status  | Task         | Evidence / Notes              |
| ------ | ------- | ------------ | ----------------------------- |
| BL-001 | pending | <first task> | <path, command, or criterion> |

Statuses: `pending`, `running`, `done`, `blocked`, `dropped`.

## Touched Files

| Path     | Purpose       | Status                     |
| -------- | ------------- | -------------------------- |
| `<path>` | <why touched> | <planned/changed/verified> |

## Cycle Log

### Cycle <number> - <YYYY-MM-DD HH:mm:ss TZ>

- Contract check: <one sentence confirming the goal and exit condition>
- Planned step: <the exact step chosen from Current State>
- Actions:
  - <file edits, inspections, commands>
- Result:
  - <what happened>
- Issues:
  - <raw error, blocker, failed assumption, or None>
- Decisions:
  - <decision and reason, or None>
- Next Exact Action:
  - <one concrete next action>

## Issues And Blockers

| ID       | Status | Symptom / Raw Error | Suspected Cause | Next Action |
| -------- | ------ | ------------------- | --------------- | ----------- |
| None yet |        |                     |                 |             |

## Verification Evidence

| Time     | Command / Check | Result | Evidence |
| -------- | --------------- | ------ | -------- |
| None yet |                 |        |          |

## Resume Instructions

1. Read this file first.
2. Treat `Loop Contract` as the source of truth.
3. Continue from `Current State > Next Exact Action`.
4. Update this file before and after each meaningful step.
5. Preserve raw errors and failed commands.
6. Check acceptance criteria and exit conditions at the end of each cycle.
```

## Progress Update Standard

Every update to `PROGRESS.md` must preserve:

- the locked goal
- the locked scope boundaries
- the current cycle number
- the next exact action
- raw error details when a step fails
- acceptance and exit status

Prefer stable task IDs such as `BL-001`, `BL-002`, and keep those IDs across sessions. When dropping or replacing a task, change its status to `dropped` and write the reason instead of deleting it.

## Finalization

When exit conditions are met:

1. Update `Status` to `exit-satisfied`.
2. Mark all satisfied acceptance criteria.
3. Record final verification evidence.
4. Write a short final response that names the result, the verification, and the `PROGRESS.md` state.

For code changes, follow repository maintenance rules after the loop work is complete.
