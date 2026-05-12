import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Alert, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useMenuScanner } from "@/hooks/useMenuScanner";
import { useSettings } from "@/hooks/useSettings";
import { useState } from "react";

export default function MenuScannerScreen() {
  // ✅ 훅에서 꺼내오는 이름들을 원본 코드에 맞게 수정했습니다 (analyzeImage, analyzeText, clear 등)
  const { isLoading, error, result, pickImage, takePhoto, analyzeImage, analyzeText, clear } = useMenuScanner();
  const { settings } = useSettings();
  const isEn = settings.language === "en";
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [menuText, setMenuText] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);

  const handlePickImage = async () => {
    const imageUri = await pickImage();
    if (imageUri) {
      setSelectedImage(imageUri);
      try {
        // ✅ analyzeImage 로 수정 및 파라미터 맞춤
        await analyzeImage(imageUri, settings.selectedCurrency);
      } catch (err) {
        Alert.alert(isEn ? "Error" : "오류", isEn ? "Failed to analyze menu" : "메뉴판 분석 실패");
      }
    }
  };

  const handleTakePhoto = async () => {
    const imageUri = await takePhoto();
    if (imageUri) {
      setSelectedImage(imageUri);
      try {
        // ✅ analyzeImage 로 수정
        await analyzeImage(imageUri, settings.selectedCurrency);
      } catch (err) {
        Alert.alert(isEn ? "Error" : "오류", isEn ? "Failed to analyze menu" : "메뉴판 분석 실패");
      }
    }
  };

  const handleAnalyzeText = async () => {
    if (!menuText.trim()) {
      Alert.alert(isEn ? "Error" : "오류", isEn ? "Please enter menu text" : "메뉴 정보를 입력해주세요");
      return;
    }
    try {
      // ✅ analyzeText 로 수정
      await analyzeText(menuText, settings.selectedCurrency);
    } catch (err) {
      Alert.alert(isEn ? "Error" : "오류", isEn ? "Failed to analyze menu" : "메뉴판 분석 실패");
    }
  };

  const handleClear = () => {
    // ✅ clear 로 수정
    clear();
    setSelectedImage(null);
    setMenuText("");
    setShowTextInput(false);
  };

  const getPriceComparison = (comparison: string) => {
    if (comparison === "비쌈") {
      return { icon: "📈", color: "text-error" };
    } else if (comparison === "저렴") {
      return { icon: "📉", color: "text-success" };
    }
    return { icon: "➡️", color: "text-muted" };
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="gap-6">
        {/* 헤더 */}
        <View className="gap-2">
          <Text className="text-3xl font-bold text-foreground">{isEn ? "Menu Scanner" : "메뉴판 스캔"}</Text>
          <Text className="text-sm text-muted">{isEn ? "Analyze prices and compare with averages" : "가격을 분석하고 평균가와 비교"}</Text>
        </View>

        {/* 현재 통화 설정 */}
        <View className="p-4 bg-surface rounded-lg border border-border">
          <Text className="text-sm text-muted">{isEn ? "Current currency" : "현재 통화 설정"}</Text>
          <Text className="text-2xl font-bold text-foreground mt-1">
            {settings.selectedCountry} ({settings.selectedCurrency})
          </Text>
        </View>

        {/* 스캔 버튼 */}
        {!result && !showTextInput && (
          <View className="gap-3">
            <TouchableOpacity onPress={handleTakePhoto} disabled={isLoading} className="p-4 bg-primary rounded-lg">
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-center font-semibold text-background">{isEn ? "📷 Take photo" : "📷 카메라로 촬영"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePickImage} disabled={isLoading} className="p-4 bg-surface border border-border rounded-lg">
              <Text className="text-center font-semibold text-foreground">{isEn ? "🖼️ Choose from gallery" : "🖼️ 갤러리에서 선택"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowTextInput(true)} className="p-4 bg-surface border border-border rounded-lg">
              <Text className="text-center font-semibold text-foreground">{isEn ? "📝 Enter text" : "📝 텍스트 입력"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 텍스트 입력 모드 */}
        {showTextInput && !result && (
          <View className="gap-3">
            <TextInput
              value={menuText}
              onChangeText={setMenuText}
              placeholder={isEn ? "Enter menu and prices\nex: Coffee 5.50, Burger 12.00" : "메뉴명과 가격을 입력해주세요\n예: 커피 5.50, 버거 12.00"}
              multiline
              numberOfLines={4}
              className="p-4 bg-surface border border-border rounded-lg text-foreground"
              placeholderTextColor="#9BA1A6"
            />
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={handleAnalyzeText} disabled={isLoading} className="flex-1 p-4 bg-primary rounded-lg">
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center font-semibold text-background">{isEn ? "Analyze" : "분석"}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTextInput(false)} className="flex-1 p-4 bg-surface border border-border rounded-lg">
                <Text className="text-center font-semibold text-foreground">{isEn ? "Cancel" : "취소"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 에러 메시지 */}
        {error && (
          <View className="p-4 bg-error rounded-lg">
            <Text className="text-sm text-background">{error}</Text>
          </View>
        )}

        {/* 분석 결과 */}
        {result && (
          <View className="gap-4">
            {/* 메뉴 항목 */}
            <View className="gap-3">
              <Text className="text-lg font-semibold text-foreground">{isEn ? "Menu & Prices" : "메뉴 및 가격"}</Text>

              {/* ✅ result.items 로 수정 및 item 속성들 원본 타입에 맞게 매칭 */}
              {result.items.map((item, index) => {
                const comparison = getPriceComparison(item.price_comparison);
                return (
                  <View key={index} className="p-4 bg-surface rounded-lg border border-border gap-2">
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1">
                        <Text className="font-bold text-foreground">{item.name}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-lg font-bold text-primary">
                          {item.price.toFixed(2)} {item.currency}
                        </Text>
                        <Text className="text-sm text-muted">
                          ₩{item.price_krw.toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {item.average_price && (
                      <View className="p-3 bg-background rounded border border-border">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-lg">{comparison.icon}</Text>
                          <Text className={`text-xs flex-1 ${comparison.color}`}>
                            {item.price_comparison} - {item.message}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* 액션 버튼 */}
            <View className="gap-2">
              <TouchableOpacity className="p-4 bg-primary rounded-lg">
                  <Text className="text-center font-semibold text-background">{isEn ? "💾 Save" : "💾 저장하기"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClear} className="p-4 bg-surface border border-border rounded-lg">
                <Text className="text-center font-semibold text-foreground">{isEn ? "Scan again" : "다시 스캔"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}