import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  readPersistedTransactions,
  writePersistedTransactions,
  type SavedTransaction,
} from "@/hooks/useTransactionStorage";
import {
  CategoryId,
  Transaction,
  applyEditsToReceiptData,
  createTransaction,
  sampleTransactions,
  transactionFromSavedReceipt,
} from "@/lib/finance";
import { useRules } from "@/lib/rules-context";
import type { ReceiptAnalysisResult } from "@/types";

export type FinanceTransactionEdit = {
  merchant?: string;
  amount?: number;
  currency?: string;
  category?: CategoryId;
  date?: string;
};

type FinanceContextValue = {
  transactions: Transaction[];
  addNotification: (text: string) => Transaction;
  updateCategory: (id: string, category: CategoryId) => void;
  addReceiptTransaction: (saved: SavedTransaction) => void;
  updateTransaction: (id: string, fields: FinanceTransactionEdit) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
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
        const parsed = await readPersistedTransactions();
        if (cancelled) return;
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

  const updateTransaction = useCallback(
    async (id: string, fields: FinanceTransactionEdit) => {
      const tx = transactions.find((t) => t.id === id);
      if (!tx) return;

      if (tx.source === "receipt") {
        const existing = await readPersistedTransactions();
        const saved = existing.find((s) => s.id === id);
        if (!saved || saved.type !== "receipt" || !isReceiptPayload(saved.data)) {
          throw new Error("RECEIPT_NOT_IN_STORAGE");
        }

        const merchant = fields.merchant ?? tx.merchant;
        const amountKrw = fields.amount !== undefined ? fields.amount : tx.amount;
        const category = fields.category ?? tx.category;
        const date = (fields.date ?? tx.date).slice(0, 10);

        const newData = applyEditsToReceiptData(saved.data, merchant, amountKrw, category, date);
        const nextList = existing.map((s) => (s.id === id ? { ...saved, data: newData } : s));
        await writePersistedTransactions(nextList);

        const newRow = transactionFromSavedReceipt(id, newData, saved.savedAt, rules);
        setTransactions((prev) => prev.map((t) => (t.id === id ? newRow : t)));
        return;
      }

      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next: Transaction = {
            ...t,
            merchant: fields.merchant ?? t.merchant,
            amount: fields.amount !== undefined ? fields.amount : t.amount,
            currency: fields.currency ?? t.currency,
            category: fields.category !== undefined ? fields.category : t.category,
            date: (fields.date ?? t.date).slice(0, 10),
            confidence: 1,
          };
          if (fields.merchant !== undefined || fields.amount !== undefined || fields.currency !== undefined) {
            next.rawText = `${next.merchant} ${next.amount} ${next.currency}`;
          }
          return next;
        }),
      );
    },
    [transactions, rules],
  );

  const deleteTransaction = useCallback(async (id: string) => {
    let wasReceipt = false;
    setTransactions((prev) => {
      const row = prev.find((t) => t.id === id);
      wasReceipt = row?.source === "receipt";
      return prev.filter((t) => t.id !== id);
    });
    if (wasReceipt) {
      const existing = await readPersistedTransactions();
      await writePersistedTransactions(existing.filter((t) => t.id !== id));
    }
  }, []);

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
      updateTransaction,
      deleteTransaction,
    }),
    [transactions, rules, addReceiptTransaction, updateTransaction, deleteTransaction],
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
