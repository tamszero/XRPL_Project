import { Pressable, Text, TextInput, TouchableOpacity, View, Modal, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { CategoryTotalsSection } from '@/components/category-totals-section';
import { ScreenContainer } from '@/components/screen-container';
import { useFinance } from '@/lib/finance-context';
import { categories, CategoryId, getCategory, getCategoryUiLabel, Transaction } from '@/lib/finance';
import { processReceiptImage } from '@/lib/receipt-ocr';
import { processExcelFile } from '@/lib/excel-parser';
import { useSettings } from '@/hooks/useSettings';
import { COUNTRY_CONFIGS } from '@/types';


export default function RecordsScreen() {
  const { transactions, addNotification, updateTransaction, deleteTransaction } = useFinance();
  const { settings } = useSettings();
  const isEn = settings.language === 'en';
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'manual' | 'receipt' | 'excel'>('manual');

  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState<CategoryId>('other');
  const [detailSaving, setDetailSaving] = useState(false);


  const exchangeRatesByCurrency = useMemo(
    () => ({
      KRW: 1,
      ...Object.fromEntries(Object.entries(COUNTRY_CONFIGS).map(([currency, config]) => [currency, config.exchangeRate])),
    }),
    [],
  );

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    if (selectedCategory) {
      result = result.filter((t) => t.category === selectedCategory);
    }

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      result = result.filter((t) => t.merchant.toLowerCase().includes(query) || t.rawText.toLowerCase().includes(query));
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedCategory, searchText]);


  const convertAmount = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string) => {
      const fromRate = exchangeRatesByCurrency[fromCurrency as keyof typeof exchangeRatesByCurrency] ?? 1300;
      const toRate = exchangeRatesByCurrency[toCurrency as keyof typeof exchangeRatesByCurrency] ?? 1300;
      const amountInKrw = amount * fromRate;
      return amountInKrw / toRate;
    },
    [exchangeRatesByCurrency],
  );

  const formatCurrencyAmount = useCallback((amount: number, currency: string) => {
    const useFraction = !['KRW', 'JPY'].includes(currency);
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: useFraction ? 2 : 0,
      maximumFractionDigits: useFraction ? 2 : 0,
    });
  }, []);

  const getCategoryLabel = useCallback(
    (id: string, fallback: string) => {
      if (!isEn) return fallback;
      const map: Record<string, string> = {
        food: 'Food',
        transport: 'Transport',
        housing: 'Housing',
        study: 'Study',
        shopping: 'Shopping',
        health: 'Health',
        transfer: 'Transfer',
        other: 'Other',
      };
      return map[id] ?? fallback;
    },
    [isEn],
  );


  const handleAddManual = useCallback(() => {
    if (inputText.trim()) {
      addNotification(inputText);
      setInputText('');
      setModalVisible(false);
    }
  }, [inputText, addNotification]);

  const handlePickReceipt = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const receiptData = await processReceiptImage(result.assets[0].uri);
        const rawText = `${receiptData.merchantName} ${receiptData.amount} ${receiptData.currency}`;
        addNotification(rawText);
        setModalVisible(false);
      }
    } catch (error) {

      alert(isEn ? 'Failed to process receipt.' : '영수증 처리 중 오류가 발생했습니다.');
      console.error('Receipt processing error:', error);
    }
  }, [addNotification, isEn]);


  const handlePickExcel = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      });

      if (!result.canceled && result.assets[0]) {
        const txs = await processExcelFile(result.assets[0].uri);
        txs.forEach((tx) => {
          addNotification(tx.rawText);
        });
        alert(isEn ? `${txs.length} transactions added.` : `${txs.length}개의 거래가 추가되었습니다.`);
        setModalVisible(false);
      }
    } catch (error) {
      alert(isEn ? 'Failed to process Excel file.' : 'Excel 파일 처리 중 오류가 발생했습니다.');
      console.error('Excel processing error:', error);
    }
  }, [addNotification, isEn]);

  const openTransactionDetail = useCallback((item: Transaction) => {
    setDetailTx(item);
    setEditMerchant(item.merchant);
    setEditAmount(String(item.amount));
    setEditDate(item.date);
    setEditCategory(item.category);
  }, []);

  const closeTransactionDetail = useCallback(() => {
    setDetailTx(null);
  }, []);

  const handleSaveDetail = useCallback(async () => {
    if (!detailTx) return;
    const raw = editAmount.replace(/,/g, '').trim();
    const amt = parseFloat(raw);
    if (!Number.isFinite(amt) || amt < 0) {
      Alert.alert(isEn ? 'Invalid amount' : '금액 오류', isEn ? 'Enter a valid number.' : '올바른 숫자를 입력하세요.');
      return;
    }
    setDetailSaving(true);
    try {
      await updateTransaction(detailTx.id, {
        merchant: editMerchant.trim() || detailTx.merchant,
        amount: amt,
        category: editCategory,
        date: editDate.trim().slice(0, 10) || detailTx.date,
      });
      closeTransactionDetail();
    } catch (e) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Could not save changes.' : '저장하지 못했습니다.');
    } finally {
      setDetailSaving(false);
    }
  }, [detailTx, editAmount, editMerchant, editCategory, editDate, isEn, updateTransaction, closeTransactionDetail]);

  const handleDeleteDetail = useCallback(() => {
    if (!detailTx) return;
    const id = detailTx.id;
    const run = async () => {
      try {
        await deleteTransaction(id);
        closeTransactionDetail();
      } catch {
        Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Could not delete.' : '삭제하지 못했습니다.');
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(isEn ? 'Delete this transaction?' : '이 거래를 삭제할까요?')) {
        void run();
      }
      return;
    }
    Alert.alert(
      isEn ? 'Delete transaction' : '거래 삭제',
      isEn ? 'This cannot be undone.' : '삭제하면 되돌릴 수 없습니다.',
      [
        { text: isEn ? 'Cancel' : '취소', style: 'cancel' },
        { text: isEn ? 'Delete' : '삭제', style: 'destructive', onPress: () => void run() },
      ],
    );
  }, [detailTx, deleteTransaction, closeTransactionDetail, isEn]);

  return (
    <ScreenContainer className="px-5 pt-10">
      <View className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} className="flex-1">
          <View className="gap-4">
        {/* 헤더 */}
        <View className="gap-2 mb-5">
          <Text className="text-3xl font-bold text-foreground leading-10">{isEn ? 'Records' : '거래 기록'}</Text>
          <Text className="text-sm text-muted leading-5">{isEn ? 'Review and manage all transactions' : '모든 거래 내역을 확인하고 관리하세요'}</Text>
        </View>

        {/* 검색 및 필터 */}
        <View className="gap-4">
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={isEn ? 'Search by merchant or description...' : '상인명 또는 설명으로 검색...'}
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-foreground"
            placeholderTextColor="#999"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ columnGap: 10, paddingRight: 8 }}
          >
            <Pressable
              onPress={() => setSelectedCategory(null)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              className={`rounded-full px-5 py-2.5 border ${selectedCategory === null ? 'bg-primary border-primary' : 'border-border bg-surface'}`}
            >
              <Text className={`text-sm font-semibold ${selectedCategory === null ? 'text-white' : 'text-foreground'}`}>{isEn ? 'All' : '전체'}</Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id as CategoryId)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className={`rounded-full px-5 py-2.5 border ${selectedCategory === cat.id ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
              >
                <Text className={`text-sm font-semibold ${selectedCategory === cat.id ? 'text-primary' : 'text-foreground'}`}>
                  {getCategoryLabel(cat.id, cat.label)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <CategoryTotalsSection transactions={filteredTransactions} isEn={isEn} currency={settings.selectedCurrency} />

        {/* 거래 리스트 */}
        {filteredTransactions.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Text className="text-lg text-muted font-semibold mb-2">{isEn ? 'No records yet' : '거래 기록이 없습니다'}</Text>
            <Text className="text-sm text-muted">{isEn ? 'Add a transaction using the button below' : '아래 버튼으로 거래를 추가해보세요'}</Text>
          </View>
        ) : (
          <View className="pb-24">
            {filteredTransactions.map((item) => {
              const category = getCategory(item.category);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => openTransactionDetail(item)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className="mb-4 rounded-2xl bg-surface border border-border p-5"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-row items-center gap-3 flex-1">
                      <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: category.tone + '20' }}>
                        <Text className="text-xl">{getCategoryEmoji(item.category)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-foreground leading-5">{item.merchant}</Text>
                        <View className="flex-row items-center gap-2 mt-2">
                          <View className="rounded-full px-2 py-1" style={{ backgroundColor: category.tone }}>
                            <Text className="text-xs font-medium text-white">{getCategoryLabel(category.id, category.label)}</Text>
                          </View>
                          <Text className="text-xs text-muted">{item.date}</Text>
                        </View>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-sm font-bold text-foreground leading-5">
                        {formatCurrencyAmount(convertAmount(item.amount, item.currency, settings.selectedCurrency), settings.selectedCurrency)}
                      </Text>
                      <Text className="text-xs text-muted mt-1">{settings.selectedCurrency}</Text>
                    </View>
                  </View>
                  {item.confidence < 0.9 && (
                    <View className="mt-2 pt-2 border-t border-border">
                      <Text className="text-xs text-warning">⚠️ {isEn ? 'Classification confidence' : '분류 신뢰도'}: {Math.round(item.confidence * 100)}%</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
          </View>
        </ScrollView>

        {/* 추가 버튼 */}
        <TouchableOpacity onPress={() => setModalVisible(true)} className="absolute bottom-6 right-6 rounded-full bg-primary w-16 h-16 items-center justify-center shadow-lg active:opacity-80">
          <Text className="text-3xl">+</Text>
        </TouchableOpacity>

        {/* 모달 */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-background rounded-t-3xl p-6 gap-5">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-2xl font-bold text-foreground">{isEn ? 'Add Transaction' : '거래 추가'}</Text>
                <Pressable onPress={() => setModalVisible(false)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                  <Text className="text-2xl text-muted">✕</Text>
                </Pressable>
              </View>

              {/* 탭 */}
              <View className="flex-row gap-2 border-b border-border">
                {(['manual', 'receipt', 'excel'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    className={`flex-1 py-3 border-b-2 ${activeTab === tab ? 'border-primary' : 'border-transparent'}`}
                  >
                    <Text className={`text-sm font-bold text-center ${activeTab === tab ? 'text-primary' : 'text-muted'}`}>
                      {tab === 'manual' ? (isEn ? 'Text' : '텍스트') : tab === 'receipt' ? (isEn ? 'Receipt' : '영수증') : 'Excel'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* 콘텐츠 */}
              <ScrollView showsVerticalScrollIndicator={false}>
                {activeTab === 'manual' && (
                  <View className="gap-3 pb-6">
                    <Text className="text-sm text-muted">{isEn ? 'Paste your banking app notification text' : '은행 앱 알림을 복사해서 붙여넣으세요'}</Text>
                    <TextInput
                      value={inputText}
                      onChangeText={setInputText}
                      placeholder={isEn ? 'e.g. STARBUCKS LONDON approved GBP 5.40' : '예: STARBUCKS LONDON 승인 GBP 5.40'}
                      multiline
                      numberOfLines={4}
                      className="rounded-2xl border border-border bg-surface px-4 py-3 text-foreground"
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity onPress={handleAddManual} className="rounded-2xl bg-primary py-4 items-center active:opacity-80">
                      <Text className="text-white font-bold">{isEn ? 'Add' : '추가'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeTab === 'receipt' && (
                  <View className="gap-3 pb-6">
                    <Text className="text-sm text-muted">{isEn ? 'Upload a cash-payment receipt photo' : '현금 결제 영수증 사진을 업로드하세요'}</Text>
                    <TouchableOpacity onPress={handlePickReceipt} className="rounded-2xl border-2 border-dashed border-primary py-8 items-center active:opacity-80">
                      <Text className="text-4xl mb-2">📸</Text>
                      <Text className="text-sm font-bold text-primary">{isEn ? 'Choose Photo' : '사진 선택'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeTab === 'excel' && (
                  <View className="gap-3 pb-6">
                    <Text className="text-sm text-muted">{isEn ? 'Upload monthly transactions Excel file' : '월별 거래내역 Excel 파일을 업로드하세요'}</Text>
                    <TouchableOpacity onPress={handlePickExcel} className="rounded-2xl border-2 border-dashed border-primary py-8 items-center active:opacity-80">
                      <Text className="text-4xl mb-2">📊</Text>
                      <Text className="text-sm font-bold text-primary">{isEn ? 'Choose File' : '파일 선택'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 거래 상세 · 수정 · 삭제 */}
        <Modal visible={!!detailTx} animationType="slide" transparent onRequestClose={closeTransactionDetail}>
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-background rounded-t-3xl max-h-[88%]">
              <View className="flex-row items-center justify-between px-5 pt-4 pb-2 border-b border-border">
                <Text className="text-xl font-bold text-foreground">{isEn ? 'Transaction' : '거래 상세'}</Text>
                <Pressable onPress={closeTransactionDetail} hitSlop={12} className="p-2">
                  <Text className="text-2xl text-muted">✕</Text>
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
                {detailTx && (
                  <View className="gap-4">
                    <View className="gap-2">
                      <Text className="text-xs font-semibold text-muted uppercase">{isEn ? 'Merchant' : '상호명'}</Text>
                      <TextInput
                        value={editMerchant}
                        onChangeText={setEditMerchant}
                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-foreground"
                        placeholderTextColor="#999"
                      />
                    </View>
                    <View className="gap-2">
                      <Text className="text-xs font-semibold text-muted uppercase">
                        {isEn ? 'Amount' : '금액'} ({detailTx.currency})
                      </Text>
                      {detailTx.source === 'receipt' && (
                        <Text className="text-xs text-muted leading-5">
                          {isEn ? 'Receipt totals are stored in KRW.' : '영수증 금액은 원화(KRW)로 저장됩니다.'}
                        </Text>
                      )}
                      <TextInput
                        value={editAmount}
                        onChangeText={setEditAmount}
                        keyboardType="decimal-pad"
                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-lg font-semibold text-foreground"
                        placeholderTextColor="#999"
                      />
                    </View>
                    <View className="gap-2">
                      <Text className="text-xs font-semibold text-muted uppercase">{isEn ? 'Date' : '날짜'} (YYYY-MM-DD)</Text>
                      <TextInput
                        value={editDate}
                        onChangeText={setEditDate}
                        className="rounded-2xl border border-border bg-surface px-4 py-3 text-foreground"
                        placeholderTextColor="#999"
                        autoCapitalize="none"
                      />
                    </View>
                    <View className="gap-2">
                      <Text className="text-sm font-semibold text-foreground">{isEn ? 'Category' : '지출 분류'}</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {categories.map((cat) => {
                          const active = editCategory === cat.id;
                          return (
                            <Pressable
                              key={cat.id}
                              onPress={() => setEditCategory(cat.id as CategoryId)}
                              className={`rounded-full px-4 py-2.5 border-2 ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
                            >
                              <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                                {getCategoryUiLabel(cat.id, settings.language)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    {detailTx.rawText ? (
                      <View className="gap-1">
                        <Text className="text-xs font-semibold text-muted uppercase">{isEn ? 'Description' : '내용'}</Text>
                        <Text className="text-xs text-muted leading-5">{detailTx.rawText}</Text>
                      </View>
                    ) : null}
                    <View className="gap-1">
                      <Text className="text-xs font-semibold text-muted uppercase">{isEn ? 'Reference' : '참조'}</Text>
                      <Text className="text-xs text-muted font-mono" selectable>
                        {detailTx.hash}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>
              <View className="border-t border-border px-5 pt-3 pb-6 gap-3 bg-background">
                <TouchableOpacity
                  onPress={() => void handleSaveDetail()}
                  disabled={detailSaving}
                  className={`rounded-2xl py-4 items-center ${detailSaving ? 'bg-muted' : 'bg-primary'}`}
                >
                  {detailSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-bold">{isEn ? 'Save changes' : '변경 저장'}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteDetail}
                  disabled={detailSaving}
                  className="rounded-2xl border-2 border-red-200 bg-red-50 py-3.5 items-center active:opacity-80"
                >
                  <Text className="text-red-700 font-bold">{isEn ? 'Delete transaction' : '거래 삭제'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenContainer>
  );
}

function getCategoryEmoji(categoryId: string): string {
  const emojiMap: Record<string, string> = {
    food: '🍽️',
    transport: '🚗',
    housing: '🏠',
    study: '📚',
    shopping: '🛍️',
    health: '🏥',
    transfer: '💸',
    other: '📌',
  };
  return emojiMap[categoryId] || '📌';
}
