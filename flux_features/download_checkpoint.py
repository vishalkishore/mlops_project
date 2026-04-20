import logging
import os
from pathlib import Path

from huggingface_hub import hf_hub_download


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("task2-flux-download")

gguf_path = Path(os.getenv("GGUF_PATH", "/models/flux1-kontext-dev-Q8_0.gguf"))
repo_id = os.getenv("GGUF_REPO_ID", "bullerwins/FLUX.1-Kontext-dev-GGUF")
filename = os.getenv("GGUF_FILENAME", gguf_path.name)


def main() -> None:
    if gguf_path.exists() and gguf_path.stat().st_size > 0:
        logger.info("GGUF checkpoint already present at %s", gguf_path)
        return

    gguf_path.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading %s from %s to %s", filename, repo_id, gguf_path)

    downloaded_path = Path(
        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=gguf_path.parent,
            local_dir_use_symlinks=False,
        )
    )

    if downloaded_path != gguf_path:
        downloaded_path.replace(gguf_path)

    if not gguf_path.exists() or gguf_path.stat().st_size == 0:
        raise RuntimeError(f"Checkpoint download did not produce {gguf_path}")

    logger.info("GGUF checkpoint ready at %s", gguf_path)


if __name__ == "__main__":
    main()
