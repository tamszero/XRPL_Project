import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useSettings } from '@/hooks/useSettings';
import { COUNTRY_CONFIGS, Currency, Language } from '@/types';
import { useState } from 'react';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const { settings, updateSettings, setCurrency, setLanguage } = useSettings();

  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const isEn = settings.language === 'en';

  const handleCurrencyChange = async (currency: Currency) => {
    await setCurrency(currency);
  };

  const handleLanguageChange = async (language: Language) => {
    await setLanguage(language);
  };

  const handleOpenRules = () => {
    router.push('/(tabs)/rules');
  };

  const handleOpenReport = () => {
    router.push('/(tabs)/report');
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} className="gap-6">
        {/* 헤더 */}
        <View className="gap-2">
          <Text className="text-3xl font-bold text-foreground">{isEn ? 'Settings' : '설정'}</Text>
          <Text className="text-sm text-muted">{isEn ? 'Configure app preferences' : '앱 설정 및 환경 구성'}</Text>
        </View>

        {/* 국가/통화 선택 */}
        <View className="gap-3">
          <Text className="text-lg font-semibold text-foreground">{isEn ? 'Country & Currency' : '국가 및 통화'}</Text>
          <Text className="text-sm text-muted">
            {isEn ? 'Current' : '현재 선택'}: {settings.selectedCountry} ({settings.selectedCurrency})
          </Text>
          <View className="gap-2">
            {Object.entries(COUNTRY_CONFIGS).map(([currency, config]) => (
              <TouchableOpacity
                key={currency}
                onPress={() => handleCurrencyChange(currency as Currency)}
                className={`p-4 rounded-lg border-2 ${
                  settings.selectedCurrency === currency ? 'bg-primary border-primary' : 'bg-surface border-border'
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Text className="text-2xl">{config.flag}</Text>
                    <View>
                      <Text className={`font-semibold ${settings.selectedCurrency === currency ? 'text-background' : 'text-foreground'}`}>
                        {isEn ? config.code : config.name}
                      </Text>
                      <Text className={`text-xs ${settings.selectedCurrency === currency ? 'text-background' : 'text-muted'}`}>
                        {currency} (1 {currency} = ₩{config.exchangeRate.toLocaleString()})
                      </Text>
                    </View>
                  </View>
                  {settings.selectedCurrency === currency && (
                    <Text className="text-lg text-background">✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 백엔드 URL 설정 */}
        <View className="gap-3 p-4 bg-surface rounded-lg border border-border">
          <Text className="text-lg font-semibold text-foreground">{isEn ? 'Backend' : '백엔드 설정'}</Text>
          <Text className="text-xs text-muted">
            {isEn
              ? 'On mobile, use your PC IP instead of localhost (e.g. http://192.168.x.x:8000)'
              : '폰에서 사용할 때는 localhost 대신 PC의 IP 주소로 변경하세요 (예: http://192.168.x.x:8000)'}
          </Text>
          <View className="gap-2">
            <Text className="text-sm font-medium text-muted">FastAPI URL</Text>
            <TextInput
              value={backendUrl}
              onChangeText={setBackendUrl}
              placeholder="http://localhost:8000"
              autoCapitalize="none"
              className="p-3 bg-background border border-border rounded-lg text-foreground"
              placeholderTextColor="#9BA1A6"
            />
          </View>
          <TouchableOpacity
            onPress={async () => {
              await updateSettings({ backendUrl });
              Alert.alert(isEn ? 'Success' : '성공', isEn ? 'Saved.' : '저장되었습니다');
            }}
            className="p-3 bg-primary rounded-lg"
          >
            <Text className="text-center font-semibold text-background">{isEn ? 'Save' : '저장'}</Text>
          </TouchableOpacity>
        </View>

        {/* Report */}
        <View className="gap-3 p-4 bg-surface rounded-lg border border-border">
          <Text className="text-lg font-semibold text-foreground">{isEn ? 'Report' : '리포트'}</Text>
          <Text className="text-xs text-muted">{isEn ? 'Open categorized expense summary' : '카테고리별 지출 요약 페이지로 이동'}</Text>
          <TouchableOpacity onPress={handleOpenReport} className="p-3 bg-primary rounded-lg">
            <Text className="text-center font-semibold text-background">{isEn ? 'Go to report' : '리포트 열기'}</Text>
          </TouchableOpacity>
        </View>

        {/* Language */}
        <View className="gap-3 p-4 bg-surface rounded-lg border border-border">
          <Text className="text-lg font-semibold text-foreground">{isEn ? 'Language' : '언어 설정'}</Text>
          <Text className="text-xs text-muted">{isEn ? 'Choose app display language' : '앱 화면 언어를 선택하세요'}</Text>
          <View className="flex-row gap-2">
            {([
              { key: 'ko' as const, label: '한국어' },
              { key: 'en' as const, label: 'English' },
            ] as const).map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => handleLanguageChange(item.key)}
                className={`flex-1 p-3 rounded-lg border-2 ${
                  settings.language === item.key ? 'bg-primary border-primary' : 'bg-background border-border'
                }`}
              >
                <Text className={`text-center font-semibold ${settings.language === item.key ? 'text-background' : 'text-foreground'}`}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 앱 정보 */}
        <View className="gap-2 p-4 bg-surface rounded-lg border border-border">
          <Text className="text-sm font-semibold text-foreground">{isEn ? 'App Info' : '앱 정보'}</Text>
          <Text className="text-xs text-muted">https://github.com/tamszero/XRPL_Project</Text>
          <Text className="text-xs text-muted">
            {isEn
              ? 'Student finance manager with XRPL-based remittance/exchange features.'
              : '유학생 재정 관리 및 XRPL 블록체인 기반 생활비 송금/환전 앱'}
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
