#!/usr/bin/env python3
"""
실행: python serve.py            (Windows 에서는 py serve.py 도 가능)
      python serve.py --lan      (같은 와이파이 기기에도 열기 — 아래 경고 참고)

- 기본은 127.0.0.1(내 컴퓨터)에만 열린다.
- NVIDIA API 키는 브라우저에 절대 내려보내지 않는다. 이 서버가 대신 호출한다.
  키 설정: 같은 폴더의 .env 파일에  NVIDIA_API_KEY=nvapi-...  한 줄 (또는 환경변수)
  선택:   NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b   (기본값; 404/410/시간초과/형식오류면 다음 후보로 자동 대체)
          현재 제공 모델 목록: python serve.py --list-models
- --lan 을 켜면 같은 네트워크의 누구나 이 서버를 통해 '내 키의 쿼터'를 쓸 수 있다.
"""
from server.app import main

if __name__ == "__main__":
    main()
