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
