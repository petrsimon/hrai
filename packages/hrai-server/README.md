# @hrai/server

The hrai tutor server. It renders a child's live Scratch project for a local model,
keeps tutoring state, evaluates authored lesson progress, and runs model capability evals.

## Why model evals are part of the server

The hrai design bets that rendering a child's project as *pseudo-Scratch text* lets a small
local model do what comparable systems need a frontier hosted model for. Model comprehension
and game-planning quality are measured rather than assumed.

## Running the evals

The evals need a model the operator's pi runtime can reach. With ollama on this machine:

```sh
ollama serve
ollama pull qwen3:14b
HRAI_OLLAMA_HOST=http://localhost:11434 HRAI_OLLAMA_MODELS=qwen3:14b npm test --workspace=packages/hrai-server
```

Point elsewhere with `HRAI_EVAL_MODEL`, a `provider/model[:thinking]` reference. If the model is
unavailable the suite **skips loudly** with the reason printed — it never passes silently, because
a green run that tested nothing is worse than a red one.

## Models and providers

The tutor reaches every model through [pi](https://pi.dev). A hosted subscription (openai-codex,
Claude Pro/Max, OpenRouter, …) and a local server (ollama, llama.cpp) are both pi providers, and a
model is a `provider/model[:thinking]` reference such as `openai-codex/gpt-5.6-luna:high` or
`ollama/qwen3:14b`. Nothing else in the server asks which kind of provider is answering.

**Credentials are per profile.** A signed-in child logs in to a provider from the assistant
settings in the editor — a subscription through its OAuth flow, a metered provider with a key. The
credential lands in `$HRAI_DATA_DIR/pi/users/<id>/auth.json` and is used only for that child's
calls; it never crosses the socket. A socket without a profile gets no model at all: the tutor asks
the child to sign in. Evals and scripts use the *operator's* runtime, whose credentials live at
`HRAI_PI_AUTH_PATH` (default `$HRAI_DATA_DIR/pi/auth.json`); copy `~/.pi/agent/auth.json` there to
run evals on a subscription.

**A hosted provider sees the child's project.** The rendered project and the chat leave the machine
and reach whichever provider the profile picked. Local servers keep everything on the host, and the
Compose deployment serves llama.cpp as provider `llama`.

Local servers are announced through the environment and registered as providers on every runtime.
Their models are listed explicitly rather than probed, so the catalogue does not depend on whether
the server was up when the tutor started.

| Variable | Meaning |
| - | - |
| `HRAI_PI_MODEL` | model for profiles that keep *Server default*; default `ollama/qwen3:14b` |
| `HRAI_EVAL_MODEL` | model the evals measure; default `HRAI_PI_MODEL` |
| `HRAI_OLLAMA_HOST`, `HRAI_OLLAMA_MODELS` | an ollama server and the comma-separated models it serves, registered as provider `ollama` |
| `HRAI_LLAMA_HOST`, `HRAI_LLAMA_MODELS` | a llama.cpp server and its models, registered as provider `llama` |
| `HRAI_PI_MODELS_PATH` | a pi `models.json` with further custom providers; default `$HRAI_DATA_DIR/pi/models.json` |
| `HRAI_PI_AUTH_PATH` | the operator's credentials, for evals and scripts |
| `HRAI_AGENT_TRACE` | mirror the transcript to the terminal: `1` writes to the server log, any other value is a file to append to; unset, `0` and `off` are off |

### The tutor is an agent session

Each profile has one persistent pi agent session per project, kept under
`$HRAI_DATA_DIR/pi/sessions/<user>/<project>/` and resumed on reconnect, so the child keeps talking
to the same tutor across milestones and lessons. The session has four tools:

| Tool | What it does |
| - | - |
| `tell_child` | delivers the reply. The only way a word reaches the Hrai tab: the pedagogical policy runs on its arguments, and a reply that breaks a rule is refused with the rule spelled out, so the model tries again and the child never sees the attempt |
| `read_project` | the current project as pseudo-Scratch text |
| `step_status` | the active lesson step or game milestone, its evidence, at the current hint rung |
| `palette` | blocks from the editor's palette — categories only at rung 3, nothing below |

The rendered project still travels inline in each user turn, the shape the evals measured; the
tools are additive. A game plan, a project title and every eval are one-shot completions in an
ephemeral session with no tools and no memory.

### Watching the agent

Every turn is visible three ways.

**The Záznam tab in the editor.** The panel's third tab is the session transcript: the child's
message, the assistant's text as it streams, its reasoning folded away, every tool call with its
arguments and result — `tell_child` shows what the child was told — and how the turn ended. A one-
shot run (a plan, a title) appears as a card of its own. The tab reloads the history when the
editor connects or the project changes.

**A file, always.** Every event is appended to `$HRAI_DATA_DIR/agent-log/YYYY-MM-DD.jsonl` (data
directory default `.hrai-data`), one JSON object per line, no flag to set:

```sh
tail -f .hrai-data/agent-log/$(date +%F).jsonl | jq -r '"\(.kind)\t\(.delta // .text // .name // "")"'
```

Each line carries `owner` (the profile), `seq`, `at`, `kind`, and `runId` for a one-shot run. `kind`
is `run_start`, `run_end`, `user`, `assistant_delta`, `thinking_delta`, `tool_start`, `tool_end`,
`turn_end` or `note`. Losing the file never fails a turn: an unwritable path is reported once and
the turn carries on.

