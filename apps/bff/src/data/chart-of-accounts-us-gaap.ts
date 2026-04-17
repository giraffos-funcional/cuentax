/**
 * CUENTAX — US GAAP Chart of Accounts Template
 * ===============================================
 * Standard small-business chart of accounts following US GAAP.
 * Used to seed Odoo account.account when creating a US company.
 *
 * account_type values map to Odoo 18 account types:
 * https://www.odoo.com/documentation/18.0/applications/finance/accounting.html
 */

export interface AccountTemplate {
  code: string
  name: string
  account_type: string
  reconcile: boolean
}

export const US_GAAP_CHART: AccountTemplate[] = [
  // ═══════════════════════════════════════════════════════════
  // 1000-1999: ASSETS
  // ═══════════════════════════════════════════════════════════
  { code: '1000', name: 'Checking Account', account_type: 'asset_cash', reconcile: true },
  { code: '1010', name: 'Savings Account', account_type: 'asset_cash', reconcile: true },
  { code: '1020', name: 'Petty Cash', account_type: 'asset_cash', reconcile: false },
  { code: '1100', name: 'Accounts Receivable', account_type: 'asset_receivable', reconcile: true },
  { code: '1200', name: 'Inventory', account_type: 'asset_current', reconcile: false },
  { code: '1300', name: 'Prepaid Expenses', account_type: 'asset_prepayments', reconcile: false },
  { code: '1310', name: 'Prepaid Insurance', account_type: 'asset_prepayments', reconcile: false },
  { code: '1320', name: 'Prepaid Rent', account_type: 'asset_prepayments', reconcile: false },
  { code: '1400', name: 'Other Current Assets', account_type: 'asset_current', reconcile: false },
  { code: '1500', name: 'Furniture & Equipment', account_type: 'asset_fixed', reconcile: false },
  { code: '1510', name: 'Vehicles', account_type: 'asset_fixed', reconcile: false },
  { code: '1520', name: 'Leasehold Improvements', account_type: 'asset_fixed', reconcile: false },
  { code: '1600', name: 'Accumulated Depreciation', account_type: 'asset_fixed', reconcile: false },
  { code: '1700', name: 'Security Deposits', account_type: 'asset_non_current', reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 2000-2999: LIABILITIES
  // ═══════════════════════════════════════════════════════════
  { code: '2000', name: 'Accounts Payable', account_type: 'liability_payable', reconcile: true },
  { code: '2100', name: 'Credit Card Payable', account_type: 'liability_credit_card', reconcile: true },
  { code: '2200', name: 'Accrued Expenses', account_type: 'liability_current', reconcile: false },
  { code: '2210', name: 'Accrued Payroll', account_type: 'liability_current', reconcile: false },
  { code: '2220', name: 'Accrued Taxes', account_type: 'liability_current', reconcile: false },
  { code: '2300', name: 'Sales Tax Payable', account_type: 'liability_current', reconcile: false },
  { code: '2400', name: 'Payroll Liabilities', account_type: 'liability_current', reconcile: false },
  { code: '2410', name: 'Federal Tax Withholding', account_type: 'liability_current', reconcile: false },
  { code: '2420', name: 'State Tax Withholding', account_type: 'liability_current', reconcile: false },
  { code: '2430', name: 'Social Security Payable', account_type: 'liability_current', reconcile: false },
  { code: '2440', name: 'Medicare Payable', account_type: 'liability_current', reconcile: false },
  { code: '2500', name: 'Short-Term Loan', account_type: 'liability_current', reconcile: true },
  { code: '2600', name: 'Line of Credit', account_type: 'liability_current', reconcile: true },
  { code: '2700', name: 'Long-Term Loan', account_type: 'liability_non_current', reconcile: true },
  { code: '2800', name: 'Mortgage Payable', account_type: 'liability_non_current', reconcile: true },

  // ═══════════════════════════════════════════════════════════
  // 3000-3999: EQUITY
  // ═══════════════════════════════════════════════════════════
  { code: '3000', name: "Owner's Equity", account_type: 'equity', reconcile: false },
  { code: '3100', name: "Owner's Draw", account_type: 'equity', reconcile: false },
  { code: '3200', name: "Owner's Investment", account_type: 'equity', reconcile: false },
  { code: '3300', name: 'Retained Earnings', account_type: 'equity_unaffected', reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 4000-4999: REVENUE
  // ═══════════════════════════════════════════════════════════
  { code: '4000', name: 'Sales Revenue', account_type: 'income', reconcile: false },
  { code: '4100', name: 'Service Revenue', account_type: 'income', reconcile: false },
  { code: '4200', name: 'Other Income', account_type: 'income_other', reconcile: false },
  { code: '4300', name: 'Interest Income', account_type: 'income_other', reconcile: false },
  { code: '4400', name: 'Refunds & Returns', account_type: 'income', reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 5000-5999: COST OF GOODS SOLD
  // ═══════════════════════════════════════════════════════════
  { code: '5000', name: 'Cost of Goods Sold', account_type: 'expense_direct_cost', reconcile: false },
  { code: '5100', name: 'Materials & Supplies', account_type: 'expense_direct_cost', reconcile: false },
  { code: '5200', name: 'Direct Labor', account_type: 'expense_direct_cost', reconcile: false },
  { code: '5300', name: 'Shipping & Freight', account_type: 'expense_direct_cost', reconcile: false },
  { code: '5400', name: 'Subcontractor Costs', account_type: 'expense_direct_cost', reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 6000-6999: OPERATING EXPENSES
  // ═══════════════════════════════════════════════════════════
  { code: '6000', name: 'Advertising & Marketing', account_type: 'expense', reconcile: false },
  { code: '6050', name: 'Bank Fees & Charges', account_type: 'expense', reconcile: false },
  { code: '6100', name: 'Depreciation Expense', account_type: 'expense_depreciation', reconcile: false },
  { code: '6150', name: 'Dues & Subscriptions', account_type: 'expense', reconcile: false },
  { code: '6200', name: 'Insurance Expense', account_type: 'expense', reconcile: false },
  { code: '6250', name: 'Interest Expense', account_type: 'expense', reconcile: false },
  { code: '6300', name: 'Legal & Professional Fees', account_type: 'expense', reconcile: false },
  { code: '6350', name: 'Meals & Entertainment', account_type: 'expense', reconcile: false },
  { code: '6400', name: 'Office Supplies', account_type: 'expense', reconcile: false },
  { code: '6450', name: 'Payroll Expense', account_type: 'expense', reconcile: false },
  { code: '6460', name: 'Payroll Tax Expense', account_type: 'expense', reconcile: false },
  { code: '6470', name: 'Employee Benefits', account_type: 'expense', reconcile: false },
  { code: '6500', name: 'Rent Expense', account_type: 'expense', reconcile: false },
  { code: '6550', name: 'Repairs & Maintenance', account_type: 'expense', reconcile: false },
  { code: '6600', name: 'Software & SaaS', account_type: 'expense', reconcile: false },
  { code: '6650', name: 'Taxes & Licenses', account_type: 'expense', reconcile: false },
  { code: '6700', name: 'Telephone & Internet', account_type: 'expense', reconcile: false },
  { code: '6750', name: 'Travel Expense', account_type: 'expense', reconcile: false },
  { code: '6800', name: 'Utilities', account_type: 'expense', reconcile: false },
  { code: '6850', name: 'Vehicle Expense', account_type: 'expense', reconcile: false },
  { code: '6900', name: 'Miscellaneous Expense', account_type: 'expense', reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 7000-7999: OTHER INCOME / EXPENSE
  // ═══════════════════════════════════════════════════════════
  { code: '7000', name: 'Gain on Sale of Assets', account_type: 'income_other', reconcile: false },
  { code: '7100', name: 'Loss on Sale of Assets', account_type: 'expense', reconcile: false },
  { code: '7200', name: 'Other Expense', account_type: 'expense', reconcile: false },
]

/** Standard US journals to create alongside the chart */
export const US_JOURNALS = [
  { name: 'Sales', code: 'SAL', type: 'sale' },
  { name: 'Purchases', code: 'PUR', type: 'purchase' },
  { name: 'Bank', code: 'BNK', type: 'bank' },
  { name: 'Cash', code: 'CSH', type: 'cash' },
  { name: 'Miscellaneous', code: 'MISC', type: 'general' },
]
