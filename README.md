# ReImagine Runtime

This directory isolates the stylize pipeline from the rest of the repository so
you can run the stylize and img-to-img flow without touching the shared
backend or the other model services.

## Included services

- `task2-kafka`: Kafka broker for queued generation traffic
- `backend/`: FastAPI backend exposing `/imgtoimg`, `/imgtoimg/batch`, `/stylize`, `/stylize/batch`, and `/health`
- `task2-kafka-worker`: Kafka consumer that batches queued generation jobs before calling FLUX
- `qwen_service/`: Qwen prompt service exposing `/prompt` and `/health`
- `task2-flux`: prebuilt FLUX Kontext image exposing `/imgtoimg` and `/imgtoimg/batch`
- `docker-compose.task2.yml`: isolated Docker Compose stack
- `config.yml`: selects whether the runtime uses `hardcoded` prompts or `qwen`

## Ports

- Backend: `8100`
- UI: `3001`
- Qwen service: `7878`
- FLUX service: `8106`
- Kafka broker: `9092`

These are intentionally different from the main repo defaults to avoid
conflicts with any existing local services.

The compose stack binds these ports on `0.0.0.0`, so another device on the
same institute network can call this machine directly:

```bash
curl http://<server-ip>:8100/health
```

Find this server's institute-network IP with:

```bash
hostname -I
```

Use the IP from the same network as your other device, then open
`http://<server-ip>:3001` for the UI, or call the API endpoints on port `8100`.

## FLUX service image

This stack uses the prebuilt Docker image:

`harshvarandani2006/fluxquantservices:latest`

That image already contains `/app/flux1-kontext-dev-Q8_0.gguf`, exposes port
`8006`, and starts with `python flux_service.py`. The compose file publishes it
on host port `8106` and the backend calls it at `http://task2-flux:8006`.

## Prompt Strategy Config

This runtime reads [config.yml](config.yml).

Use hardcoded prompts:

```yaml
task2:
  prompt_strategy: hardcoded
  fallback_strategy: hardcoded
  qwen:
    weights_repo: AdobeTeam67/Submission
    service_url: ""
```

Use Qwen first, then fall back to hardcoded prompts if the Qwen endpoint is not available:

```yaml
task2:
  prompt_strategy: qwen
  fallback_strategy: hardcoded
  qwen:
    weights_repo: AdobeTeam67/Submission
    subfolder: Qwen
    service_url: http://task2-qwen:7878
```

The compose stack now includes a local Qwen prompt service, so the default config can
use `http://task2-qwen:7878` inside Docker. If you want to use your remote host instead,
change `service_url` back to `http://10.36.16.97:7878`.

The local Qwen service is configured for the Hugging Face layout shown in your screenshot:
it loads `AdobeTeam67/Submission` with `subfolder="Qwen"` and uses the safetensors model
files there rather than the GGUF file.

## Run

From the repository root:

```bash
docker compose -f re-imagine/docker-compose.task2.yml up --build
```

Or from inside `re-imagine/`:

```bash
docker compose -f docker-compose.task2.yml up --build
```

## Kafka queue flow

This runtime uses Kafka to smooth traffic spikes and batch queued generation work:

- The backend resolves prompts, publishes generation jobs to Kafka, and waits for the matching result using a per-request id.
- The Kafka worker consumes queued jobs, groups them for a short window, and sends them to FLUX through `/imgtoimg/batch`.
- When FLUX returns, the worker publishes the grouped results back to Kafka and the backend returns the response to the correct caller.

This keeps the existing HTTP API unchanged for callers while moving the heavy image generation path behind a queue.

## Health checks

```bash
curl http://localhost:8100/health
curl http://localhost:8106/docs
```

The backend health response now also reports whether Kafka is enabled and connected.

## Example request

```bash
IMG64=$(base64 -w 0 path/to/image.png)
curl -X POST http://localhost:8100/stylize \
  -H 'Content-Type: application/json' \
  -d "{\"image\":\"${IMG64}\",\"style\":\"GHIBLI\"}"
```

## Batch requests

Existing single-image requests still work unchanged. Batch support is additive and
available through separate endpoints.

## Allowed image formats

The UI only accepts source and reference uploads in these formats:

- `PNG`
- `JPG`
- `JPEG`

The backend enforces the same restriction for direct API calls, so unsupported
formats are rejected even if they bypass the UI.

Batch img-to-img:

```bash
IMG_A=$(base64 -w 0 path/to/image-a.png)
IMG_B=$(base64 -w 0 path/to/image-b.png)
curl -X POST http://localhost:8100/imgtoimg/batch \
  -H 'Content-Type: application/json' \
  -d "{
    \"images\":[\"${IMG_A}\",\"${IMG_B}\"],
    \"prompts\":[
      \"Create a clean editorial portrait\",
      \"Create a cinematic portrait with warm lighting\"
    ]
  }"
```

Batch stylize:

```bash
IMG_A=$(base64 -w 0 path/to/image-a.png)
IMG_B=$(base64 -w 0 path/to/image-b.png)
curl -X POST http://localhost:8100/stylize/batch \
  -H 'Content-Type: application/json' \
  -d "[
    {\"image\":\"${IMG_A}\",\"style\":\"GHIBLI\"},
    {\"image\":\"${IMG_B}\",\"style\":\"VOGUE\"}
  ]"
```

## CI/CD

This repo now includes GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` runs on pushes to `main`/`master` and on pull requests.
- `cd.yml` publishes container images to GitHub Container Registry (`ghcr.io`) on pushes to `main`, on version tags like `v1.0.0`, or when triggered manually.

The CI workflow currently validates the parts of the stack that fit reliably on
standard GitHub-hosted runners:

- builds the Vite UI
- compiles Python sources in `backend/`, `qwen_service/`, and `flux_features/`
- validates `docker-compose.task2.yml`
- smoke-builds the `backend` and `ui` Docker images

The CD workflow publishes:

- `ghcr.io/<owner>/task2-backend`
- `ghcr.io/<owner>/task2-ui`

The GPU-heavy FLUX image is intentionally excluded from CI/CD because it is much
slower and depends on a CUDA-oriented build/runtime path that is not a great fit
for the default GitHub-hosted runner environment.
