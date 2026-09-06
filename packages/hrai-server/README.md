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
| `HRAI_AGENT_TRACE` | mirror a run to the terminal: `1` writes to the server log, any other value is a file to append to; unset, `0` and `off` are off |

### Watching a run

A tutor call reaches an agent CLI as one child process. Nothing about it used to be visible:
`codex` reports only a finished message, and the plan and title calls ask for JSON without a delta
callback, so a new project was silent until it landed. Every run is now logged three ways.

**The Log tab in the editor.** The panel's third tab shows each run as it happens: which CLI, what
it was asked for, the phases its own event stream reports, the reply as it streams in, anything it
wrote to stderr, and how it ended. A run still going says *Běží…*; a run that ended badly shows its
exit line in red. Newest run first, the last 20 kept. Open it while starting a new project and the
planning call is visible from spawn to exit.

**A file, always.** Every event is appended to `$HRAI_DATA_DIR/agent-log/YYYY-MM-DD.jsonl` (data
directory default `.hrai-data`), one JSON object per line, no flag to set:

```sh
tail -f .hrai-data/agent-log/$(date +%F).jsonl | jq -r '"\(.kind)\t\(.text)"'
```

Each line carries `runId`, `command`, `seq`, `at`, `kind`, `text`, and for a CLI event the raw line
in `detail`. `kind` is `start`, `phase`, `delta`, `stderr` or `end`. Losing the file never fails a
run: an unwritable path is reported once and the run carries on.

**The terminal, on request.** `HRAI_AGENT_TRACE` mirrors the same events as readable lines:

```sh
HRAI_AGENT_TRACE=1 npm start --workspace=packages/hrai-server
HRAI_AGENT_TRACE=/tmp/hrai-agent.log npm start --workspace=packages/hrai-server  # then: tail -f
```

```text
[hrai agent pi 4f2c9ab1] = start model=openai-codex/gpt-5.4 cwd=/tmp/hrai-agent-x json=true prompt=2841 chars
[hrai agent pi 4f2c9ab1] . message_start
[hrai agent pi 4f2c9ab1] > Drak najde poklad
[hrai agent pi 4f2c9ab1] ! pi: resolving provider
[hrai agent pi 4f2c9ab1] = exit 0 after 12.4s, 1832 chars
```

`=` is a run boundary, `.` a phase, `>` a chunk of the reply, `!` stderr, and the eight-digit tag
separates runs that overlap. Lines the runner cannot parse are logged too — an auth banner is
usually the answer when a run fails.

**A log holds the child's project text.** The `start` line records the prompt size rather than the
prompt, but the CLIs echo the turn back in their own events and every backend emits the reply.
Treat `agent-log/` and any trace file as project data: keep them off shared machines, and delete
them when the run is understood.

### Running it so the agent is visible

Three terminals, with the tutor on an agent backend:

```sh
# 1. the tutor, on the pi CLI, mirroring each run to this terminal
HRAI_MODEL_BACKEND=pi HRAI_PI_MODEL=openai-codex/gpt-5.4 HRAI_AGENT_TIMEOUT_MS=300000 \
HRAI_AGENT_TRACE=1 npm start --workspace=packages/hrai-server

# 2. the editor
npm start --workspace=packages/scratch-gui

# 3. the log file, if a terminal of its own is wanted
tail -f .hrai-data/agent-log/$(date +%F).jsonl
```

Open `http://localhost:8601/`, describe a game, and press the idea button. The planning call
appears in terminal 1 as it streams, in the editor's Log tab, and in the day's JSONL file.

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

Then open the editor at `http://localhost:8601/`. The panel is always on; if the server
is down it opens and says so calmly — a child should never meet a stack trace.

To run the tutor through an agent CLI instead of ollama, replace terminal 1 with the
backend variables. The `pi` CLI's `local` provider expects an ollama at `:11434`, so on a
machine without one name a hosted model:

```sh
HRAI_MODEL_BACKEND=pi HRAI_PI_MODEL=openai-codex/gpt-5.4 HRAI_AGENT_TIMEOUT_MS=300000 \
npm start --workspace=packages/hrai-server
```

Override the server location with `HRAI_SERVER_URL` at build time, and the port it
listens on with `HRAI_PORT`.

### Voice input outside Compose

Speech to text talks to a whisper.cpp server at `HRAI_STT_HOST`, default
`http://whisper:8080` — the Compose service name, so a plain `npm start` has no voice
and the editor disables its microphone button. The host also needs `ffmpeg` on `PATH`;
the server converts the browser's WebM/Opus recording to 16 kHz mono WAV before posting
it to `/inference`.

Run the Compose whisper service alone and point the tutor at it. The published port is
free to choose; `8082` avoids the editor image on `8080`:

```sh
docker compose -f docker-compose.yml run --rm -p 8082:8080 whisper
HRAI_STT_HOST=http://127.0.0.1:8082 npm start --workspace=packages/hrai-server
```

The first run downloads `ggml-small.bin` into the `whisper-model-cache` volume, the same
one the full stack uses. `HRAI_STT_TIMEOUT_MS` caps one transcription, default `30000`.

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

### Forgotten passwords

A profile may carry a recovery address — usually a parent's, since the children using this
server mostly have no mailbox of their own. It is optional at registration and can be added
later in assistant settings. `POST /api/auth/forgot` takes a username or that address and
answers `{"ok": true}` either way, because a different answer for an unknown profile would
tell a stranger which usernames exist here. When the profile does have an address, a
single-use token valid for one hour is mailed as a link back to the editor, where
`POST /api/auth/reset` spends it. Resetting signs that profile out of every device.

| Variable | Effect |
| - | - |
| `HRAI_SMTP_URL` | SMTP relay, e.g. `smtps://user:pass@smtp.example.com`. **Unset, no mail is sent: the link is written to the server log instead**, which is enough for a home machine where an adult can read it. |
| `HRAI_MAIL_FROM` | Sender address; defaults to `hrai@localhost`. |
| `HRAI_EDITOR_URL` | Base URL the reset link points at. Defaults to the request's own origin, which is right for the Compose deployment and wrong behind a rewriting proxy. |

When nobody can read the mail either, reset from the machine that holds the data:

```sh
npm run reset-password --workspace=packages/hrai-server -- --list
npm run reset-password --workspace=packages/hrai-server -- <username> [password]
```

It invents a password when none is given, signs that profile out everywhere, and prints what
it set. The running server keeps the store in memory, so restart it afterwards or its next
save will write the old password back.

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
