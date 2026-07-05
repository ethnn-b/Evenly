// Shared types. These mirror the database tables (snake_case columns) plus a
// few view-model types the UI works with. Money is always integer cents.

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
}

export interface Expense {
  id: string;
  group_id: string;
  payer_id: string;
  description: string;
  amount_cents: number;
  created_by: string;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount_cents: number;
}

// A recorded payment that settles debt: from_user paid to_user this amount in
// a group. Folded into balances the same way an expense is (the payer is
// credited, the receiver debited), so it drives the balances back toward zero.
export interface Settlement {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount_cents: number;
  created_by: string;
  created_at: string;
}

// A single parsed line item from a receipt. price is in cents.
export interface ReceiptItem {
  name: string;
  price: number;
}

// What lib/ocr.ts returns after reading and parsing a receipt image.
export interface ReceiptParseResult {
  items: ReceiptItem[];
  total: number | null; // cents, or null if no total line was found
}

// One suggested payment from the settlement algorithm: `from` pays `to`.
export interface SettlementTransaction {
  from: string; // user id of the debtor
  to: string; // user id of the creditor
  amount_cents: number;
}

// A member's net position in a group. Positive = they are owed money,
// negative = they owe money, zero = settled.
export interface MemberBalance {
  user_id: string;
  net_cents: number;
}

// View-model joining a member row with their profile, used by the UI.
export interface MemberWithProfile {
  user_id: string;
  email: string;
  display_name: string | null;
}