**The terminal, on request.** `HRAI_AGENT_TRACE` mirrors the same events as readable lines:

```sh
HRAI_AGENT_TRACE=1 npm start --workspace=packages/hrai-server
HRAI_AGENT_TRACE=/tmp/hrai-agent.log npm start --workspace=packages/hrai-server  # then: tail -f
```

```text
[hrai u3f1] < Jak udělám, aby kočka běžela, když zmáčknu šipku?
[hrai u3f1] ~ The child has a flag script; a key event is missing.
[hrai u3f1] + tell_child {"text":"Podívej se, čím tvůj skript začíná. Co by mělo kočku spustit místo vlajky?","blocks":[]}
[hrai u3f1] - Doručeno.
[hrai u3f1] = stop
[hrai run 604969e8] = plan · openai-codex/gpt-5.6-luna
[hrai run 604969e8] > {"title": "Drak hledá poklad", …
[hrai run 604969e8] = done in 75.3s, 1520 chars
```

`<` is the child's message, `~` the model's reasoning, `>` its prose, `+` a tool call, `-` its
result, `!` an error or a note, and `=` a turn or run boundary. Reply and reasoning arrive in
fragments and are logged a line at a time.

**A log holds the child's project text.** The `user` line records what the child typed, but the
session file and `read_project` results carry the rendered project. Treat `agent-log/`,
`pi/sessions/` and any trace file as project data: keep them off shared machines, and delete them
when the run is understood.

### Running it so the agent is visible

Three terminals, with the tutor on a hosted subscription:

```sh
# 1. the tutor, mirroring each turn to this terminal
HRAI_PI_MODEL=openai-codex/gpt-5.6-luna HRAI_AGENT_TRACE=1 npm start --workspace=packages/hrai-server

# 2. the editor
npm start --workspace=packages/scratch-gui

# 3. the log file, if a terminal of its own is wanted
tail -f .hrai-data/agent-log/$(date +%F).jsonl
```

Open `http://localhost:8601/`, sign in to a profile, open the assistant settings and log in to
`openai-codex`, then ask the dragon something. The turn appears in terminal 1 as it streams, in the
editor's Záznam tab, and in the day's JSONL file.

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
HRAI_OLLAMA_HOST=http://localhost:11434 HRAI_OLLAMA_MODELS=qwen3:14b \
npm start --workspace=packages/hrai-server      # 2. the tutor server on :8791
npm start --workspace=packages/scratch-gui      # 3. the editor on :8601
```

Then open the editor at `http://localhost:8601/`. The panel is always on; if the server
is down it opens and says so calmly — a child should never meet a stack trace. The tutor
answers once the child has a profile; without one it asks them to sign in.

On a machine without a local model, name a hosted one and log in to it from the editor's
assistant settings:

```sh
HRAI_PI_MODEL=openai-codex/gpt-5.6-luna npm start --workspace=packages/hrai-server
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

`GET /api/models` lists the providers the profile's pi runtime knows, whether the profile has
credentials for each, which login flows it offers, and its models. That is what fills the provider,
model and thinking-level controls in assistant settings, and where the login and logout buttons
live. The profile stores `model` — `default` or a `provider/model` reference, at most 100
characters of `[A-Za-z0-9._:/+-]` — and `thinkingLevel`. Leaving the model on *Server default*
keeps `HRAI_PI_MODEL`.

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
HRAI_LLAMA_HOST=http://localhost:8080 \
HRAI_LLAMA_MODELS=Qwen3.5-27B \
HRAI_EVAL_MODEL=llama/Qwen3.5-27B \
npm run eval:game-design --workspace=packages/hrai-server
```

## Tutorials from imported Scratch projects

The HRAI File menu can load `.sb`, `.sb2`, and `.sb3` files from the computer, or a public Scratch project by URL or numeric ID. URL import works only for publicly shared projects; a private project must be downloaded from Scratch and loaded as an `.sb3` file. Public downloads use Scratch's public project token without a Scratch account credential.

With a meaningful project open, the HRAI panel offers two generated tutorials:

- **Explore this game** explains the imported project in place. Steps ask the child to run and inspect existing behavior; progress is advanced manually, and the project is not edited.
- **Rebuild it in a new project** uses the imported game only as a reference. The editor saves the source project first, opens a separate blank project, and checks each rebuild step against validated Scratch-block evidence. This mode is unavailable when the source cannot be saved, so it is never silently discarded.

Both modes require an accepted proposal before tutoring starts. Rebuild progress is stored per editor project and recomputed from the current workspace after reconnect; walkthrough progress is manual. Project text is sent to the profile's configured model provider under the same rules as normal tutoring.

Socket events:

- `projectTutorialPlan` `{mode: "explore" | "rebuild"}` → `projectTutorialProposed` with a validated plan
- `projectTutorialAccept` / `projectTutorialCancel` → activate or dismiss the pending proposal
- `projectTutorialRestore` with a browser-saved plan, step index, and `needsNewProject` gate →
  revalidate and restore progress; rebuild restores stay gated until the separate project is ready
- workspace evidence → `projectTutorialProgress` when a rebuild step changes completion state
- `projectTutorialNext` → advance a walkthrough step, or a completed rebuild step

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
