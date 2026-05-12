# Finance Compass - 백엔드/프론트엔드 통합 가이드

## 🚀 빠른 시작

### 1단계: 환경 변수 설정

```bash
# backend/.env 파일 생성
cd backend
cp .env.example .env

# 아래 정보를 .env에 입력:
# GEMINI_API_KEY=your_key_from_ai.google.dev
# NGROK_TOKEN=your_token_from_ngrok (선택사항)
```

### 2단계: 백엔드 실행

```bash
# 방법 1: 직접 실행
cd backend
python start.py

# 방법 2: npm 스크립트 사용
pnpm dev:backend
```

백엔드가 `http://localhost:8000`에서 실행됩니다.

### 3단계: 프론트엔드 환경 변수 설정

```bash
# 프로젝트 루트에서
cp .env.example .env.local

# .env.local 파일에 백엔드 URL 입력:
EXPO_PUBLIC_API_URL=http://localhost:8000
# ngrok 사용 시:
# EXPO_PUBLIC_API_URL=https://your-ngrok-url.ngrok.io
```

### 4단계: 프론트엔드 실행

```bash
# 웹 프리뷰
pnpm dev:metro

# 또는 전체 개발 환경 (백엔드 + 프론트엔드)
pnpm dev
```

---

## 📡 API 엔드포인트

### 영수증 분석
```
POST /api/transactions/analyze-receipt
{
  "image_base64": "...",
  "currency": "USD",
  "user_id": "user123"
}
```

### 은행 알림 분석
```
POST /api/transactions/analyze-bank-notification
{
  "notification_text": "Starbucks 5.40 GBP...",
  "currency": "GBP",
  "user_id": "user123"
}
```

### 메뉴판 분석
```
POST /api/menu/analyze
{
  "image_base64": "..." 또는 "text": "...",
  "currency": "USD"
}
```

### 거래 목록 조회
```
GET /api/transactions/list?user_id=user123
```

### 지갑 연결
```
POST /api/wallets/connect
{
  "user_id": "user123",
  "wallet_seed": "sEd7rBGm5kxzauRTAV2hbsa...",
  "wallet_name": "My Wallet"
}
```

### XRPL에 기록
```
POST /api/transactions/{transaction_id}/record-xrpl?wallet_seed=sEd7rBGm5kxzauRTAV2hbsa...
```

---

## 🔧 문제 해결

### "GEMINI_API_KEY가 없습니다" 오류
- https://aistudio.google.com/app/apikey 에서 API 키 발급
- `backend/.env` 파일에 `GEMINI_API_KEY=your_key` 추가

### "API 연결 실패" 오류
- 백엔드가 실행 중인지 확인: `http://localhost:8000/health`
- 프론트엔드의 `EXPO_PUBLIC_API_URL` 확인
- CORS 설정 확인 (백엔드는 모든 도메인 허용)

### ngrok 사용 (원격 접속)
```bash
# backend/.env에 ngrok 토큰 추가
NGROK_TOKEN=your_token_from_ngrok

# 백엔드 실행 시 자동으로 공개 URL 생성
python start.py
# 출력: 🌍 ngrok 공개 URL: https://xxxx-xxx-xxx.ngrok.io

# 프론트엔드 .env.local에 입력
EXPO_PUBLIC_API_URL=https://xxxx-xxx-xxx.ngrok.io
```

---

## 📚 API 문서

백엔드 실행 후 다음 URL에서 Swagger UI 확인:
- http://localhost:8000/docs

---

## ✨ 주요 기능

✅ **Gemini AI 영수증 인식**: 이미지 → 자동 분류  
✅ **은행 알림 자동 분석**: 텍스트 → 거래 추출  
✅ **메뉴판 가격 비교**: 평균가 대비 분석  
✅ **XRPL 블록체인**: 모든 거래 영구 기록  
✅ **지갑 관리**: 여러 XRPL 지갑 지원  
✅ **환율 자동 계산**: 실시간 환율 적용  
✅ **PDF 보고서**: 기간별 거래 내역 생성

---

## 🎯 다음 단계

1. **Gemini API 키 발급**: https://aistudio.google.com/app/apikey
2. **XRPL 테스트넷 지갑 생성**: https://xrpl.org/xrp-testnet-faucet.html
3. **ngrok 토큰 (선택)**: https://dashboard.ngrok.com/auth/your-authtoken
4. `.env` 파일 설정 후 백엔드 실행
5. 프론트엔드 실행 후 앱에서 모든 기능 테스트
