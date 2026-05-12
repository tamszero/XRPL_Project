import { useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ReceiptAnalysisResult, Currency } from "@/types";

export type PickedImage = { uri: string; base64?: string };

function formatApiDetail(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: string }).msg) : JSON.stringify(d)))
      .join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: string }).message);
  }
  return `HTTP ${status}`;
}

async function imageUriToBase64(imageUri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const comma = dataUrl.indexOf(",");
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error("이미지 읽기 실패"));
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(imageUri, { encoding: "base64" });
}

export function useReceiptScanner() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptAnalysisResult | null>(null);

  const pickImage = async (): Promise<PickedImage | null> => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("카메라 라이브러리 접근 권한이 필요합니다");
        return null;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        base64: true,
      });

      if (!picked.canceled) {
        const asset = picked.assets[0];
        return { uri: asset.uri, base64: asset.base64 ?? undefined };
      }
    } catch (err) {
      setError("이미지 선택 실패: " + String(err));
    }
    return null;
  };

  const takePhoto = async (): Promise<PickedImage | null> => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError("카메라 접근 권한이 필요합니다");
        return null;
      }

      const shot = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 1,
        base64: true,
      });

      if (!shot.canceled) {
        const asset = shot.assets[0];
        return { uri: asset.uri, base64: asset.base64 ?? undefined };
      }
    } catch (err) {
      setError("카메라 실행 실패: " + String(err));
    }
    return null;
  };

  const analyzeReceipt = async (
    imageUri: string,
    currency: Currency,
    backendUrl: string,
    precomputedBase64?: string | null,
  ) => {
    setIsLoading(true);
    setError(null);

    const baseUrl = backendUrl.replace(/\/$/, "");

    try {
      const base64 = precomputedBase64?.length ? precomputedBase64 : await imageUriToBase64(imageUri);

      let apiResponse: Response;
      try {
        apiResponse = await fetch(`${baseUrl}/scan-receipt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_base64: base64,
            target_country: currency,
          }),
        });
      } catch (e) {
        const hint =
          Platform.OS !== "web" && (backendUrl.includes("localhost") || backendUrl.includes("127.0.0.1"))
            ? " 폰에서는 localhost가 이 기기 자신을 가리킵니다. 설정에서 PC의 LAN IP(예: http://192.168.x.x:8000)로 바꿔 주세요."
            : " 백엔드가 켜져 있는지, URL과 방화벽을 확인해 주세요.";
        throw new Error(`서버에 연결할 수 없습니다.${hint} (${String(e)})`);
      }

      const raw = await apiResponse.text();
      let payload: { success?: boolean; data?: ReceiptAnalysisResult; detail?: unknown } = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw?.slice(0, 200) || "서버 응답이 JSON이 아닙니다");
      }

      if (!apiResponse.ok) {
        throw new Error(formatApiDetail(payload.detail, apiResponse.status));
      }

      if (!payload.success || !payload.data) {
        throw new Error(formatApiDetail(payload.detail, apiResponse.status) || "영수증 분석 응답 형식 오류");
      }

      const analysisResult = payload.data;
      setResult(analysisResult);

      if (analysisResult.error) {
        setError(analysisResult.error);
      }

      setIsLoading(false);
      return analysisResult;
    } catch (err) {
      const errorMsg = "분석 실패: " + String(err);
      setError(errorMsg);
      setIsLoading(false);
      throw err;
    }
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  return {
    isLoading,
    error,
    result,
    pickImage,
    takePhoto,
    analyzeReceipt,
    clearResult,
  };
}
