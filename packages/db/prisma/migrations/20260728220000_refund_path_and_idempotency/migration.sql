-- AlterEnum
ALTER TYPE "WalletEntryKind" ADD VALUE 'SALE_CLAWBACK';

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_entries_creditPurchaseId_kind_key" ON "credit_ledger_entries"("creditPurchaseId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_entries_topUpId_kind_key" ON "wallet_ledger_entries"("topUpId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_entries_relatedOrderId_kind_key" ON "wallet_ledger_entries"("relatedOrderId", "kind");

