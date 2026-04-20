import base64
import io
import logging
import os
from typing import Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel
from transformers import (
    AutoConfig,
    AutoProcessor,
    PretrainedConfig,
    Qwen2VLForConditionalGeneration,
    Qwen2_5_VLForConditionalGeneration,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("task2-qwen")

MODEL_ID = os.getenv("QWEN_MODEL_ID", "AdobeTeam67/Submission")
PROCESSOR_ID = os.getenv("QWEN_PROCESSOR_ID", MODEL_ID)
MODEL_SUBFOLDER = os.getenv("QWEN_MODEL_SUBFOLDER", "Qwen")
PROCESSOR_SUBFOLDER = os.getenv("QWEN_PROCESSOR_SUBFOLDER", MODEL_SUBFOLDER)
DEVICE_MAP = os.getenv("QWEN_DEVICE_MAP", "cpu")
MAX_NEW_TOKENS = int(os.getenv("QWEN_MAX_NEW_TOKENS", "128"))

app = FastAPI(title="Task 2 Qwen Service", version="1.0.0")

model = None
processor = None
startup_error = None


class PromptRequest(BaseModel):
    image_a: Optional[str] = None
    image_b: Optional[str] = None
    style: Optional[str] = None
    prompt: Optional[str] = None
    weights: Optional[str] = None


def build_instruction(request: PromptRequest) -> str:
    user_prompt = (request.prompt or "").strip()
    style = (request.style or "").strip()

    if user_prompt:
        return (
            "You are an expert image-editing prompt writer. "
            "Use the image to extract only the human pose and composition cues. "
            "Write one short prompt under 77 tokens for an image transformation model. "
            "Preserve subject identity, keep the pose faithful, and include this user instruction: "
            f"{user_prompt}"
        )

    if style:
        return (
            "You are an expert image-editing prompt writer. "
            "Use the image to extract only the human pose and composition cues. "
            "Write one short prompt under 77 tokens for an image transformation model. "
            "Preserve subject identity and apply this style: "
            f"{style}."
        )

    return (
        "You are an expert human-pose extraction and image-editing prompt writer. "
        "Given the image, describe only the body pose and composition in one short prompt "
        "under 77 tokens for an image transformation model. "
        "Do not mention clothing, identity, lighting, or background."
    )


def decode_image(b64_str: str) -> Image.Image:
    image_bytes = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def move_inputs_to_device(inputs, device):
    return {
        key: value.to(device) if hasattr(value, "to") else value
        for key, value in inputs.items()
    }


def qwen_torch_dtype():
    if DEVICE_MAP != "cpu" and torch.cuda.is_available():
        return torch.float16
    return torch.float32


def load_qwen_config():
    config = AutoConfig.from_pretrained(
        MODEL_ID,
        subfolder=MODEL_SUBFOLDER,
    )

    decoder_config = getattr(config, "decoder_config", None)
    if isinstance(decoder_config, dict):
        config.decoder_config = PretrainedConfig.from_dict(decoder_config)

    text_config = getattr(config, "text_config", None)
    if isinstance(text_config, dict):
        config.text_config = PretrainedConfig.from_dict(text_config)

    return config


def qwen_model_class(config):
    model_type = getattr(config, "model_type", "")
    if model_type == "qwen2_5_vl":
        return Qwen2_5_VLForConditionalGeneration
    return Qwen2VLForConditionalGeneration


@app.on_event("startup")
async def load_model() -> None:
    global model, processor, startup_error
    try:
        logger.info("Loading Qwen model from %s", MODEL_ID)
        if torch.cuda.is_available():
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        config = load_qwen_config()
        model_cls = qwen_model_class(config)
        logger.info("Using Qwen model class %s", model_cls.__name__)
        model = model_cls.from_pretrained(
            MODEL_ID,
            subfolder=MODEL_SUBFOLDER,
            config=config,
            device_map=DEVICE_MAP,
            torch_dtype=qwen_torch_dtype(),
        )
        model.eval()
        processor = AutoProcessor.from_pretrained(
            PROCESSOR_ID,
            subfolder=PROCESSOR_SUBFOLDER,
        )
        startup_error = None
        logger.info("Task 2 Qwen service ready")
    except Exception as exc:
        startup_error = str(exc)
        model = None
        processor = None
        logger.exception("Failed to load Task 2 Qwen model")


@app.get("/")
async def root() -> dict:
    return {"message": "Task 2 Qwen service is running"}


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok" if model is not None and processor is not None else "degraded",
        "model_loaded": model is not None,
        "processor_loaded": processor is not None,
        "model_id": MODEL_ID,
        "processor_id": PROCESSOR_ID,
        "model_subfolder": MODEL_SUBFOLDER,
        "processor_subfolder": PROCESSOR_SUBFOLDER,
        "startup_error": startup_error,
    }


@app.post("/prompt")
async def prompt(request: PromptRequest) -> dict:
    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail=f"Task 2 Qwen service not ready: {startup_error}",
        )

    target_image = request.image_b or request.image_a
    if not target_image:
        raise HTTPException(status_code=400, detail="Provide image_b or image_a.")

    conversation = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "image": decode_image(target_image),
                },
                {
                    "type": "text",
                    "text": build_instruction(request),
                },
            ],
        }
    ]

    try:
        inputs = processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        )
        inputs = move_inputs_to_device(inputs, model.device)
        with torch.inference_mode():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                use_cache=True,
            )
        generated_ids = [
            output_ids[len(input_ids):]
            for input_ids, output_ids in zip(inputs["input_ids"], output_ids)
        ]
        output_text = processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True,
        )
        prompt_text = output_text[0].strip() if output_text else ""
        logger.info("Generated prompt: %s", prompt_text)
        return {
            "prompt": prompt_text,
            "weights_repo": request.weights or MODEL_ID,
        }
    except Exception as exc:
        logger.exception("Qwen prompt generation failed")
        raise HTTPException(status_code=500, detail=f"Qwen prompt generation failed: {exc}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7878)
