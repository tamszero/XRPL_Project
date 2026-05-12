import { useState, useCallback } from 'react';
import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useSettings } from '@/hooks/useSettings';
import { livingFundApi, WalletInfo, TxRecord } from '@/lib/livingFundApi';

type Tab = 'balance' | 'charge' | 'exchange' | 'history';

export default function WalletScreen() {
  const { settings, updateSettings } = useSettings();
  const isEn = settings.language === 'en';
  const [activeTab, setActiveTab] = useState<Tab>('balance');

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [senderSeed, setSenderSeed] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCurrency, setChargeCurrency] = useState('USD');
  const [charging, setCharging] = useState(false);

  const [fromCurrency, setFromCurrency] = useState('XRP');
  const [toCurrency, setToCurrency] = useState('USD');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchanging, setExchanging] = useState(false);

  // 지갑 생성/연결 상태
  const [connectMode, setConnectMode] = useState<'create' | 'connect'>('create');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [connectEmail, setConnectEmail] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connectingWallet, setConnectingWallet] = useState(false);

  const api = livingFundApi(settings.backendUrl);
  const walletId = settings.xrplWalletId;

  const fetchWallet = useCallback(async () => {
    if (!walletId) return;
    try {
      const data = await api.getWallet(walletId);
      setWallet(data);
    } catch (e: any) {
      console.error('잔액 조회 실패:', e.message);
    }
  }, [walletId, settings.backendUrl]);

  const fetchTransactions = useCallback(async () => {
    if (!walletId) return;
    try {
      const data = await api.getTransactions(walletId);
      setTransactions(data);
    } catch (e: any) {
      console.error('내역 조회 실패:', e.message);
    }
  }, [walletId, settings.backendUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchWallet(), fetchTransactions()]);
    setRefreshing(false);
  }, [fetchWallet, fetchTransactions]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'balance' || tab === 'charge' || tab === 'exchange') fetchWallet();
    if (tab === 'history') fetchTransactions();
  };

  const handleCreateWallet = async () => {
    if (!userName || !userEmail || !userPassword) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Please enter name, email and password.' : '이름, 이메일, 비밀번호를 모두 입력해주세요');
      return;
    }
    if (userPassword.length < 6) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Password must be at least 6 characters.' : '비밀번호는 6자 이상이어야 합니다');
      return;
    }
    setCreatingWallet(true);
    try {
      const user = await api.createUser(userName, userEmail, userPassword, userPhone || undefined);
      const w = await api.createWallet(user.id);
      await updateSettings({
        xrplUserId: user.id,
        xrplWalletId: w.id,
        xrplAddress: w.xrpl_address,
      });
      Alert.alert(
        isEn ? 'Success' : '성공',
        isEn ? `Wallet created!\nAddress: ${w.xrpl_address}` : `지갑이 생성되었습니다!\n주소: ${w.xrpl_address}`,
      );
    } catch (e: any) {
      Alert.alert(isEn ? 'Error' : '오류', e.message ?? (isEn ? 'Failed to create wallet' : '지갑 생성 실패'));
    } finally {
      setCreatingWallet(false);
    }
  };

  const handleConnectWallet = async () => {
    if (!connectEmail || !connectPassword) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Please enter email and password.' : '이메일과 비밀번호를 입력해주세요');
      return;
    }
    setConnectingWallet(true);
    try {
      const result = await api.lookupWalletByEmail(connectEmail, connectPassword);
      await updateSettings({
        xrplUserId: result.user_id,
        xrplWalletId: result.wallet_id,
        xrplAddress: result.xrpl_address,
      });
      Alert.alert(
        isEn ? 'Connected' : '연결 완료',
        isEn ? `Wallet connected!\nAddress: ${result.xrpl_address}` : `지갑이 연결되었습니다!\n주소: ${result.xrpl_address}`,
      );
    } catch (e: any) {
      Alert.alert(isEn ? 'Error' : '오류', e.message ?? (isEn ? 'Wallet not found' : '지갑을 찾을 수 없습니다'));
    } finally {
      setConnectingWallet(false);
    }
  };

  const handleDisconnect = async () => {
    const doDisconnect = async () => {
      await updateSettings({ xrplUserId: undefined, xrplWalletId: undefined, xrplAddress: undefined });
      setWallet(null);
      setTransactions([]);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(isEn ? 'Disconnect this wallet?' : '지갑 연결을 해제하시겠습니까?')) await doDisconnect();
    } else {
      Alert.alert(
        isEn ? 'Disconnect Wallet' : '지갑 연결 해제',
        isEn ? 'Disconnect this wallet?' : '지갑 연결을 해제하시겠습니까?',
        [
          { text: isEn ? 'Cancel' : '취소', style: 'cancel' },
          { text: isEn ? 'Disconnect' : '해제', style: 'destructive', onPress: doDisconnect },
        ],
      );
    }
  };

  const handleCharge = async () => {
    if (!walletId) return;
    if (!senderSeed || !chargeAmount) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Please enter sender seed and amount' : '발신자 Seed와 금액을 입력해주세요');
      return;
    }
    setCharging(true);
    try {
      await api.charge({ recipientWalletId: walletId, senderSeed, amount: chargeAmount, currency: chargeCurrency });
      Alert.alert(isEn ? 'Success' : '성공', isEn ? `${chargeAmount} ${chargeCurrency} charge completed` : `${chargeAmount} ${chargeCurrency} 충전이 완료되었습니다`);
      setSenderSeed('');
      setChargeAmount('');
      await fetchWallet();
    } catch (e: any) {
      Alert.alert(isEn ? 'Error' : '오류', e.message ?? (isEn ? 'Charge failed' : '충전 실패'));
    } finally {
      setCharging(false);
    }
  };

  const handleExchange = async () => {
    if (!walletId) return;
    if (!exchangeAmount) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Please enter exchange amount' : '환전 금액을 입력해주세요');
      return;
    }
    if (fromCurrency === toCurrency) {
      Alert.alert(isEn ? 'Error' : '오류', isEn ? 'Cannot exchange to the same currency' : '동일한 통화로는 환전할 수 없습니다');
      return;
    }
    setExchanging(true);
    try {
      const result = await api.exchange({ walletId, fromCurrency, toCurrency, fromMax: exchangeAmount });
      const received = result.exchanged_amount;
      const rate = result.rate ? (isEn ? ` (Rate: ${result.rate})` : ` (환율: ${result.rate})`) : '';
      Alert.alert(isEn ? 'Success' : '성공', `${exchangeAmount} ${fromCurrency} → ${received} ${toCurrency}${rate}`);
      setExchangeAmount('');
      await fetchWallet();
    } catch (e: any) {
      Alert.alert(isEn ? 'Error' : '오류', e.message ?? (isEn ? 'Exchange failed' : '환전 실패'));
    } finally {
      setExchanging(false);
    }
  };

  const CURRENCIES = ['XRP', 'USD', 'EUR', 'KRW'];

  // ── 지갑 미연결 화면 ──────────────────────────────────────────────────────
  if (!walletId) {
    return (
      <ScreenContainer className="p-4">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View className="gap-2 mb-6">
            <Text className="text-3xl font-bold text-foreground">{isEn ? 'XRPL Wallet' : 'XRPL 지갑'}</Text>
            <Text className="text-sm text-muted">{isEn ? 'Connect or create your wallet to get started.' : '지갑을 생성하거나 기존 지갑을 연결하세요.'}</Text>
          </View>

          <View className="gap-4 p-4 bg-surface rounded-lg border border-border">
            {/* 모드 토글 */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setConnectMode('create')}
                className={`flex-1 p-2 rounded-lg border-2 ${connectMode === 'create' ? 'bg-primary border-primary' : 'bg-background border-border'}`}
              >
                <Text className={`text-center text-sm font-semibold ${connectMode === 'create' ? 'text-background' : 'text-foreground'}`}>
                  {isEn ? 'New Wallet' : '새 지갑 생성'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConnectMode('connect')}
                className={`flex-1 p-2 rounded-lg border-2 ${connectMode === 'connect' ? 'bg-primary border-primary' : 'bg-background border-border'}`}
              >
                <Text className={`text-center text-sm font-semibold ${connectMode === 'connect' ? 'text-background' : 'text-foreground'}`}>
                  {isEn ? 'Connect Existing' : '기존 지갑 연결'}
                </Text>
              </TouchableOpacity>
            </View>

            {connectMode === 'create' ? (
              <View className="gap-3">
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted">{isEn ? 'Name' : '이름'}</Text>
                  <TextInput
                    value={userName}
                    onChangeText={setUserName}
                    placeholder={isEn ? 'John Doe' : '홍길동'}
                    className="p-3 bg-background border border-border rounded-lg text-foreground"
                    placeholderTextColor="#9BA1A6"
                  />
                </View>
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted">{isEn ? 'Email' : '이메일'}</Text>
                  <TextInput
                    value={userEmail}
                    onChangeText={setUserEmail}
                    placeholder="example@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="p-3 bg-background border border-border rounded-lg text-foreground"
                    placeholderTextColor="#9BA1A6"
                  />
                </View>
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted">{isEn ? 'Password' : '비밀번호'}</Text>
                  <TextInput
                    value={userPassword}
                    onChangeText={setUserPassword}
                    placeholder={isEn ? 'Min 6 characters' : '6자 이상'}
                    secureTextEntry
                    className="p-3 bg-background border border-border rounded-lg text-foreground"
                    placeholderTextColor="#9BA1A6"
                  />
                </View>
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted">{isEn ? 'Phone (optional)' : '전화번호 (선택)'}</Text>
                  <TextInput
                    value={userPhone}
                    onChangeText={setUserPhone}
                    placeholder="010-0000-0000"
                    keyboardType="phone-pad"
                    className="p-3 bg-background border border-border rounded-lg text-foreground"
                    placeholderTextColor="#9BA1A6"
                  />
                </View>
                <TouchableOpacity
                  onPress={handleCreateWallet}
                  disabled={creatingWallet}
                  className={`p-3 rounded-lg flex-row items-center justify-center gap-2 ${creatingWallet ? 'bg-muted' : 'bg-primary'}`}
                >
                  {creatingWallet && <ActivityIndicator size="small" color="#fff" />}
                  <Text className="text-center font-semibold text-background">
                    {isEn ? (creatingWallet ? 'Creating... (15~30s)' : 'Create XRPL Wallet') : (creatingWallet ? '생성 중... (15~30초)' : 'XRPL 지갑 생성')}
                  </Text>
                </TouchableOpacity>
                <Text className="text-xs text-muted">
                  {isEn ? 'Creates an XRPL Testnet wallet funded via faucet.' : 'Testnet Faucet으로 XRP가 충전된 지갑이 생성됩니다.'}
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted">{isEn ? 'Registered Email' : '가입한 이메일'}</Text>
                  <TextInput
                    value={connectEmail}
                    onChangeText={setConnectEmail}
                    placeholder="example@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="p-3 bg-background border border-border rounded-lg text-foreground"
                    placeholderTextColor="#9BA1A6"
                  />
                </View>
                <View className="gap-2">
                  <Text className="text-sm font-medium text-muted">{isEn ? 'Password' : '비밀번호'}</Text>
                  <TextInput
                    value={connectPassword}
                    onChangeText={setConnectPassword}
                    placeholder={isEn ? 'Enter your password' : '비밀번호 입력'}
                    secureTextEntry
                    className="p-3 bg-background border border-border rounded-lg text-foreground"
                    placeholderTextColor="#9BA1A6"
                  />
                </View>
                <TouchableOpacity
                  onPress={handleConnectWallet}
                  disabled={connectingWallet}
                  className={`p-3 rounded-lg flex-row items-center justify-center gap-2 ${connectingWallet ? 'bg-muted' : 'bg-primary'}`}
                >
                  {connectingWallet && <ActivityIndicator size="small" color="#fff" />}
                  <Text className="text-center font-semibold text-background">
                    {isEn ? (connectingWallet ? 'Connecting...' : 'Connect Wallet') : (connectingWallet ? '연결 중...' : '지갑 연결하기')}
                  </Text>
                </TouchableOpacity>
                <Text className="text-xs text-muted">
                  {isEn ? 'Reconnect using the email and password you registered before.' : '이전에 등록한 이메일과 비밀번호로 기존 지갑을 다시 연결합니다.'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── 지갑 연결된 화면 ──────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: 'balance', label: isEn ? 'Balance' : '잔액' },
    { key: 'charge', label: isEn ? 'Charge' : '충전' },
    { key: 'exchange', label: isEn ? 'Exchange' : '환전' },
    { key: 'history', label: isEn ? 'History' : '내역' },
  ];

  return (
    <ScreenContainer className="p-4">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 헤더 */}
        <View className="flex-row items-start justify-between mb-4">
          <View className="gap-1 flex-1 mr-3">
            <Text className="text-3xl font-bold text-foreground">{isEn ? 'XRPL Wallet' : 'XRPL 지갑'}</Text>
            <Text className="text-xs text-muted font-mono" numberOfLines={1} ellipsizeMode="middle">
              {settings.xrplAddress}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDisconnect}
            className="mt-1 px-3 py-1.5 rounded-lg border border-border"
          >
            <Text className="text-xs text-muted">{isEn ? 'Disconnect' : '연결 해제'}</Text>
          </TouchableOpacity>
        </View>

        {/* 탭 */}
        <View className="flex-row gap-2 mb-4">
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => handleTabChange(tab.key)}
              className={`flex-1 py-2 rounded-lg border ${
                activeTab === tab.key ? 'bg-primary border-primary' : 'bg-surface border-border'
              }`}
            >
              <Text className={`text-center text-sm font-semibold ${activeTab === tab.key ? 'text-background' : 'text-foreground'}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 잔액 탭 */}
        {activeTab === 'balance' && (
          <View className="gap-3">
            {!wallet ? (
              <View className="items-center py-8 gap-3">
                <Text className="text-muted text-sm">{isEn ? 'Pull to refresh or tap the button below' : '당겨서 새로고침하거나 아래 버튼을 누르세요'}</Text>
                <TouchableOpacity onPress={fetchWallet} className="px-5 py-2 bg-primary rounded-lg">
                  <Text className="text-background font-semibold">{isEn ? 'Check balance' : '잔액 조회'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View className="p-4 bg-surface rounded-lg border border-border gap-3">
                  <Text className="text-sm font-semibold text-muted">{isEn ? 'Assets' : '보유 자산'}</Text>
                  {wallet.balances.length === 0 ? (
                    <Text className="text-muted text-sm">{isEn ? 'No assets' : '보유 자산 없음'}</Text>
                  ) : (
                    wallet.balances.map((b, i) => (
                      <View key={i} className="flex-row justify-between items-center py-2 border-b border-border last:border-0">
                        <Text className="text-base font-semibold text-foreground">{b.currency}</Text>
                        <Text className="text-base text-foreground">{Number(b.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}</Text>
                      </View>
                    ))
                  )}
                </View>
                <TouchableOpacity onPress={fetchWallet} className="py-2 items-center">
                  <Text className="text-primary text-sm">{isEn ? 'Refresh' : '새로고침'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* 충전 탭 */}
        {activeTab === 'charge' && (
          <View className="gap-4 p-4 bg-surface rounded-lg border border-border">
            <Text className="text-base font-semibold text-foreground">{isEn ? 'Living fund charge' : '생활비 충전'}</Text>
            <Text className="text-xs text-muted">{isEn ? 'Enter parent wallet seed to transfer funds to your wallet.' : '부모님 지갑 Seed를 입력하면 내 지갑으로 자금을 전송합니다.'}</Text>
            <View className="gap-2">
              <Text className="text-sm font-medium text-muted">{isEn ? 'Sender seed (parent)' : '발신자 Seed (부모님)'}</Text>
              <TextInput
                value={senderSeed}
                onChangeText={setSenderSeed}
                placeholder="sEdtXXXXXXXXXXXXXXXX"
                secureTextEntry
                autoCapitalize="none"
                className="p-3 bg-background border border-border rounded-lg text-foreground"
                placeholderTextColor="#9BA1A6"
              />
            </View>
            <View className="gap-2">
              <Text className="text-sm font-medium text-muted">{isEn ? 'Amount' : '금액'}</Text>
              <TextInput
                value={chargeAmount}
                onChangeText={setChargeAmount}
                placeholder="100"
                keyboardType="decimal-pad"
                className="p-3 bg-background border border-border rounded-lg text-foreground"
                placeholderTextColor="#9BA1A6"
              />
            </View>
            <View className="gap-2">
              <Text className="text-sm font-medium text-muted">{isEn ? 'Currency' : '통화'}</Text>
              <View className="flex-row gap-2">
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setChargeCurrency(c)}
                    className={`flex-1 py-2 rounded-lg border ${chargeCurrency === c ? 'bg-primary border-primary' : 'bg-background border-border'}`}
                  >
                    <Text className={`text-center text-sm font-semibold ${chargeCurrency === c ? 'text-background' : 'text-foreground'}`}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleCharge}
              disabled={charging}
              className={`p-3 rounded-lg flex-row items-center justify-center gap-2 ${charging ? 'bg-muted' : 'bg-primary'}`}
            >
              {charging && <ActivityIndicator size="small" color="#fff" />}
              <Text className="text-center font-semibold text-background">
                {charging ? (isEn ? 'Processing...' : '처리 중...') : (isEn ? 'Charge' : '충전하기')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 환전 탭 */}
        {activeTab === 'exchange' && (
          <View className="gap-4 p-4 bg-surface rounded-lg border border-border">
            <Text className="text-base font-semibold text-foreground">{isEn ? 'DEX Exchange' : 'DEX 환전'}</Text>
            <Text className="text-xs text-muted">{isEn ? 'Automatically exchange via XRPL built-in DEX at the best available rate.' : 'XRPL 내장 DEX를 통해 자동으로 최적 환율로 환전합니다.'}</Text>
            <View className="gap-2">
              <Text className="text-sm font-medium text-muted">{isEn ? 'From currency' : '보낼 통화'}</Text>
              <View className="flex-row gap-2">
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setFromCurrency(c)}
                    className={`flex-1 py-2 rounded-lg border ${fromCurrency === c ? 'bg-primary border-primary' : 'bg-background border-border'}`}
                  >
                    <Text className={`text-center text-sm font-semibold ${fromCurrency === c ? 'text-background' : 'text-foreground'}`}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View className="gap-2">
              <Text className="text-sm font-medium text-muted">{isEn ? 'To currency' : '받을 통화'}</Text>
              <View className="flex-row gap-2">
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setToCurrency(c)}
                    className={`flex-1 py-2 rounded-lg border ${toCurrency === c ? 'bg-primary border-primary' : 'bg-background border-border'}`}
                  >
                    <Text className={`text-center text-sm font-semibold ${toCurrency === c ? 'text-background' : 'text-foreground'}`}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View className="gap-2">
              <Text className="text-sm font-medium text-muted">{isEn ? `Amount to send (${fromCurrency})` : `보낼 금액 (${fromCurrency})`}</Text>
              <TextInput
                value={exchangeAmount}
                onChangeText={setExchangeAmount}
                placeholder="10"
                keyboardType="decimal-pad"
                className="p-3 bg-background border border-border rounded-lg text-foreground"
                placeholderTextColor="#9BA1A6"
              />
            </View>
            <TouchableOpacity
              onPress={handleExchange}
              disabled={exchanging}
              className={`p-3 rounded-lg flex-row items-center justify-center gap-2 ${exchanging ? 'bg-muted' : 'bg-primary'}`}
            >
              {exchanging && <ActivityIndicator size="small" color="#fff" />}
              <Text className="text-center font-semibold text-background">
                {exchanging ? (isEn ? 'Exchanging...' : '환전 중...') : (isEn ? `${fromCurrency} → ${toCurrency} Exchange` : `${fromCurrency} → ${toCurrency} 환전`)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 내역 탭 */}
        {activeTab === 'history' && (
          <View className="gap-3">
            {transactions.length === 0 ? (
              <View className="items-center py-8 gap-3">
                <Text className="text-muted text-sm">{isEn ? 'No transaction history' : '거래 내역이 없습니다'}</Text>
                <TouchableOpacity onPress={fetchTransactions} className="px-5 py-2 bg-primary rounded-lg">
                  <Text className="text-background font-semibold">{isEn ? 'Load history' : '내역 조회'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              transactions.map((tx) => (
                <View key={tx.id} className="p-3 bg-surface rounded-lg border border-border gap-1">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-foreground capitalize">{tx.tx_type}</Text>
                    <Text className={`text-sm font-bold ${tx.status === 'success' ? 'text-success' : 'text-destructive'}`}>
                      {tx.amount} {tx.currency}
                    </Text>
                  </View>
                  {tx.memo && <Text className="text-xs text-muted" numberOfLines={1}>{tx.memo}</Text>}
                  <Text className="text-xs text-muted">{new Date(tx.created_at).toLocaleString('ko-KR')}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
