# @hrai/server

The hrai tutor server. It renders a child's live Scratch project for a local model,
keeps tutoring state, evaluates authored lesson progress, and runs model capability evals.

## Why model evals are part of the server

The hrai design bets that rendering a child's project as *pseudo-Scratch text* lets a small
local model do what comparable systems need a frontier hosted model for. Model comprehension
and game-planning quality are measured rather than assumed.

## Running the evals

```sh
ollama serve
ollama pull qwen3:14b
npm test --workspace=packages/hrai-server
```

Point elsewhere with `HRAI_EVAL_MODEL` and `HRAI_EVAL_HOST`. If the model is unavailable the
suite **skips loudly** with the reason printed — it never passes silently, because a green
run that tested nothing is worse than a red one.

## Model backends

`HRAI_MODEL_BACKEND` selects how the tutor reaches a model:

| Value | How it runs |
| - | - |
| `ollama` (default) | HTTP to `/api/chat` |
| `llama.cpp` | HTTP to the OpenAI-compatible `/v1/chat/completions` |
| `cursor` | spawns `cursor-agent -p --mode ask` |
| `pi` | spawns `pi -p --mode json --no-tools` |
| `codex` | spawns `codex exec --json -s read-only` |

The three agent backends run a locally installed coding-agent CLI in its non-interactive mode and
parse its JSONL output. They need no model server:

```sh
HRAI_MODEL_BACKEND=cursor npm start --workspace=packages/hrai-server
HRAI_MODEL_BACKEND=codex  npm run eval:game-design --workspace=packages/hrai-server
```

**These CLIs call hosted APIs.** With an agent backend the child's rendered project and chat leave
the machine and reach Cursor, OpenAI or the provider `pi` is configured with. The two HTTP backends
stay local, and the Compose deployment still uses llama.cpp. `pi` can also drive local models — its
listing shows them under the `local` provider.

Each CLI runs with its tools restricted and with an empty temporary directory as its working
directory, so it cannot reach the source tree and no `AGENTS.md` is pulled into the prompt.

| Variable | Meaning |
| - | - |
| `HRAI_OLLAMA_MODEL`, `HRAI_LLAMA_MODEL`, `HRAI_CURSOR_MODEL`, `HRAI_PI_MODEL`, `HRAI_CODEX_MODEL` | default model for that one backend; wins over everything below |
| `HRAI_AGENT_MODEL` | model for the selected agent CLI when it has no per-backend variable |
| `HRAI_AGENT_TIMEOUT_MS` | per-call timeout, default `120000` |
| `HRAI_AGENT_CWD` | sandbox working directory, default a fresh empty temp dir |

The per-backend variables exist because one global model name cannot serve five backends: a name
`ollama` understands is rejected by `cursor-agent`, and the reverse. Unset means the backend picks —
for an agent CLI that is the CLI's own default, so `--model` is left off entirely.

`HRAI_MODEL_HOST` and `HRAI_EVAL_HOST` configure whichever backend `HRAI_MODEL_BACKEND` selects.
A backend picked at runtime uses `HRAI_OLLAMA_HOST` or `HRAI_LLAMA_HOST` instead, because a host
belonging to one backend is wrong for another.

## Block labels and argument order

The render fills each block's label template from `scratch-l10n` in the child's locale. The
order of a block's arguments comes from `src/data/slot-order.json`, generated from the
scratch-blocks definitions. Regenerate it after upgrading scratch-blocks:

```sh
npm run build:slot-order --workspace=packages/hrai-server
```

## Running it against the editor

Three terminals:

```sh
ollama serve                                    # 1. the model
npm start --workspace=packages/hrai-server      # 2. the tutor server on :8791
npm start --workspace=packages/scratch-gui      # 3. the editor on :8601
```

Then open the editor with the panel switched on:

```
http://localhost:8601/?hrai=true
```

The panel is off without `?hrai=true`, because it needs a local model server and an
editor that silently fails to reach one is confusing. If the server is down the panel
still opens and says so calmly — a child should never meet a stack trace.

Override the server location with `HRAI_SERVER_URL` at build time, and the port it
listens on with `HRAI_PORT`.

Self-hosted profiles and projects use the HTTP API on the same server. Set
`HRAI_DATA_DIR` to a persistent directory (the Compose deployment uses `/data`).
The API provides `/api/auth/*`, `/api/profile`, and `/api/projects`; sessions use
HttpOnly cookies and project data is private to its owner. Assistant preferences
(persona, answer length, assistant name, encouragement, and the model provider and
model) are stored with the profile and applied to future tutor connections. The
current tutor remains Czech; language selection is intentionally not exposed until
prompt localization is complete.

