import asyncio
import json
import logging
import os
from typing import Any

import httpx
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("task2-kafka-worker")

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "task2-kafka:9092")
KAFKA_REQUEST_TOPIC = os.getenv("KAFKA_REQUEST_TOPIC", "task2-generation-requests")
KAFKA_RESULT_TOPIC = os.getenv("KAFKA_RESULT_TOPIC", "task2-generation-results")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "task2-generation-workers")
WORKER_BATCH_SIZE = int(os.getenv("WORKER_BATCH_SIZE", "4"))
WORKER_BATCH_WAIT_MS = int(os.getenv("WORKER_BATCH_WAIT_MS", "250"))
FLUX_FEATURES_URL = os.getenv("FLUX_FEATURES_URL", "http://task2-flux:8006")
KAFKA_MAX_MESSAGE_BYTES = int(os.getenv("KAFKA_MAX_MESSAGE_BYTES", "10485760"))


def build_error_response(message: str) -> dict[str, Any]:
    return {"error": message}


async def send_result(
    producer: AIOKafkaProducer,
    request_id: str,
    payload: dict[str, Any],
) -> None:
    message = {"request_id": request_id, **payload}
    await producer.send_and_wait(
        KAFKA_RESULT_TOPIC,
        json.dumps(message).encode("utf-8"),
    )


async def flush_pending(
    pending: list[dict[str, Any]],
    producer: AIOKafkaProducer,
    client: httpx.AsyncClient,
) -> None:
    if not pending:
        return

    current_batch = pending[:]
    pending.clear()

    images = [item["image"] for item in current_batch]
    prompts = [item["prompt"] for item in current_batch]

    try:
        response = await client.post(
            f"{FLUX_FEATURES_URL}/imgtoimg/batch",
            json={"images": images, "prompts": prompts},
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        if len(results) != len(current_batch):
            raise RuntimeError(
                "FLUX batch result count did not match the number of queued items."
            )

        grouped_results: dict[str, dict[str, Any]] = {}
        for item, result in zip(current_batch, results):
            request_id = item["request_id"]
            request_group = grouped_results.setdefault(
                request_id,
                {
                    "message": "Task 2 batch image generation successful",
                    "results": [None] * item["request_size"],
                },
            )
            request_group["results"][item["item_index"]] = {
                "image": result.get("image"),
                "metrics": result.get("metrics", []),
            }

        for request_id, payload in grouped_results.items():
            if any(result is None for result in payload["results"]):
                await send_result(
                    producer,
                    request_id,
                    build_error_response(
                        "A queued batch completed with missing items."
                    ),
                )
                continue
            await send_result(producer, request_id, payload)
    except Exception as exc:
        logger.exception("Failed to process queued FLUX batch")
        errors_by_request: dict[str, str] = {}
        for item in current_batch:
            errors_by_request[item["request_id"]] = str(exc)
        for request_id, message in errors_by_request.items():
            await send_result(producer, request_id, build_error_response(message))


async def main() -> None:
    consumer = AIOKafkaConsumer(
        KAFKA_REQUEST_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_GROUP_ID,
        enable_auto_commit=True,
        auto_offset_reset="earliest",
        fetch_max_bytes=KAFKA_MAX_MESSAGE_BYTES,
        max_partition_fetch_bytes=KAFKA_MAX_MESSAGE_BYTES,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
    )
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        max_request_size=KAFKA_MAX_MESSAGE_BYTES,
    )

    await consumer.start()
    await producer.start()
    logger.info("Kafka worker started")

    pending: list[dict[str, Any]] = []
    flush_interval = WORKER_BATCH_WAIT_MS / 1000

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            while True:
                try:
                    message = await asyncio.wait_for(consumer.getone(), timeout=flush_interval)
                    payload = message.value
                    request_id = payload.get("request_id")
                    items = payload.get("items", [])

                    if not request_id or not items:
                        if request_id:
                            await send_result(
                                producer,
                                request_id,
                                build_error_response(
                                    "Queued request was missing an id or items."
                                ),
                            )
                        continue

                    request_size = len(items)
                    for item_index, item in enumerate(items):
                        pending.append(
                            {
                                "request_id": request_id,
                                "item_index": item_index,
                                "request_size": request_size,
                                "image": item["image"],
                                "prompt": item["prompt"],
                            }
                        )

                    if len(pending) >= WORKER_BATCH_SIZE:
                        await flush_pending(pending, producer, client)
                except asyncio.TimeoutError:
                    await flush_pending(pending, producer, client)
    finally:
        if pending:
            async with httpx.AsyncClient(timeout=600.0) as client:
                await flush_pending(pending, producer, client)
        await consumer.stop()
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(main())
