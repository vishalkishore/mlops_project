#!/usr/bin/env bash
set -euo pipefail

python download_checkpoint.py
exec python flux_service.py
