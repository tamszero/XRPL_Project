import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { SAVED_TRANSACTIONS_STORAGE_KEY, type SavedTransaction } from "@/hooks/useTransactionStorage";
import {
  CategoryId,
  Transaction,
  createTransaction,
  sampleTransactions,
  transactionFromSavedReceipt,
} from "@/lib/finance";
import { useRules } from "@/lib/rules-context";
import type { ReceiptAnalysisResult } from "@/types";

type FinanceContextValue = {
  transactions: Transaction[];
  addNotification: (text: string) => Transaction;
  updateCategory: (id: string, category: CategoryId) => void;
  /** 영수증 탭에서 저장한 건을 홈·분석·리포트 집계에 반영 */
  addReceiptTransaction: (saved: SavedTransaction) => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

function isReceiptPayload(data: unknown): data is ReceiptAnalysisResult {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.total_krw === "number" && Number.isFinite(d.total_krw);
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>(sampleTransactions);
  const { rules } = useRules();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVED_TRANSACTIONS_STORAGE_KEY);
        if (cancelled || !raw) return;
        const parsed: SavedTransaction[] = JSON.parse(raw);
        const seen = new Set<string>();
        const fromReceipts: Transaction[] = [];
        for (const tx of parsed) {
          if (tx.type !== "receipt" || !isReceiptPayload(tx.data)) continue;
          if (seen.has(tx.id)) continue;
          seen.add(tx.id);
          fromReceipts.push(transactionFromSavedReceipt(tx.id, tx.data, tx.savedAt, rules));
        }
        setTransactions((prev) => {
          const idSet = new Set(fromReceipts.map((t) => t.id));
          const rest = prev.filter((t) => !idSet.has(t.id));
          return [...fromReceipts, ...rest];
        });
      } catch (e) {
        console.error("Failed to merge saved receipts into finance:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rules]);

  const addReceiptTransaction = useCallback(
    (saved: SavedTransaction) => {
      if (saved.type !== "receipt" || !isReceiptPayload(saved.data)) return;
      const row = transactionFromSavedReceipt(saved.id, saved.data, saved.savedAt, rules);
      setTransactions((prev) => {
        if (prev.some((p) => p.id === row.id)) {
          return prev.map((p) => (p.id === row.id ? row : p));
        }
        return [row, ...prev];
      });
    },
    [rules],
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      transactions,
      addNotification: (text: string) => {
        const transaction = createTransaction(text, "notification", new Date().toISOString().slice(0, 10), rules);
        setTransactions((current) => [transaction, ...current]);
        return transaction;
      },
      updateCategory: (id: string, category: CategoryId) => {
        setTransactions((current) => current.map((item) => (item.id === id ? { ...item, category, confidence: 1 } : item)));
      },
      addReceiptTransaction,
    }),
    [transactions, rules, addReceiptTransaction],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error("useFinance must be used within FinanceProvider");
  }
  return context;
}
