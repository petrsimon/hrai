# Local HRAI deployment

This Compose stack runs the editor, HRAI tutor server, and a Vulkan-enabled
llama.cpp server on one Ubuntu host.

## Requirements

- Docker Engine with Compose v2
- `/dev/dri/renderD128` available to the host user
- `render` and `video` group access
- Enough memory for the selected GGUF model

The default model is Qwen3.5-27B Q4_K_M. It downloads into the persistent
`llama-cache` volume on first startup. To reuse a model downloaded by the host
`llama` command, point the volume at its cache instead:

```sh
LLAMA_CACHE_DIR="$HOME/.cache/llama.cpp" \
docker compose -f docker-compose.yml up --build
```

Check the host GPU before starting:

```sh
vulkaninfo --summary
```

The output should contain `AMD Radeon 890M Graphics` and `driverName = radv`.

Find device group IDs if the host uses non-default values:

```sh
export VIDEO_GID="$(getent group video | cut -d: -f3)"
export RENDER_GID="$(getent group render | cut -d: -f3)"
```

## Model choices

The default model is Qwen3.5-27B Q4_K_M. With 96 GB system RAM, this is a
reasonable first model for the Radeon 890M Vulkan backend. Q6_K is a slower,
higher-quality alternative:

```text
lmstudio-community/Qwen3.5-27B-GGUF:Q4_K_M  default
lmstudio-community/Qwen3.5-27B-GGUF:Q6_K    higher quality, slower
```

The original Qwen3-14B model remains a useful evaluation baseline, but the
Compose deployment targets Qwen3.5-27B. `ggml-org` names the llama.cpp project;
it is not the Hugging Face model repository.

## Run llama.cpp directly

To test the model without Docker:

```sh
llama serve \
  -hf lmstudio-community/Qwen3.5-27B-GGUF:Q4_K_M \
  -ngl 999 \
  -c 8192 \
  --jinja \
  --reasoning off \
  --host 127.0.0.1 \
  --port 8080
```

The first run downloads and caches the GGUF model. Check GPU offload in the
startup log; it should mention Vulkan and Radeon 890M. The server exposes its
OpenAI-compatible API at `http://127.0.0.1:8080/v1/`.

## Start

Run from repository root:

```sh
docker compose -f docker-compose.yml up --build
```

Open:

```text
http://localhost:8080/?hrai=true
```

Only the editor port is published. HRAI and llama.cpp remain on the internal
Compose network. The model receives the project representation sent by the
editor, so keep this stack local unless authentication and network policy are
added.

## Configuration

Override the model or ports with environment variables:

```sh
HRAI_MODEL_REPOSITORY=lmstudio-community/Qwen3.5-27B-GGUF:Q4_K_M \
HRAI_MODEL_NAME=Qwen3.5-27B \
EDITOR_PORT=8080 \
docker compose -f docker-compose.yml up --build
```

The llama.cpp server uses its OpenAI-compatible API and starts with reasoning
disabled so tutor replies stay concise. HRAI selects it with
`HRAI_MODEL_BACKEND=llama.cpp`; Ollama remains the default for non-Compose
development and evaluation commands.

## Stop and remove

Stop containers while retaining the downloaded model:

```sh
docker compose -f docker-compose.yml down
```

Remove containers and the model cache:

```sh
docker compose -f docker-compose.yml down -v
```