`GET /api/models` lists the backends this server can reach and the models each offers, which is
what fills the provider and model controls in assistant settings. Choosing a provider there
overrides `HRAI_MODEL_BACKEND` for that profile; leaving it on *Server default* keeps the
environment's choice. A profile naming a backend that has since become unavailable falls back to
the default with a warning rather than failing the child's question.

The model is remembered **per provider**, in a `modelByBackend` map on the profile, so switching
from Cursor to pi and back keeps each one's choice. An absent entry means that backend's own
default. Both the map's keys and its values are validated on the way in: a key must be a known
backend id, and a value must be at most 100 characters of `[A-Za-z0-9._:/+-]` and may not start with
`-`, because it becomes an argv token handed to a spawned CLI.

For local Docker deployment, see [`docker/README.md`](../../docker/README.md).

## Goal-driven custom games

A custom game starts in the chat as a proposal, not an active tutorial. The editor collects the
child's first idea through the normal composer, then offers to continue in the current project or
start a new one when the workspace already contains meaningful work. The server asks the model
for a small, structured `GamePlan`, validates and normalizes it, and emits `gamePlanProposed`.
After `gamePlanAccept`, the editor installs a small playable prototype and enters a playtest phase.
The child can run the game and describe what to change before selecting `gameGuide`; only then does
the milestone tutor become active. That playtest feedback is included in the first tutor context.
The guided plan keeps the child's original goal, core loop, and current learning milestone in every
tutor prompt. This prevents a short chat history from silently
replacing the game the child wanted to make.

The planning model never supplies child-visible Scratch scripts or block sequences. Each milestone
also carries a hidden, validated structural evidence contract. The contract uses only four bounded
criterion types (`projectContains`, `scriptContains`, `spriteCountAtLeast`, and
`variableCountAtLeast`) and palette-validated opcodes; it cannot contain generated code. The server
evaluates all criteria against normalized workspace pushes. Model replies, learner claims, and UI
controls cannot mark a milestone complete.

Socket events:

- `gamePlan` `{text}` → `gamePlanProposed` with a validated plan
- `gamePlanAccept` → `gamePlaytest` with the installed prototype and accepted plan
- `gameGuide` `{feedback}` → `gameProgress` with the first active milestone and playtest feedback
- `gameRestore` with a browser-saved plan/index/phase/feedback → canonical `gamePlaytest` or `gameProgress`
- workspace evidence → `gameMilestoneComplete` once the current contract becomes true
- `gameMilestoneNext` → `gameProgress` for the next milestone, only after completion

The editor stores only accepted plan data, phase, active milestone, and bounded playtest feedback
under a versioned, project-scoped local-storage key. Reloads and Socket.IO reconnects restore that state through
`gameRestore`. Stored completion, chat history, and hint rung are never trusted or restored;
completion is recomputed from the current workspace.

`game-design.test.ts` evaluates whether the configured local model can preserve a child's idea,
scope a playable core before optional features, produce teachable milestones, and avoid giving
away scripts:

```sh
HRAI_MODEL_BACKEND=llama.cpp \
HRAI_EVAL_HOST=http://localhost:8080 \
HRAI_EVAL_MODEL=Qwen3.5-27B \
npm run eval:game-design --workspace=packages/hrai-server
```

## Lesson bundle prototype

The first game-specific bundle lives at `content/lessons/11-soldier-battle/`. It contains
Czech and English guides, staged goals, the battle rules, and structural predicates. The editor
lesson library starts the staged guide and the server evaluates its predicates against pushed
workspace state.

## What the model suites do, and why they are needed

| Suite | Asserts |
| - | - |
| `tutor-hints.test.ts` | Structural properties of a rung-1 hint: only real block aliases cited, asks rather than tells, no complete script, ≤3 sentences, answers in Czech |
| `diagnosis.test.ts` | That the model actually *read* the project — names the block causing the reported symptom, and never claims a block is missing that is present |
| `game-design.test.ts` | Preserves a child's game idea, scopes the playable core first, creates concrete learning milestones, and does not expose a script |

**Neither is sufficient alone.** `qwen3:8b` passes every structural assertion in
`tutor-hints` while asking the same generic question regardless of the bug, and then fails
`diagnosis` in four of five cases by hallucinating absent blocks. A model that ignored the
project entirely would score the same on the first suite. Read the two together.

## Measured floor

`qwen3:14b` is the floor; `qwen3:8b` does not pass. Measured 2026-08-25 on an M1 Pro / 32 GB.
Ground truth in `test/fixtures/tutor-fixtures.json` is human-reviewed and accepts a *set* of
defensible blocks per fixture — an over-tight rubric produced false failures against answers
that were in fact correct.
