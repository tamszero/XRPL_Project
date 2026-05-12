import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useReceiptScanner } from "@/hooks/useReceiptScanner";
import { useSettings } from "@/hooks/useSettings";
import { useTransactionStorage } from "@/hooks/useTransactionStorage";
import { useXRPL } from "@/hooks/useXRPL";
import { categories, categorizeMerchant, getCategoryUiLabel } from "@/lib/finance";
import { useFinance } from "@/lib/finance-context";
import { useRules } from "@/lib/rules-context";
import type { Currency, ExpenseCategoryId, ReceiptAnalysisResult } from "@/types";
import { COUNTRY_CONFIGS } from "@/types";

const ALL_CURRENCIES = Object.keys(COUNTRY_CONFIGS) as Currency[];

function buildManualReceipt(merchant: string, amountLocal: number, currency: Currency): ReceiptAnalysisResult {
  const rate = COUNTRY_CONFIGS[currency]?.exchangeRate ?? 1300;
  const totalKrw = currency === "KRW" ? Math.round(amountLocal) : Math.round(amountLocal * rate * 100) / 100;
  const rateDisplay = currency === "KRW" ? 1 : rate;
  return {
    merchant_name: merchant.trim(),
    items: [],
    subtotal_local: 0,
    tax_local: 0,
    total_local: amountLocal,
    currency,
    total_krw: totalKrw,
    exchange_rate: rateDisplay,
    dutch_pay: {
      num_people: 1,
      per_person_krw: totalKrw,
      per_person_local: amountLocal,
    },
    date: new Date().toISOString().slice(0, 10),
  };
}

