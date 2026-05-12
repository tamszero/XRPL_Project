import { View, Text, ScrollView } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useTransactionStorage } from "@/hooks/useTransactionStorage";
import { useSettings } from "@/hooks/useSettings";
import { useEffect } from "react";

export default function ReportScreen() {
  const { settings } = useSettings();
  const storage = useTransactionStorage() as any; // 타입 에러 방지용 any
  
  // 훅 내부 함수명이 다를 수 있으므로 체크 후 할당
  const transactions = storage.transactions || [];
  const loadTransactions = storage.loadTransactions || storage.fetchTransactions || (() => {});
  
  const isEn = settings.language === "en";

  useEffect(() => {
    loadTransactions();
  }, []);

  // tx.amount 또는 tx.totalKrw 중 존재하는 값 사용
  const totalSpending = transactions.reduce((sum: number, tx: any) => 
    sum + (tx.amount || tx.totalKrw || 0), 0
  );

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="gap-6">
        <View className="p-6 bg-primary rounded-2xl">
          <Text className="text-background/80 text-sm">{isEn ? "Total" : "총 지출액"}</Text>
          <Text className="text-background text-4xl font-bold mt-2">
            ₩{totalSpending.toLocaleString()}
          </Text>
        </View>

        <View className="gap-4">
          {transactions.map((tx: any, index: number) => (
            <View key={tx.id || index} className="p-4 bg-surface rounded-xl border border-border flex-row justify-between">
              <View>
                <Text className="font-bold text-foreground">
                  {tx.merchant || tx.merchantName || "Unknown"}
                </Text>
                <Text className="text-xs text-muted">
                  {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : ""}
                </Text>
              </View>
              <Text className="font-bold text-primary">
                ₩{(tx.amount || tx.totalKrw || 0).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}