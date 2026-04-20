import base64
import io
import logging
import os
from io import BytesIO
from typing import List

import PIL.Image as Image
import torch
import uvicorn
from diffusers import (
    FluxKontextPipeline,
    FluxTransformer2DModel,
    GGUFQuantizationConfig,
)
from diffusers.hooks import apply_group_offloading
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from monitoring import MetricsRecorder


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("task2-flux")

MODEL_ID = os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-Kontext-dev")
GGUF_PATH = os.getenv("GGUF_PATH", "/models/flux1-kontext-dev-Q8_0.gguf")
PORT = int(os.getenv("PORT", "8006"))
FLUX_CPU_OFFLOAD = os.getenv("FLUX_CPU_OFFLOAD", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

app = FastAPI(title="Task 2 Flux Features Service", version="1.0.0")

pipe = None
startup_error = None


class ImgToImgRequest(BaseModel):
    img: str
    prompt: str = ""


class BatchImgToImgRequest(BaseModel):
    images: List[str]
    prompts: List[str]


class BatchResult(BaseModel):
    image: str
    metrics: List[dict]


@app.on_event("startup")
async def load_models() -> None:
    global pipe, startup_error

    if not os.path.exists(GGUF_PATH):
        startup_error = f"Missing GGUF checkpoint at {GGUF_PATH}"
        logger.error(startup_error)
        return

    logger.info("Loading Task 2 FLUX pipeline from %s", GGUF_PATH)
    logger.info("FLUX CPU offload enabled: %s", FLUX_CPU_OFFLOAD)

    try:
        transformer = FluxTransformer2DModel.from_single_file(
            GGUF_PATH,
            quantization_config=GGUFQuantizationConfig(compute_dtype=torch.bfloat16),
            torch_dtype=torch.bfloat16,
            config=MODEL_ID,
            subfolder="transformer",
        )

        pipe = FluxKontextPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            transformer=transformer,
        )

        if FLUX_CPU_OFFLOAD:
            pipe.text_encoder.to("cuda")
            pipe.text_encoder_2.to("cuda")
            apply_group_offloading(
                pipe.transformer,
                offload_type="leaf_level",
                offload_device=torch.device("cpu"),
                onload_device=torch.device("cuda"),
                use_stream=True,
            )
            apply_group_offloading(
                pipe.vae,
                offload_type="leaf_level",
                offload_device=torch.device("cpu"),
                onload_device=torch.device("cuda"),
                use_stream=True,
            )
        else:
            pipe = pipe.to("cuda")

        startup_error = None
        logger.info("Task 2 FLUX pipeline loaded successfully")
    except Exception as exc:
        startup_error = str(exc)
        pipe = None
        logger.exception("Failed to load Task 2 FLUX pipeline")


@app.get("/")
async def root() -> dict:
    return {"message": "Task 2 FLUX service is running"}


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok" if pipe is not None and startup_error is None else "degraded",
        "model_loaded": pipe is not None,
        "gguf_path": GGUF_PATH,
        "cpu_offload": FLUX_CPU_OFFLOAD,
        "startup_error": startup_error,
    }


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


def run_generation(image_base64: str, prompt: str) -> dict:
    recorder = MetricsRecorder(interval=1.0)
    recorder.start()

    try:
        img_data = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        result_image = pipe(
            image=img,
            prompt=prompt,
            output_type="pil",
            num_inference_steps=10,
            generator=torch.Generator("cpu").manual_seed(42),
        ).images[0]

        buffer = BytesIO()
        result_image.save(buffer, format="PNG")
        img_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return {
            "image": img_b64,
            "metrics": recorder.get_metrics(),
        }
    finally:
        recorder.stop()


@app.post("/imgtoimg")
async def img_to_img(request: ImgToImgRequest) -> dict:
    if pipe is None:
        raise HTTPException(
            status_code=503,
            detail=f"Task 2 FLUX pipeline not ready: {startup_error}",
        )

    return run_generation(request.img, request.prompt)


@app.post("/imgtoimg/batch")
async def img_to_img_batch(request: BatchImgToImgRequest) -> dict:
    if pipe is None:
        raise HTTPException(
            status_code=503,
            detail=f"Task 2 FLUX pipeline not ready: {startup_error}",
        )

    validate_batch_lengths(request.images, request.prompts)

    # Process each item independently to preserve the stable behavior of the
    # existing single-image path while exposing a batch-friendly API.
    results = [
        run_generation(image_base64, prompt)
        for image_base64, prompt in zip(request.images, request.prompts)
    ]
    return {"results": results}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
