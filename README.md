# Finance Compass
<img width="1582" height="888" alt="image" src="https://github.com/user-attachments/assets/ed2689f5-1204-4966-a811-cc2af479b874" />

## 프로젝트 소개 (Project Overview)
유학생 재정 관리 + XRPL 블록체인 기반 생활비 송금/환전 앱으로 해외 유학생들이 겪는 생활비 관리의 비효율성과 증빙 문제를 해결하기 위한 프로젝트

#### 주요 기능
생활비 충전 (Funding) / 자동 환전 (Auto Exchange) / 다중통화 보관 (Multi-Currency Wallet) / 소비 데이터 기반 증빙 리포트 생성


#### Why XRPL?
XRPL은 빠른 정산과 다중통화 처리, 온체인 앵커링을 통해 금융 흐름을 위변조 불가능한 “검증 가능한 데이터”로 만드는 역할을 함

- 팀명: Xfer(엑스퍼)
---

## 팀원 및 역할 (Team Members/Role)

| **이름** | **역할** | **담당 업무** |
| --- | --- | --- | 
| **장예주** | PM (project manager) | 전체적인 기획 |
| **백혜준** | PM (project manager) | 전체적인 기획 및 데모영상 편집 | 
| **구지원** | Backend / Frontend | 전체적인 FE 기획 및 수정   | 
| **김유림** | Backend / Frontend | 전체적인 BE 기획 및 수정 | 
| **한지혜** | Backend / Frontend / XRPL | XRPL 지갑 생성 및 연결, 환전 기능 구현 |

---

## 기술 스택 (Tech Stack)

**Frontend**

- React Native (Expo) 앱
- html + css + typescript

**Backend**

- FastAPI 서버 (Python)
- PostgreSQL, SQLAlchemy 2.0

**Database**

- MySQL, PostgreSQL, Docker 

**BlockChain & AI**

- BlockChain: xrpl-py, Issuer 지갑
- AI: Google Gemini

---

## 실행 전 준비 (Prerequisites / Requirements)

### 필수 설치 (Installation)

| 도구 | 버전 | 설치 |
|------|------|------|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.11+ | https://python.org |
| Docker Desktop | 최신 | https://docker.com |
| pnpm | 9.x | `corepack enable pnpm` |
| Expo Go (폰) | 최신 | App Store / Play Store |

---

## 서버 실행 순서 (Installation & Setup)

서버가 **3개** 전부 따로 터미널 열어서 실행

도커(DB) + 서버 총 3개 실행 필요.
전부 따로 터미널 열어서 실행

---

### 1. PostgreSQL DB (Docker)

```bash
docker-compose up -d
```

- DB가 **5432** 포트로 뜸
- 처음 한 번만 실행하면 컨테이너가 재시작 시 자동으로 켜짐
- 확인: `docker ps` → `postgres` 컨테이너가 `Up` 상태인지 확인

---

### 2. FastAPI 서버 (XRPL 지갑/환전)

#### 처음 한 번만: 환경 설정

```bash
cd backend

# 가상환경 생성 및 활성화
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt

# .env 파일 생성
cp .env.example .env
```

#### `.env` 파일 수정

**.env 파일은 공유받은 파일을 받아 backend에 넣기. 아래 설명은 직접 seed, key 발급 시 참고용임.**

```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/livingfund
XRPL_TESTNET_URL=https://s.altnet.rippletest.net:51234
ENCRYPTION_KEY=<아래 명령어로 생성>
XRPL_ISSUER_ADDRESS=<팀원에게 받기>
XRPL_ISSUER_SEED=<팀원에게 받기>
GEMINI_API_KEY=<팀원에게 받기>
NGROK_TOKEN=<팀원에게 받기>
```

> ENCRYPTION_KEY 생성 방법:
> ```bash
> python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
> ```

#### 서버 실행 (Running the App)

```bash
# backend 폴더에서 (가상환경 활성화된 상태)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0` 옵션을 붙여야 **폰에서도 접근 가능**
- 브라우저에서 확인: http://localhost:8000/docs (Swagger UI)

---

### 3. tRPC 서버 + Expo 앱 서버 실행

```bash
# 프로젝트 루트에서
pnpm install       # 처음 한 번만

# 터미널 두 개로 나눠서 실행
pnpm dev:server    # tRPC 서버 (포트 3000 또는 3001)
pnpm dev:metro     # Expo Metro 번들러 (포트 8081)
```

> **또는** `pnpm dev` 한 번에 둘 다 실행 (Windows에서 안 되면 위처럼 따로 실행)

- 브라우저에서 확인: http://localhost:8081
- 폰에서 확인: Expo Go 앱으로 터미널에 뜨는 QR 코드 스캔

---

## 폰(Expo Go)으로 테스트할 때

폰과 PC가 **같은 Wi-Fi**에 연결되어 있어야 함.

앱 실행 후 **설정 탭 → 백엔드 설정**에서 URL을 PC의 로컬 IP로 변경

```
http://192.168.x.x:8000
```

---

## XRPL 초기 설정 (처음 한 번만)

이미 `XRPL_ISSUER_ADDRESS`와 `XRPL_ISSUER_SEED`를 팀원에게 받았다면 스킵해도 됨.

직접 설정하려면:

```bash
# 가상환경 활성화 상태에서
cd scripts

# 1. 이슈어(발행자) 지갑 생성
python setup_issuer.py
# → 출력된 ISSUER_ADDRESS, ISSUER_SEED를 backend/.env에 입력

# 2. 유동성 공급 (DEX 환전용 오더북 세팅)
python add_liquidity.py
```

---

## 전체 실행 요약

| 터미널 | 명령어 | 포트 |
|--------|--------|------|
| 1 | `docker-compose up -d` | 5432 |
| 2 | `cd backend && uvicorn app.main:app --reload --host 0.0.0.0` | 8000 |
| 3 | `pnpm dev:server` | 3000/3001 |
| 4 | `pnpm dev:metro` | 8081 |


---

## 아키텍처/폴더 구조 (Folder Structure)

```
XRPL_Project2/
├── app/                  # React Native (Expo) 앱 화면
├── server/               # tRPC 서버 (앱 자체 기능)
├── backend/              # FastAPI 서버 (XRPL 지갑/환전)
│   ├── app/              # 라우터, 모델, 서비스
│   ├── requirements.txt
│   └── .env.example
├── scripts/              # XRPL 초기 설정 스크립트
├── docker-compose.yml    # PostgreSQL DB
└── lib/
    └── livingFundApi.ts  # 앱 → FastAPI 연결 클라이언트
```