export default function ReceiptScannerScreen() {
  const { isLoading, error, result, pickImage, takePhoto, analyzeReceipt, clearResult } = useReceiptScanner();
  const { settings } = useSettings();
  const isEn = settings.language === "en";
  const locale = settings.language === "en" ? "en-US" : "ko-KR";
  const { addReceiptTransaction } = useFinance();
  const { rules } = useRules();
  const { saveTransaction, updateTransactionXRPL } = useTransactionStorage();
  const { recordTransaction, isLoading: isXRPLLoading } = useXRPL();

  const [manualOpen, setManualOpen] = useState(false);
  const [manualMerchant, setManualMerchant] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCurrency, setManualCurrency] = useState<Currency>(settings.selectedCurrency);

  const [isSaving, setIsSaving] = useState(false);
  const [savedTxId, setSavedTxId] = useState<string | null>(null);
  const [xrplReceipt, setXrplReceipt] = useState<ReceiptAnalysisResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategoryId>("other");

  const manualReceipt = useMemo((): ReceiptAnalysisResult | null => {
    const raw = manualAmount.replace(/,/g, "").trim();
    const amt = parseFloat(raw);
    if (!manualMerchant.trim() || !Number.isFinite(amt) || amt <= 0) return null;
    return buildManualReceipt(manualMerchant, amt, manualCurrency);
  }, [manualMerchant, manualAmount, manualCurrency]);

  const openManual = () => {
    setManualCurrency(settings.selectedCurrency);
    setManualOpen(true);
  };

  const closeManual = () => {
    setManualOpen(false);
  };

  const resetManualForm = () => {
    setManualMerchant("");
    setManualAmount("");
    setManualCurrency(settings.selectedCurrency);
  };

  useEffect(() => {
    if (manualOpen && !manualAmount) {
      setManualCurrency(settings.selectedCurrency);
    }
  }, [settings.selectedCurrency, manualOpen, manualAmount]);

  useEffect(() => {
    if (manualOpen) {
      if (!manualMerchant.trim()) {
        setSelectedCategory("other");
        return;
      }
      const { category } = categorizeMerchant(manualMerchant, rules);
      setSelectedCategory(category as ExpenseCategoryId);
      return;
    }
    if (!result) {
      setSelectedCategory("other");
      return;
    }
    const hint = [result.merchant_name, ...(result.items ?? []).map((i) => i.name)].join(" ");
    const { category } = categorizeMerchant(hint, rules);
    setSelectedCategory(category as ExpenseCategoryId);
  }, [manualOpen, manualMerchant, result, rules]);

  const rateHint = COUNTRY_CONFIGS[settings.selectedCurrency]?.exchangeRate ?? 1;

  const beginNewScan = () => {
    setSavedTxId(null);
    setXrplReceipt(null);
  };

  const handlePickImage = async () => {
    const picked = await pickImage();
    if (picked) {
      beginNewScan();
      try {
        await analyzeReceipt(picked.uri, settings.selectedCurrency, settings.backendUrl, picked.base64);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(isEn ? "Error" : "오류", msg || (isEn ? "Failed to analyze receipt" : "영수증 분석 실패"));
      }
    }
  };

  const handleTakePhoto = async () => {
    const picked = await takePhoto();
    if (picked) {
      beginNewScan();
      try {
        await analyzeReceipt(picked.uri, settings.selectedCurrency, settings.backendUrl, picked.base64);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(isEn ? "Error" : "오류", msg || (isEn ? "Failed to analyze receipt" : "영수증 분석 실패"));
      }
    }
  };

  const handleClearScan = () => {
    setSavedTxId(null);
    setXrplReceipt(null);
    clearResult();
  };

  const handleSave = async (source: "manual" | "scan") => {
    const data = source === "manual" ? manualReceipt : result;
    if (!data) return;
    setIsSaving(true);
    try {
      const payload = { ...data, category: selectedCategory };
      const tx = await saveTransaction("receipt", payload);
      addReceiptTransaction(tx);
      setSavedTxId(tx.id);
      setXrplReceipt(payload as ReceiptAnalysisResult);
      Alert.alert(isEn ? "Success" : "성공", isEn ? "Receipt saved" : "영수증이 저장되었습니다");
      if (source === "manual") {
        closeManual();
        resetManualForm();
      }
    } catch {
      Alert.alert(isEn ? "Error" : "오류", isEn ? "Save failed" : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordXRPL = async () => {
    if (!savedTxId || !settings.xrplWalletSeed || !xrplReceipt) return;

    try {
      const cat = xrplReceipt.category ?? selectedCategory;
      const xrplResult = await recordTransaction(
        {
          merchant: xrplReceipt.merchant_name,
          amount: xrplReceipt.total_krw,
          currency: xrplReceipt.currency,
          category: "receipt",
          description: `[${cat}] ${xrplReceipt.items?.map((i) => i.name).join(", ") ?? ""}`,
          timestamp: new Date().toISOString(),
        },
        settings.xrplWalletSeed,
        settings.backendUrl,
      );

      if (xrplResult.success && xrplResult.tx_hash) {
        await updateTransactionXRPL(savedTxId, xrplResult.tx_hash);
        Alert.alert(
          isEn ? "Success" : "성공",
          isEn
            ? `Recorded to XRPL\n\nTx Hash:\n${xrplResult.tx_hash.substring(0, 20)}...`
            : `XRPL에 기록되었습니다\n\nTx Hash:\n${xrplResult.tx_hash.substring(0, 20)}...`,
        );
      } else {
        Alert.alert(isEn ? "Error" : "오류", xrplResult.error || (isEn ? "XRPL recording failed" : "XRPL 기록 실패"));
      }
    } catch {
      Alert.alert(isEn ? "Error" : "오류", isEn ? "XRPL recording failed" : "XRPL 기록 실패");
    }
  };

  const recordXrplEnabled = !!(savedTxId && settings.xrplWalletSeed && xrplReceipt);

  return (
    <ScreenContainer className="px-4 pt-2">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }} showsVerticalScrollIndicator={false} className="gap-5">
        <View className="gap-1 pt-2">
          <Text className="text-3xl font-bold text-foreground tracking-tight">{isEn ? "Receipts" : "영수증"}</Text>
        </View>

        {/* 직접 입력 — 사진 블록 위 메인 CTA */}
        <Pressable
          onPress={openManual}
          style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
          className="rounded-3xl overflow-hidden border border-primary/25 bg-primary/[0.07] active:bg-primary/10"
        >
          <View className="flex-row items-center p-5 gap-4">
            <View className="h-14 w-14 rounded-2xl bg-primary/15 items-center justify-center">
              <MaterialIcons name="edit-note" size={30} color="#2563EB" />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-lg font-bold text-foreground">{isEn ? "Enter manually" : "직접 입력"}</Text>
              <Text className="text-sm text-muted leading-5">
                {isEn ? "Store name, amount & currency — works offline, no AI needed." : "상호·금액·통화만 넣으면 됩니다. 오프라인에서도 저장돼요."}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={22} color="#64748B" />
          </View>
        </Pressable>

        <View className="flex-row items-center gap-3 py-1">
          <View className="flex-1 h-px bg-border" />
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider">{isEn ? "or" : "또는"}</Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        <View className="gap-3">
          <Text className="text-base font-semibold text-foreground">{isEn ? "Take a Photo" : "사진으로 분석 (선택)"}</Text>


          <View className="gap-3">
            <TouchableOpacity
              onPress={handleTakePhoto}
              disabled={isLoading}
              className="w-full flex-row items-center gap-4 rounded-2xl bg-primary px-5 py-4 shadow-sm active:opacity-90"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" style={{ marginVertical: 4 }} />
              ) : (
                <>
                  <View className="h-12 w-12 rounded-xl bg-white/20 items-center justify-center">
                    <MaterialIcons name="photo-camera" size={26} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-white text-base">{isEn ? "Camera" : "카메라"}</Text>
                    <Text className="text-white/80 text-xs mt-0.5">{isEn ? "Take a new photo" : "새로 촬영하기"}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.7)" />
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePickImage}
              disabled={isLoading}
              className="w-full flex-row items-center gap-4 rounded-2xl bg-surface border-2 border-border px-5 py-4 active:opacity-90"
            >
              <View className="h-12 w-12 rounded-xl bg-muted/20 items-center justify-center">
                <MaterialIcons name="photo-library" size={26} color="#475569" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-foreground text-base">{isEn ? "Gallery" : "갤러리"}</Text>
                <Text className="text-muted text-xs mt-0.5">{isEn ? "Choose an existing image" : "앨범에서 선택"}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="rounded-2xl bg-surface/80 border border-border px-4 py-3 flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-muted">{isEn ? "Current" : "현재 선택"}</Text>
            <Text className="text-sm font-semibold text-foreground">
              {settings.selectedCountry} · {settings.selectedCurrency}
            </Text>
          </View>
          <Text className="text-xs text-muted text-right max-w-[55%]">
            1 {settings.selectedCurrency} ≈ ₩{Math.round(rateHint).toLocaleString(locale)}
          </Text>
        </View>

        {error && (
          <View className="p-4 rounded-2xl bg-red-50 border border-red-100">
            <Text className="text-sm text-red-800 leading-5">{error}</Text>
          </View>
        )}

        {/* 직접 입력 저장 후: 스캔 결과 블록이 없어도 XRPL 기록 가능 */}
        {!result && recordXrplEnabled && xrplReceipt && (
          <View className="gap-4 rounded-3xl border border-emerald-200/80 bg-emerald-50/90 dark:bg-emerald-950/30 dark:border-emerald-800/60 p-5">
            <View className="flex-row items-start gap-3">
              <View className="h-11 w-11 rounded-2xl bg-emerald-600/15 items-center justify-center">
                <MaterialIcons name="check-circle" size={26} color="#059669" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  {isEn ? "Receipt saved" : "영수증이 저장되었습니다"}
                </Text>
                <Text className="text-base font-semibold text-foreground">{xrplReceipt.merchant_name}</Text>
                <Text className="text-sm text-muted">
                  {xrplReceipt.total_local.toFixed(2)} {xrplReceipt.currency} → ₩{xrplReceipt.total_krw.toLocaleString(locale)}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleRecordXRPL} disabled={isXRPLLoading} className="rounded-2xl bg-emerald-600 py-4 items-center active:opacity-90">
              {isXRPLLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">{isEn ? "Record to XRPL" : "XRPL에 기록"}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearScan} className="rounded-2xl border border-border bg-background py-3.5 items-center">
              <Text className="text-foreground font-semibold text-sm">{isEn ? "Start over" : "다시 시작"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {result && (
          <View className="gap-4">
            {result.error && !error && (
              <View className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <Text className="text-sm text-amber-900 leading-5">{result.error}</Text>
              </View>
            )}

            <Text className="text-lg font-bold text-foreground">{isEn ? "Scan result" : "분석 결과"}</Text>

            <View className="rounded-2xl bg-surface border border-border p-4">
              <Text className="text-xs text-muted font-medium">{isEn ? "Merchant" : "상호명"}</Text>
              <Text className="text-xl font-bold text-foreground mt-1">{result.merchant_name}</Text>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 rounded-2xl bg-surface border border-border p-4">
                <Text className="text-xs text-muted">{isEn ? "Local" : "현지 통화"}</Text>
                <Text className="text-xl font-bold text-foreground mt-1">
                  {result.total_local.toFixed(2)} {result.currency}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl bg-primary p-4">
                <Text className="text-xs text-white/80">{isEn ? "KRW" : "원화"}</Text>
                <Text className="text-xl font-bold text-white mt-1">₩{result.total_krw.toLocaleString(locale)}</Text>
              </View>
            </View>

            <View className="rounded-2xl bg-surface border border-border px-4 py-3">
              <Text className="text-xs text-muted">{isEn ? "Rate used" : "적용 환율"}</Text>
              <Text className="text-sm font-medium text-foreground mt-1">
                1 {result.currency} = ₩{result.exchange_rate.toLocaleString(locale)}
              </Text>
            </View>

            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">{isEn ? "Category" : "지출 분류"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {categories.map((cat) => {
                  const active = selectedCategory === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setSelectedCategory(cat.id as ExpenseCategoryId)}
                      className={`mr-2 rounded-full px-4 py-2 border ${active ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                    >
                      <Text className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{getCategoryUiLabel(cat.id, settings.language)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {result.items && result.items.length > 0 && (
              <View className="gap-2">
                <Text className="text-sm font-semibold text-foreground">{isEn ? "Line items" : "품목"}</Text>
                {result.items.map((item, index) => (
                  <View key={index} className="rounded-xl bg-surface border border-border px-4 py-3 flex-row justify-between">
                    <Text className="font-medium text-foreground flex-1">{item.name}</Text>
                    <Text className="text-sm text-muted">
                      {item.quantity}
                      {isEn ? "×" : "×"} {item.price.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View className="rounded-2xl bg-emerald-600/95 p-4">
              <Text className="text-sm font-semibold text-white/90">{isEn ? "Split (1 person)" : "더치페이 (기본 1인)"}</Text>
              <View className="mt-3 gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-white/85 text-sm">{isEn ? "Per person (KRW)" : "1인당 (원화)"}</Text>
                  <Text className="text-white font-bold">₩{result.dutch_pay.per_person_krw.toLocaleString(locale)}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity onPress={() => handleSave("scan")} disabled={isSaving} className="rounded-2xl bg-primary py-4 items-center">
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{isEn ? "Save" : "저장하기"}</Text>}
            </TouchableOpacity>

            {recordXrplEnabled && (
              <TouchableOpacity onPress={handleRecordXRPL} disabled={isXRPLLoading} className="rounded-2xl bg-emerald-600 py-4 items-center">
                {isXRPLLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base">{isEn ? "Record to XRPL" : "XRPL에 기록"}</Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={handleClearScan} className="rounded-2xl border border-border bg-background py-4 items-center">
              <Text className="text-foreground font-semibold">{isEn ? "Discard" : "결과 지우기"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* 직접 입력 전체 화면 */}
      <Modal visible={manualOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeManual}>
        <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="flex-1"
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
              <Pressable onPress={closeManual} hitSlop={12} className="flex-row items-center gap-1 py-2 pr-4">
                <MaterialIcons name="close" size={24} color="#64748B" />
                <Text className="text-base text-muted font-medium">{isEn ? "Close" : "닫기"}</Text>
              </Pressable>
              <Text className="text-lg font-bold text-foreground">{isEn ? "Manual entry" : "직접 입력"}</Text>
              <View style={{ width: 72 }} />
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className="rounded-3xl bg-primary/5 border border-primary/15 p-4 mb-6">
                <Text className="text-sm text-foreground leading-5">
                  {isEn
                    ? "Enter what you see on the receipt. We convert to KRW using the rates in your app settings."
                    : "영수증에 적힌 대로 입력하면, 앱에 설정된 환율로 원화를 계산해 저장합니다."}
                </Text>
              </View>

              <View className="gap-2 mb-4">
                <Text className="text-xs font-semibold text-muted uppercase tracking-wide">{isEn ? "Merchant" : "상호명"}</Text>
                <TextInput
                  value={manualMerchant}
                  onChangeText={setManualMerchant}
                  placeholder={isEn ? "Coffee shop, supermarket…" : "카페, 마트…"}
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-foreground"
                />
              </View>

              <View className="gap-2 mb-4">
                <Text className="text-xs font-semibold text-muted uppercase tracking-wide">{isEn ? "Amount" : "금액"}</Text>
                <TextInput
                  value={manualAmount}
                  onChangeText={setManualAmount}
                  placeholder={isEn ? "0.00" : "0"}
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  className="rounded-2xl border border-border bg-surface px-4 py-4 text-2xl font-semibold text-foreground"
                />
              </View>

              <View className="mb-10">
                <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{isEn ? "Currency" : "통화"}</Text>
                <View className="flex-row flex-wrap gap-3">
                  {ALL_CURRENCIES.map((c) => {
                    const active = manualCurrency === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setManualCurrency(c)}
                        hitSlop={{ top: 6, bottom: 6 }}
                        className={`rounded-full px-5 py-3.5 border-2 min-w-[52px] items-center justify-center ${active ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
                      >
                        <Text className={`text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {manualReceipt && (
                <View className="rounded-2xl border border-border bg-surface p-4 mb-10 gap-3">
                  <Text className="text-xs font-semibold text-muted">{isEn ? "Preview" : "미리보기"}</Text>
                  <View className="flex-row justify-between items-baseline">
                    <Text className="text-foreground font-medium">{manualReceipt.merchant_name}</Text>
                    <Text className="text-lg font-bold text-foreground">
                      {manualReceipt.total_local.toFixed(2)} {manualReceipt.currency}
                    </Text>
                  </View>
                  <View className="rounded-xl bg-primary/10 px-3 py-2 self-start">
                    <Text className="text-primary font-bold">≈ ₩{manualReceipt.total_krw.toLocaleString(locale)}</Text>
                  </View>
                </View>
              )}

              <View className="mt-2 mb-4">
                <Text className="text-sm font-semibold text-foreground mb-3">{isEn ? "Category" : "지출 분류"}</Text>
                <Text className="text-xs text-muted leading-5 mb-5">
                  {isEn ? "Pick the type that best matches this payment." : "결제 성격에 가장 가까운 분류를 골라 주세요."}
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {categories.map((cat) => {
                    const active = selectedCategory === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setSelectedCategory(cat.id as ExpenseCategoryId)}
                        hitSlop={{ top: 4, bottom: 4 }}
                        className={`rounded-full px-5 py-3.5 border-2 ${active ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                      >
                        <Text className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{getCategoryUiLabel(cat.id, settings.language)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <SafeAreaView edges={["bottom"]} className="border-t border-border bg-background px-4 pt-3 pb-2 gap-2">
              <TouchableOpacity
                onPress={() => handleSave("manual")}
                disabled={isSaving || !manualReceipt}
                className={`rounded-2xl py-4 items-center ${manualReceipt ? "bg-primary" : "bg-muted opacity-50"}`}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base">{isEn ? "Save receipt" : "영수증 저장"}</Text>
                )}
              </TouchableOpacity>
              {recordXrplEnabled && (
                <TouchableOpacity onPress={handleRecordXRPL} disabled={isXRPLLoading} className="rounded-2xl bg-emerald-600 py-3.5 items-center">
                  {isXRPLLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">{isEn ? "Record to XRPL" : "XRPL에 기록"}</Text>
                  )}
                </TouchableOpacity>
              )}
            </SafeAreaView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  );
}
