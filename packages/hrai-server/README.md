# @hrai/server

The hrai tutor server. Right now it contains only the **model evaluation harness** — the
part that decides whether a given local model can tutor at all.

## Why this exists before the server does

The hrai design bets that rendering a child's project as *pseudo-Scratch text* lets a small
local model do what comparable systems need a frontier hosted model for. That bet is the
riskiest thing in the plan, so it is measured here rather than assumed.

## Running the evals

```sh
ollama serve
ollama pull qwen3:14b
npm test --workspace=packages/hrai-server
```

Point elsewhere with `HRAI_EVAL_MODEL` and `HRAI_EVAL_HOST`. If the model is unavailable the
suite **skips loudly** with the reason printed — it never passes silently, because a green
run that tested nothing is worse than a red one.

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

For local Docker deployment, see [`docker/README.md`](../../docker/README.md).

## Lesson bundle prototype

The first game-specific bundle lives at `content/lessons/11-soldier-battle/`. It contains
Czech and English guides, staged goals, the battle rules, and structural predicates for the
future lesson runner. The editor lesson library starts the staged guide and the server evaluates
its predicates against pushed workspace state; loading starter `.sb3` files remains the next content slice.

## What the two suites do, and why both are needed

| Suite | Asserts |
| - | - |
| `tutor-hints.test.ts` | Structural properties of a rung-1 hint: only real block aliases cited, asks rather than tells, no complete script, ≤3 sentences, answers in Czech |
| `diagnosis.test.ts` | That the model actually *read* the project — names the block causing the reported symptom, and never claims a block is missing that is present |

**Neither is sufficient alone.** `qwen3:8b` passes every structural assertion in
`tutor-hints` while asking the same generic question regardless of the bug, and then fails
`diagnosis` in four of five cases by hallucinating absent blocks. A model that ignored the
project entirely would score the same on the first suite. Read the two together.

## Measured floor

`qwen3:14b` is the floor; `qwen3:8b` does not pass. Measured 2026-08-25 on an M1 Pro / 32 GB.
Ground truth in `test/fixtures/tutor-fixtures.json` is human-reviewed and accepts a *set* of
defensible blocks per fixture — an over-tight rubric produced false failures against answers
that were in fact correct.
