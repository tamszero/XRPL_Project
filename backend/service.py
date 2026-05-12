import google.generativeai as genai
import base64
import json
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
import os

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

EXCHANGE_RATES = {
    "KRW": 1.0,
    "USD": 1300,
    "JPY": 9.5,
    "GBP": 1650,
    "EUR": 1400,
    "CNY": 180,
    "THB": 37,
    "SGD": 970,
    "AUD": 850,
    "CAD": 950,
    "HKD": 166,
}

AVERAGE_PRICES = {
    "USD": {
        "coffee": 5.50,
        "burger": 12.00,
        "pizza": 15.00,
        "sushi": 18.00,
        "salad": 10.00,
        "pasta": 14.00,
        "steak": 25.00,
        "sandwich": 8.00,
        "ramen": 10.00,
        "chicken": 12.00,
    },
    "JPY": {
        "coffee": 500,
        "burger": 1200,
        "pizza": 1500,
        "sushi": 2000,
        "salad": 1000,
        "pasta": 1400,
        "steak": 3000,
        "sandwich": 800,
        "ramen": 900,
        "chicken": 1200,
    },
    "GBP": {
        "coffee": 4.50,
        "burger": 10.00,
        "pizza": 12.00,
        "sushi": 15.00,
        "salad": 8.50,
        "pasta": 11.00,
        "steak": 20.00,
        "sandwich": 6.50,
        "ramen": 8.00,
        "chicken": 10.00,
    },
}

def get_exchange_rate(currency: str) -> float:
    return EXCHANGE_RATES.get(currency, 1300)

def get_average_price(currency: str, item_name: str) -> Optional[float]:
    if currency not in AVERAGE_PRICES:
        return None
    
    item_lower = item_name.lower()
    prices = AVERAGE_PRICES[currency]
    
    for key, price in prices.items():
        if key in item_lower or item_lower in key:
            return price
    
    return None

def extract_json_from_text(text: str) -> Dict[str, Any]:
    if not text or not text.strip():
        return {}
    raw = text.strip()
    # Markdown ```json ... ``` 블록
    if "```" in raw:
        for chunk in raw.split("```"):
            chunk = chunk.strip()
            if chunk.lower().startswith("json"):
                chunk = chunk[4:].lstrip()
            if chunk.startswith("{"):
                try:
                    return json.loads(chunk)
                except json.JSONDecodeError:
                    continue
    json_match = re.search(r"\{[\s\S]*\}", raw)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    return {}


def _decode_image_base64(image_b64: str) -> tuple[bytes, str]:
    """Base64 문자열을 바이트로 디코드하고 MIME 타입을 추정한다. Gemini는 raw bytes가 필요하다."""
    cleaned = re.sub(r"\s+", "", image_b64 or "")
    cleaned += "=" * (-len(cleaned) % 4)
    try:
        data = base64.b64decode(cleaned, validate=False)
    except Exception as e:
        raise ValueError(f"Invalid receipt image (base64): {e}") from e
    if len(data) < 12:
        raise ValueError("Receipt image is too small or empty")
    if data[:3] == b"\xff\xd8\xff":
        return data, "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return data, "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return data, "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1"):
        return data, "image/heic"
    return data, "image/jpeg"


