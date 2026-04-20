import asyncio
import base64
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import List, Optional

import httpx
import yaml
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


FLUX_FEATURES_URL = os.getenv("FLUX_FEATURES_URL", "http://task2-flux:8006")
OUTPUT_IMGTOIMG_DIR = Path(
    os.getenv("OUTPUT_IMGTOIMG_DIR", "/app/output/imgtoimg")
)
TASK2_CONFIG_PATH = Path(os.getenv("TASK2_CONFIG_PATH", "/app/config.yml"))
KAFKA_ENABLED = os.getenv("KAFKA_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "task2-kafka:9092")
KAFKA_REQUEST_TOPIC = os.getenv("KAFKA_REQUEST_TOPIC", "task2-generation-requests")
KAFKA_RESULT_TOPIC = os.getenv("KAFKA_RESULT_TOPIC", "task2-generation-results")
KAFKA_RESULT_GROUP_ID = os.getenv(
    "KAFKA_RESULT_GROUP_ID",
    f"task2-backend-results-{os.getenv('HOSTNAME', 'local')}",
)
KAFKA_REQUEST_TIMEOUT_SEC = float(os.getenv("KAFKA_REQUEST_TIMEOUT_SEC", "620"))
KAFKA_MAX_MESSAGE_BYTES = int(os.getenv("KAFKA_MAX_MESSAGE_BYTES", "10485760"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("task2-backend")

STYLE_PROMPTS = {
    "FORMAL": (
        "A person is sitting on a wooden chair with their hand resting on "
        "their chin, wearing a blue sweater vest and white pants, against a "
        "wooden background with a colorful rug on the floor."
    ),
    "VOGUE": (
        "Create a polished editorial fashion portrait with dramatic lighting, "
        "luxury styling, clean composition, and magazine-quality details."
    ),
    "GHIBLI": (
        "Reimagine the scene in a warm hand-painted animated style inspired by "
        "classic Japanese fantasy films, with soft colors and whimsical detail."
    ),
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"
ALLOWED_IMAGE_FORMATS = "PNG, JPG, JPEG"


class Metric(BaseModel):
    timestamp: int
    cpu: float
    gpu: float
    memory: float


class ImgToImgRequest(BaseModel):
    image: str
    prompt: str


class BatchImgToImgRequest(BaseModel):
    images: List[str]
    prompts: List[str]


class StylizeRequest(BaseModel):
    image: str
    target_image: Optional[str] = None
    prompt: Optional[str] = None
    style: Optional[str] = None


class BatchStylizeItem(BaseModel):
    image: str
    target_image: Optional[str] = None
    prompt: Optional[str] = None
    style: Optional[str] = None


class ImgToImgResponse(BaseModel):
    image: str
    message: str
    metrics: List[Metric]


class BatchResult(BaseModel):
    image: str
    metrics: List[Metric]


class BatchImgToImgResponse(BaseModel):
    results: List[BatchResult]
    message: str


app = FastAPI(title="Task 2 Backend", version="1.0.0")

kafka_producer: Optional[AIOKafkaProducer] = None
kafka_consumer: Optional[AIOKafkaConsumer] = None
kafka_result_task: Optional[asyncio.Task] = None
pending_kafka_requests: dict[str, asyncio.Future] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def consume_kafka_results() -> None:
    assert kafka_consumer is not None

    try:
        async for message in kafka_consumer:
            payload = json.loads(message.value.decode("utf-8"))
            request_id = payload.get("request_id")
            if not request_id:
                continue

            future = pending_kafka_requests.pop(request_id, None)
            if future is not None and not future.done():
                future.set_result(payload)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Kafka result consumer stopped unexpectedly")


@app.on_event("startup")
async def startup_kafka() -> None:
    global kafka_producer, kafka_consumer, kafka_result_task

    if not KAFKA_ENABLED:
        logger.info("Kafka queue disabled; backend will call FLUX directly")
        return

    try:
        kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            max_request_size=KAFKA_MAX_MESSAGE_BYTES,
        )
        kafka_consumer = AIOKafkaConsumer(
            KAFKA_RESULT_TOPIC,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_RESULT_GROUP_ID,
            auto_offset_reset="latest",
            fetch_max_bytes=KAFKA_MAX_MESSAGE_BYTES,
            max_partition_fetch_bytes=KAFKA_MAX_MESSAGE_BYTES,
        )
        await kafka_producer.start()
        await kafka_consumer.start()
        kafka_result_task = asyncio.create_task(consume_kafka_results())
        logger.info("Kafka queue enabled for Task 2 backend")
    except Exception:
        logger.exception("Kafka startup failed; falling back to direct FLUX calls")
        if kafka_producer is not None:
            await kafka_producer.stop()
        if kafka_consumer is not None:
            await kafka_consumer.stop()
        kafka_producer = None
        kafka_consumer = None
        kafka_result_task = None


@app.on_event("shutdown")
async def shutdown_kafka() -> None:
    global kafka_producer, kafka_consumer, kafka_result_task

    if kafka_result_task is not None:
        kafka_result_task.cancel()
        try:
            await kafka_result_task
        except asyncio.CancelledError:
            pass

    if kafka_consumer is not None:
        await kafka_consumer.stop()
    if kafka_producer is not None:
        await kafka_producer.stop()

    kafka_result_task = None
    kafka_consumer = None
    kafka_producer = None

    for future in pending_kafka_requests.values():
        if not future.done():
            future.cancel()
    pending_kafka_requests.clear()


def save_base64_file(base64_str: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(base64.b64decode(base64_str))


def decode_and_validate_image(base64_str: str, field_name: str) -> bytes:
    try:
        image_bytes = base64.b64decode(base64_str, validate=True)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must be a valid base64-encoded image.",
        ) from exc

    if image_bytes.startswith(PNG_SIGNATURE):
        return image_bytes
    if image_bytes.startswith(JPEG_SIGNATURE):
        return image_bytes

    raise HTTPException(
        status_code=400,
        detail=f"{field_name} must be one of: {ALLOWED_IMAGE_FORMATS}.",
    )


def validate_stylize_request_images(request: StylizeRequest) -> None:
    decode_and_validate_image(request.image, "image")
    if request.target_image:
        decode_and_validate_image(request.target_image, "target_image")


def load_config() -> dict:
    if not TASK2_CONFIG_PATH.exists():
        raise RuntimeError(f"Task 2 config file not found: {TASK2_CONFIG_PATH}")

    with TASK2_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    return data.get("task2", {})


def hardcoded_prompt(request: StylizeRequest) -> str:
    if request.style:
        normalized_style = request.style.strip().upper()
        return STYLE_PROMPTS.get(
            normalized_style,
            (
                f"Apply a {request.style.strip()} visual style while preserving "
                "the main subject and overall composition."
            ),
        )

    if request.prompt and request.prompt.strip():
        return request.prompt.strip()

    if request.target_image:
        return (
            "Match the reference image's pose, styling, and composition while "
            "preserving the identity and main structure of the source image."
        )

    raise HTTPException(
        status_code=400,
        detail="Provide at least one of: prompt, style, or target_image.",
    )


async def qwen_prompt(request: StylizeRequest, config: dict) -> str:
    qwen_cfg = config.get("qwen", {})
    qwen_service_url = os.getenv("QWEN_SERVICE_URL", qwen_cfg.get("service_url", ""))

    if not qwen_service_url:
        raise RuntimeError("QWEN_SERVICE_URL is not configured.")

    payload = {
        "image_a": request.image,
        "image_b": request.target_image,
        "style": request.style,
        "prompt": request.prompt,
        "weights": qwen_cfg.get("weights_repo", "AdobeTeam67/Submission"),
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(f"{qwen_service_url.rstrip('/')}/prompt", json=payload)

    if response.status_code != 200:
        raise RuntimeError(f"Qwen service error: {response.text}")

    data = response.json()
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("Qwen service returned an empty prompt.")
    return prompt


async def resolve_prompt(request: StylizeRequest) -> str:
    config = load_config()
    strategy = str(config.get("prompt_strategy", "hardcoded")).strip().lower()
    fallback = str(config.get("fallback_strategy", "hardcoded")).strip().lower()

    if strategy == "hardcoded":
        return hardcoded_prompt(request)

    if strategy == "qwen":
        try:
            return await qwen_prompt(request, config)
        except Exception:
            if fallback == "hardcoded":
                return hardcoded_prompt(request)
            raise HTTPException(
                status_code=502,
                detail="Task 2 Qwen prompt generation failed and no fallback is enabled.",
            )

    raise HTTPException(
        status_code=500,
        detail=f"Unsupported Task 2 prompt strategy: {strategy}",
    )


def validate_batch_lengths(images: List[str], prompts: List[str]) -> None:
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required.")
    if not prompts:
        raise HTTPException(status_code=400, detail="At least one prompt is required.")
    if len(images) != len(prompts):
        raise HTTPException(
            status_code=400,
            detail="The number of images must match the number of prompts.",
        )


def validate_batch_images(images: List[str], field_name: str) -> None:
    for index, image in enumerate(images):
        decode_and_validate_image(image, f"{field_name}[{index}]")


def save_batch_results(results: List[dict]) -> List[BatchResult]:
    timestamp_ms = int(time.time() * 1000)
    saved_results: List[BatchResult] = []

    for index, item in enumerate(results):
        image_b64 = item.get("image")
        metrics = item.get("metrics", [])
        if not image_b64:
            raise HTTPException(
                status_code=500,
                detail=f"Task 2 model returned no image for batch item {index}.",
            )

        output_path = OUTPUT_IMGTOIMG_DIR / f"generated_{timestamp_ms}_{index}.png"
        save_base64_file(image_b64, output_path)
        saved_results.append(BatchResult(image=image_b64, metrics=metrics))

    return saved_results


def kafka_available() -> bool:
    return KAFKA_ENABLED and kafka_producer is not None and kafka_result_task is not None


async def call_flux_service(image_base64: str, prompt: str) -> ImgToImgResponse:
    decode_and_validate_image(image_base64, "image")
    payload = {"img": image_base64, "prompt": prompt}

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(f"{FLUX_FEATURES_URL}/imgtoimg", json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Task 2 model service unreachable: {exc}",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Task 2 model service error: {response.text}",
        )

    data = response.json()
    image_b64 = data.get("image")
    metrics = data.get("metrics", [])
    if not image_b64:
        raise HTTPException(status_code=500, detail="Task 2 model returned no image.")

    output_path = OUTPUT_IMGTOIMG_DIR / f"generated_{int(time.time() * 1000)}.png"
    save_base64_file(image_b64, output_path)

    return ImgToImgResponse(
        image=image_b64,
        message="Task 2 image generation successful",
        metrics=metrics,
    )


async def call_flux_batch_service(
    images_base64: List[str], prompts: List[str]
) -> BatchImgToImgResponse:
    validate_batch_lengths(images_base64, prompts)
    validate_batch_images(images_base64, "images")
    payload = {"images": images_base64, "prompts": prompts}

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                f"{FLUX_FEATURES_URL}/imgtoimg/batch",
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Task 2 model service unreachable: {exc}",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Task 2 model service error: {response.text}",
        )

    data = response.json()
    results_data = data.get("results", [])
    if not results_data:
        raise HTTPException(
            status_code=500,
            detail="Task 2 model returned no batch results.",
        )

    return BatchImgToImgResponse(
        results=save_batch_results(results_data),
        message="Task 2 batch image generation successful",
    )


async def enqueue_generation_request(
    images_base64: List[str], prompts: List[str]
) -> BatchImgToImgResponse:
    validate_batch_lengths(images_base64, prompts)
    validate_batch_images(images_base64, "images")

    if not kafka_available():
        return await call_flux_batch_service(images_base64, prompts)

    request_id = str(uuid.uuid4())
    items = [
        {"image": image_base64, "prompt": prompt}
        for image_base64, prompt in zip(images_base64, prompts)
    ]
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    pending_kafka_requests[request_id] = future

    try:
        assert kafka_producer is not None
        await kafka_producer.send_and_wait(
            KAFKA_REQUEST_TOPIC,
            json.dumps({"request_id": request_id, "items": items}).encode("utf-8"),
        )

        payload = await asyncio.wait_for(future, timeout=KAFKA_REQUEST_TIMEOUT_SEC)
    except asyncio.TimeoutError as exc:
        pending_kafka_requests.pop(request_id, None)
        raise HTTPException(
            status_code=504,
            detail="Timed out waiting for queued image generation.",
        ) from exc
    except Exception as exc:
        pending_kafka_requests.pop(request_id, None)
        logger.exception("Queued image generation failed; falling back to direct call")
        return await call_flux_batch_service(images_base64, prompts)

    if payload.get("error"):
        raise HTTPException(status_code=502, detail=payload["error"])

    results_data = payload.get("results", [])
    if not results_data:
        raise HTTPException(
            status_code=500,
            detail="Queued generation returned no batch results.",
        )

    return BatchImgToImgResponse(
        results=save_batch_results(results_data),
        message=payload.get("message", "Task 2 batch image generation successful"),
    )


@app.get("/")
async def root() -> dict:
    return {"message": "Task 2 backend is running"}


@app.get("/health")
async def health() -> dict:
    config = load_config()
    return {
        "status": "ok",
        "flux_features_url": FLUX_FEATURES_URL,
        "output_dir": str(OUTPUT_IMGTOIMG_DIR),
        "prompt_strategy": config.get("prompt_strategy", "hardcoded"),
        "fallback_strategy": config.get("fallback_strategy", "hardcoded"),
        "qwen_weights_repo": config.get("qwen", {}).get(
            "weights_repo", "AdobeTeam67/Submission"
        ),
        "kafka_enabled": KAFKA_ENABLED,
        "kafka_connected": kafka_available(),
        "kafka_bootstrap_servers": KAFKA_BOOTSTRAP_SERVERS,
    }


@app.post("/imgtoimg", response_model=ImgToImgResponse)
async def img_to_img(request: ImgToImgRequest) -> ImgToImgResponse:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")
    batch_response = await enqueue_generation_request([request.image], [prompt])
    result = batch_response.results[0]
    return ImgToImgResponse(
        image=result.image,
        message="Task 2 image generation successful",
        metrics=result.metrics,
    )


@app.post("/imgtoimg/batch", response_model=BatchImgToImgResponse)
async def img_to_img_batch(request: BatchImgToImgRequest) -> BatchImgToImgResponse:
    prompts = [prompt.strip() for prompt in request.prompts]
    if any(not prompt for prompt in prompts):
        raise HTTPException(status_code=400, detail="Prompts cannot be empty.")
    return await enqueue_generation_request(request.images, prompts)


@app.post("/stylize", response_model=ImgToImgResponse)
async def stylize(request: StylizeRequest) -> ImgToImgResponse:
    validate_stylize_request_images(request)
    prompt = await resolve_prompt(request)
    batch_response = await enqueue_generation_request([request.image], [prompt])
    result = batch_response.results[0]
    return ImgToImgResponse(
        image=result.image,
        message="Task 2 image generation successful",
        metrics=result.metrics,
    )


@app.post("/stylize/batch", response_model=BatchImgToImgResponse)
async def stylize_batch(request: List[BatchStylizeItem]) -> BatchImgToImgResponse:
    if not request:
        raise HTTPException(status_code=400, detail="At least one batch item is required.")

    stylize_requests = [StylizeRequest(**item.model_dump()) for item in request]
    for item in stylize_requests:
        validate_stylize_request_images(item)
    prompts = [await resolve_prompt(item) for item in stylize_requests]
    images = [item.image for item in stylize_requests]
    return await enqueue_generation_request(images, prompts)
