FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh \
    && bash miniconda.sh -b -p /opt/conda \
    && rm miniconda.sh

ENV PATH="/opt/conda/bin:${PATH}"

RUN conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main && \
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r

SHELL ["/bin/bash", "-lc"]

RUN conda create -n myenv python=3.10 -y

RUN /opt/conda/envs/myenv/bin/pip install --no-cache-dir \
    torch==2.5.1 \
    torchvision==0.20.1 \
    torchaudio==2.5.1 \
    --index-url https://download.pytorch.org/whl/cu121

RUN /opt/conda/envs/myenv/bin/pip install --no-cache-dir \
    git+https://github.com/huggingface/diffusers.git

RUN /opt/conda/envs/myenv/bin/pip install --no-cache-dir \
    accelerate \
    fastapi \
    "gguf>=0.10.0" \
    "huggingface_hub[cli]" \
    pillow \
    protobuf \
    psutil \
    pynvml \
    python-multipart \
    "safetensors" \
    sentencepiece \
    transformers \
    "uvicorn[standard]" && \
    /opt/conda/bin/conda clean -afy

EXPOSE 8006

ENV HF_HOME=/app/.cache/huggingface
ENV CONDA_DEFAULT_ENV=myenv
ENV PATH="/opt/conda/envs/myenv/bin:/opt/conda/bin:${PATH}"

COPY . .
RUN chmod +x start.sh

CMD ["./start.sh"]