def _maybe_downscale_image(image_bytes: bytes, mime_type: str, max_edge: int = 2048) -> tuple[bytes, str]:
    """큰 이미지는 API/전송에 부담되므로 가장 긴 변 기준으로 축소 (Pillow 있을 때만)."""
    try:
        from io import BytesIO

        from PIL import Image
    except ImportError:
        return image_bytes, mime_type
    try:
        im = Image.open(BytesIO(image_bytes))
        im = im.convert("RGB")
        w, h = im.size
        if max(w, h) <= max_edge:
            return image_bytes, mime_type
        im.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        buf = BytesIO()
        im.save(buf, format="JPEG", quality=88, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception:
        return image_bytes, mime_type


GEMINI_VISION_MODELS = ("gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest")


def _response_text_safe(response) -> str:
    try:
        t = response.text
        return (t or "").strip()
    except Exception:
        parts: List[str] = []
        pf = getattr(response, "prompt_feedback", None)
        if pf is not None:
            parts.append(str(pf))
        for c in getattr(response, "candidates", None) or []:
            fr = getattr(c, "finish_reason", None)
            if fr is not None:
                parts.append(f"finish={fr}")
        return " ".join(parts).strip()


def _generate_vision(image_bytes: bytes, mime_type: str, prompt: str) -> str:
    """여러 모델명을 순서대로 시도 (지역/계정별 사용 가능 모델 차이 대응)."""
    last_err: Optional[Exception] = None
    for model_name in GEMINI_VISION_MODELS:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                [
                    {"mime_type": mime_type, "data": image_bytes},
                    prompt,
                ]
            )
            text = _response_text_safe(response)
            if text:
                return text
            last_err = RuntimeError(f"{model_name}: 빈 응답 또는 콘텐츠 차단")
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Gemini 비전 호출 실패: {last_err}")


def analyze_receipt(image_data: str, target_country: str = "USD") -> Dict[str, Any]:
    """
    영수증 이미지 분석 (Gemini 비전).
    이미지는 URL-safe base64 문자열로 전달되며, API에는 raw bytes로 디코딩해 전달해야 한다.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError(
            "GEMINI_API_KEY가 backend/.env에 설정되어 있지 않습니다. "
            "영수증 분석을 쓰려면 Google AI Studio에서 키를 발급해 설정하세요."
        )

    image_bytes, mime_type = _decode_image_base64(image_data)
    image_bytes, mime_type = _maybe_downscale_image(image_bytes, mime_type)

    def _empty_result(msg: str) -> Dict[str, Any]:
        return {
            "error": msg,
            "merchant_name": "Unknown",
            "items": [],
            "subtotal_local": 0.0,
            "tax_local": 0.0,
            "total_local": 0.0,
            "currency": target_country,
            "total_krw": 0.0,
            "exchange_rate": get_exchange_rate(target_country),
            "dutch_pay": {"num_people": 1, "per_person_krw": 0.0, "per_person_local": 0.0},
        }

    try:
        prompt = f"""
You are reading a real payment receipt photo. Extract ONLY what is printed on the receipt.

The image may be blurry, low resolution, skewed, or a photo of a monitor — still do your best to read printed numbers and words.

Rules:
- Read the FINAL total / amount due (총액, TOTAL, Balance, Grand Total, 合計, etc.) as a number in the receipt's own currency.
- "currency" must be the ISO 4217 code printed or implied on the receipt (e.g. USD, KRW, GBP, EUR, JPY). If unclear, guess from currency symbols (₩ KRW, $ often USD, £ GBP, € EUR).
- List line items if visible (name, quantity, line price). If unreadable, use an empty array.
- subtotal and tax only if shown; otherwise use 0.
- party_size: number of people to split the bill (only if the receipt suggests a party count or you see a clear split count; otherwise 1).
- User app context (not printed on receipt): their selected wallet currency hint = "{target_country}". Use this only if the receipt currency is truly ambiguous.

Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{{
  "merchant_name": "string",
  "items": [{{"name": "string", "quantity": 1, "price": 0.0}}],
  "subtotal": 0.0,
  "tax": 0.0,
  "total": 0.0,
  "currency": "USD",
  "party_size": 1,
  "date": "YYYY-MM-DD or empty",
  "time": "HH:MM or empty"
}}
"""

        raw_text = _generate_vision(image_bytes, mime_type, prompt)
        receipt_data = extract_json_from_text(raw_text)

        if not receipt_data:
            fb_prompt = """
The receipt image may be very blurry, compressed from the internet, or a photo of a screen.
Read ANY visible final amount (TOTAL, Grand total, Balance, 合計, 결제금액, etc.) and currency.

