"""설정: 경로, 상수, .env 로딩, 모델 후보."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(ROOT, "web")

NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"


MAX_CHARS = 500


LANGS = ("en", "es", "ko")


LANG_NAME = {"en": "English", "es": "Spanish", "ko": "Korean"}


def load_env():
    path = os.path.join(ROOT, ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()


def api_key():
    return os.environ.get("NVIDIA_API_KEY", "").strip()


# 2026-10-07 실측: 모델 목록(/v1/models)에 있어도 서비스되지 않거나(404) 응답이 없는(gemma-4 등) 모델이 있다.
# nemotron-3-super 는 ~5초, 나머지는 무료 티어 대기열로 50초 이상 걸릴 수 있어 후순위.
FALLBACK_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b",
    "openai/gpt-oss-20b",
    "deepseek-ai/deepseek-v4.1-flash",
]


PER_MODEL_TIMEOUT = 30


def model_candidates():
    first = os.environ.get("NVIDIA_MODEL", "").strip()
    out = [first] if first else []
    out += [m for m in FALLBACK_MODELS if m not in out]
    return out


def model_name():
    return model_candidates()[0]