Return ONLY valid JSON (no markdown), same keys as a full receipt:
{"merchant_name":"string or Unknown","items":[],"subtotal":0,"tax":0,"total":0.0,"currency":"KRW","party_size":1,"date":"","time":""}
If you cannot read any amount, set total to 0 and currency to "KRW".
"""
            raw_text = _generate_vision(image_bytes, mime_type, fb_prompt.strip())
            receipt_data = extract_json_from_text(raw_text)

        if not receipt_data:
            return _empty_result(
                "모델이 JSON을 반환하지 않았습니다. "
                "인터넷에서 받은 낮은 화질·세로로 잘린 이미지는 어려울 수 있습니다. "
                "밝은 곳에서 영수증 전체가 보이게 다시 촬영하거나, 갤러리에서 자르기 없이 원본을 선택해 보세요."
            )

        items_raw = receipt_data.get("items") or []
        items: List[Dict[str, Any]] = []
        for it in items_raw:
            if not isinstance(it, dict):
                continue
            try:
                qty = int(it.get("quantity", 1) or 1)
            except (TypeError, ValueError):
                qty = 1
            try:
                price = float(it.get("price", 0) or 0)
            except (TypeError, ValueError):
                price = 0.0
            name = str(it.get("name", "")).strip() or "Item"
            items.append({"name": name, "quantity": max(1, qty), "price": price})

        receipt_currency = str(receipt_data.get("currency") or target_country).upper().strip()
        if len(receipt_currency) != 3:
            receipt_currency = target_country
        # ISO 외 값 방지
        if receipt_currency not in EXCHANGE_RATES:
            receipt_currency = target_country if target_country in EXCHANGE_RATES else "USD"

        try:
            total_local = float(receipt_data.get("total", 0) or 0)
        except (TypeError, ValueError):
            total_local = 0.0

        if total_local <= 0 and items:
            total_local = sum(float(i.get("price", 0) or 0) * int(i.get("quantity", 1) or 1) for i in items)

        subtotal = float(receipt_data.get("subtotal", 0) or 0) if receipt_data.get("subtotal") is not None else 0.0
        tax = float(receipt_data.get("tax", 0) or 0) if receipt_data.get("tax") is not None else 0.0

        try:
            party_size = int(receipt_data.get("party_size", 1) or 1)
        except (TypeError, ValueError):
            party_size = 1
        party_size = max(1, min(party_size, 50))

        exchange_rate = get_exchange_rate(receipt_currency)
        if receipt_currency == "KRW":
            total_krw = round(total_local, 2)
            rate_for_client = 1.0
        else:
            total_krw = round(total_local * exchange_rate, 2)
            rate_for_client = exchange_rate

        dutch_pay_per_person_krw = total_krw / party_size if party_size else total_krw
        dutch_pay_per_person_local = total_local / party_size if party_size else total_local

        result_out: Dict[str, Any] = {
            "merchant_name": str(receipt_data.get("merchant_name", "Unknown")).strip() or "Unknown",
            "items": items,
            "subtotal_local": subtotal,
            "tax_local": tax,
            "total_local": total_local,
            "currency": receipt_currency,
            "total_krw": total_krw,
            "exchange_rate": rate_for_client,
            "dutch_pay": {
                "num_people": party_size,
                "per_person_krw": round(dutch_pay_per_person_krw, 2),
                "per_person_local": round(dutch_pay_per_person_local, 2),
            },
            "date": receipt_data.get("date") or None,
            "time": receipt_data.get("time") or None,
        }
        if total_local <= 0:
            result_out["error"] = (
                "총액을 읽지 못했습니다. 인터넷 이미지는 화질·잘림 때문에 실패하는 경우가 많습니다. "
                "실물 영수증을 밝은 곳에서 정면으로, 총액 줄이 잘리지 않게 촬영하거나 자르기 없이 선택해 보세요."
            )
        return result_out

    except Exception as e:
        return _empty_result(str(e))

def analyze_price_before_purchase(image_data_or_text: str, target_country: str = "USD", is_image: bool = False) -> Dict[str, Any]:
    """
    메뉴판/가격표 분석 - 결제 전 가격 비교
    메뉴명, 현지 가격, 원화 환산 금액, 평균가 비교 멘트 포함
    """
    try:
        if is_image:
            img_bytes, img_mime = _decode_image_base64(image_data_or_text)
            img_bytes, img_mime = _maybe_downscale_image(img_bytes, img_mime)
            prompt = f"""
            Analyze this menu/price list image and extract items with prices in JSON format:
            
            {{
                "menu_items": [
                    {{"name": "item name", "price": 0.00, "description": "brief description"}},
                ],
                "currency": "{target_country}",
                "restaurant_name": "Name if visible"
            }}
            
            Return ONLY valid JSON, no additional text.
            """
            response_text = _generate_vision(img_bytes, img_mime, prompt)
        else:
            prompt = f"""
            Parse this menu text and extract items with prices in JSON format:
            
            {{
                "menu_items": [
                    {{"name": "item name", "price": 0.00, "description": "brief description"}},
                ],
                "currency": "{target_country}",
                "restaurant_name": "Name if mentioned"
            }}
            
            Text to parse:
            {image_data_or_text}
            
            Return ONLY valid JSON, no additional text.
            """
            response_text = ""
            last_err: Optional[Exception] = None
            for model_name in GEMINI_VISION_MODELS:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(prompt)
                    response_text = _response_text_safe(response)
                    if response_text:
                        break
                    last_err = RuntimeError(f"{model_name}: 빈 응답")
                except Exception as e:
                    last_err = e
                    continue
            if not response_text:
                raise RuntimeError(f"Gemini 텍스트 호출 실패: {last_err}")

        menu_data = extract_json_from_text(response_text)
        
        if not menu_data:
            menu_data = {
                "menu_items": [],
                "currency": target_country,
                "restaurant_name": "Unknown",
            }
        
        exchange_rate = get_exchange_rate(target_country)
        
        analyzed_items = []
        for item in menu_data.get("menu_items", []):
            item_name = item.get("name", "Unknown")
            local_price = item.get("price", 0.0)
            krw_price = local_price * exchange_rate
            
            average_price = get_average_price(target_country, item_name)
            
            if average_price:
                price_diff = local_price - average_price
                price_diff_percent = (price_diff / average_price * 100) if average_price > 0 else 0
                
                if price_diff > 0:
                    comparison = f"현재 설정된 {target_country}의 {item_name} 평균가는 약 {average_price:.2f}입니다. 이 메뉴는 평균 대비 약 {price_diff_percent:.1f}% 높게 책정되어 있습니다."
                elif price_diff < 0:
                    comparison = f"현재 설정된 {target_country}의 {item_name} 평균가는 약 {average_price:.2f}입니다. 이 메뉴는 평균 대비 약 {abs(price_diff_percent):.1f}% 낮게 책정되어 있습니다."
                else:
                    comparison = f"현재 설정된 {target_country}의 {item_name} 평균가는 약 {average_price:.2f}입니다. 이 메뉴는 평균 가격과 동일하게 책정되어 있습니다."
            else:
                comparison = f"이 메뉴의 평균 가격 정보가 없습니다."
            
            analyzed_items.append({
                "name": item_name,
                "price_local": local_price,
                "price_krw": round(krw_price, 2),
                "currency": target_country,
                "description": item.get("description", ""),
                "average_price_local": average_price,
                "price_comparison": comparison,
            })
        
        result = {
            "restaurant_name": menu_data.get("restaurant_name", "Unknown"),
            "menu_items": analyzed_items,
            "currency": target_country,
            "exchange_rate": exchange_rate,
        }
        
        return result
        
    except Exception as e:
        return {
            "error": str(e),
            "restaurant_name": "Error",
            "menu_items": [],
            "currency": target_country,
        }
