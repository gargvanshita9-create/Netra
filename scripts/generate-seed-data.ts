/**
 * Generates the retail-banking seed dataset for db/init/02-schema.sql.
 *
 * Deterministic (fixed faker seed) so the seed file is reproducible and
 * diffable. Run with `pnpm seed:generate`; output is committed to
 * db/seed/03-seed-data.sql and picked up automatically by
 * `docker compose up` (mounted into /docker-entrypoint-initdb.d).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { faker } from '@faker-js/faker';

faker.seed(42);

// Run via `pnpm seed:generate` from the repo root.
const OUTPUT_PATH = join(process.cwd(), 'db', 'seed', '03-seed-data.sql');

const EMPLOYEES_PER_BRANCH = [4, 10] as const;
const CUSTOMER_COUNT = 3000;
const ACCOUNTS_PER_CUSTOMER = [1, 2] as const;
const CARD_RATE = 0.6; // fraction of accounts that get a card
const LOAN_COUNT = 800;
const PAYMENTS_PER_LOAN = [4, 20] as const;
const TRANSACTIONS_PER_ACCOUNT = [2, 8] as const; // spread across ~2 years, target ~20k total

const CITIES: Array<{ city: string; state: string; region: string }> = [
  { city: 'Delhi', state: 'Delhi', region: 'North' },
  { city: 'Chandigarh', state: 'Punjab', region: 'North' },
  { city: 'Jaipur', state: 'Rajasthan', region: 'North' },
  { city: 'Lucknow', state: 'Uttar Pradesh', region: 'North' },
  { city: 'Mumbai', state: 'Maharashtra', region: 'West' },
  { city: 'Pune', state: 'Maharashtra', region: 'West' },
  { city: 'Ahmedabad', state: 'Gujarat', region: 'West' },
  { city: 'Surat', state: 'Gujarat', region: 'West' },
  { city: 'Bengaluru', state: 'Karnataka', region: 'South' },
  { city: 'Chennai', state: 'Tamil Nadu', region: 'South' },
  { city: 'Hyderabad', state: 'Telangana', region: 'South' },
  { city: 'Kochi', state: 'Kerala', region: 'South' },
  { city: 'Coimbatore', state: 'Tamil Nadu', region: 'South' },
  { city: 'Kolkata', state: 'West Bengal', region: 'East' },
  { city: 'Patna', state: 'Bihar', region: 'East' },
  { city: 'Guwahati', state: 'Assam', region: 'East' },
  { city: 'Bhopal', state: 'Madhya Pradesh', region: 'Central' },
  { city: 'Indore', state: 'Madhya Pradesh', region: 'Central' },
  { city: 'Nagpur', state: 'Maharashtra', region: 'Central' },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', region: 'South' },
];

interface Product {
  id: number;
  code: string;
  name: string;
  category: string;
  interestRate: number | null;
}

const PRODUCTS: Product[] = [
  { id: 1, code: 'SAV-STD', name: 'Standard Savings', category: 'savings', interestRate: 3.5 },
  { id: 2, code: 'SAV-PLUS', name: 'Savings Plus', category: 'savings', interestRate: 4.0 },
  { id: 3, code: 'CUR-BIZ', name: 'Business Current Account', category: 'current', interestRate: 0.0 },
  { id: 4, code: 'FD-12M', name: 'Fixed Deposit 12M', category: 'fixed_deposit', interestRate: 6.5 },
  { id: 5, code: 'FD-24M', name: 'Fixed Deposit 24M', category: 'fixed_deposit', interestRate: 7.0 },
  { id: 6, code: 'LOAN-PERSONAL', name: 'Personal Loan', category: 'personal_loan', interestRate: 11.5 },
  { id: 7, code: 'LOAN-HOME', name: 'Home Loan', category: 'home_loan', interestRate: 8.75 },
  { id: 8, code: 'CARD-CREDIT', name: 'Rewards Credit Card', category: 'credit_card', interestRate: 24.0 },
];

const ACCOUNT_PRODUCTS = PRODUCTS.filter((p) =>
  ['savings', 'current', 'fixed_deposit'].includes(p.category),
);
const LOAN_PRODUCTS = PRODUCTS.filter((p) =>
  ['personal_loan', 'home_loan'].includes(p.category),
);

function sqlStr(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNum(value: number | null): string {
  return value === null ? 'NULL' : String(value);
}

function sqlBool(value: boolean): string {
  return value ? 'true' : 'false';
}

function sqlDate(date: Date): string {
  return sqlStr(date.toISOString().slice(0, 10));
}

function sqlTimestamp(date: Date): string {
  return sqlStr(date.toISOString());
}

function randInt(min: number, max: number): number {
  return Math.floor(faker.number.float({ min, max: max + 1 }));
}

function pick<T>(arr: readonly T[]): T {
  return faker.helpers.arrayElement(arr as T[]);
}

const lines: string[] = [];
function insertBatch(table: string, columns: string[], rows: string[][]): void {
  if (rows.length === 0) return;
  const values = rows.map((r) => `  (${r.join(', ')})`).join(',\n');
  lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values};\n`);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- branches ----------
const branches = CITIES.map((c, i) => ({
  id: i + 1,
  branchCode: `BR${String(i + 1).padStart(3, '0')}`,
  ...c,
  openedDate: faker.date.between({ from: '2005-01-01', to: '2018-01-01' }),
}));
for (const batch of chunk(branches, 500)) {
  insertBatch(
    'branches',
    ['id', 'branch_code', 'name', 'city', 'state', 'region', 'opened_date'],
    batch.map((b) => [
      String(b.id),
      sqlStr(b.branchCode),
      sqlStr(`${b.city} Main Branch`),
      sqlStr(b.city),
      sqlStr(b.state),
      sqlStr(b.region),
      sqlDate(b.openedDate),
    ]),
  );
}

// ---------- employees ----------
interface Employee {
  id: number;
  branchId: number;
}
const employees: Employee[] = [];
let employeeId = 1;
const ROLES = ['Teller', 'Relationship Manager', 'Branch Manager', 'Loan Officer', 'Customer Service'];
for (const branch of branches) {
  const count = randInt(...EMPLOYEES_PER_BRANCH);
  for (let i = 0; i < count; i++) {
    employees.push({ id: employeeId++, branchId: branch.id });
  }
}
for (const batch of chunk(employees, 500)) {
  insertBatch(
    'employees',
    ['id', 'branch_id', 'first_name', 'last_name', 'role', 'hire_date'],
    batch.map((e) => [
      String(e.id),
      String(e.branchId),
      sqlStr(faker.person.firstName()),
      sqlStr(faker.person.lastName()),
      sqlStr(pick(ROLES)),
      sqlDate(faker.date.between({ from: '2010-01-01', to: '2025-01-01' })),
    ]),
  );
}

// ---------- customers ----------
interface Customer {
  id: number;
  city: string;
  state: string;
}
const customers: Customer[] = [];
const SEGMENTS = ['retail', 'retail', 'retail', 'premium', 'business'];
for (let i = 1; i <= CUSTOMER_COUNT; i++) {
  const loc = pick(CITIES);
  customers.push({ id: i, city: loc.city, state: loc.state });
}
for (const batch of chunk(customers, 500)) {
  insertBatch(
    'customers',
    [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'date_of_birth',
      'segment',
      'city',
      'state',
      'kyc_verified',
      'created_at',
    ],
    batch.map((c) => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      return [
        String(c.id),
        sqlStr(firstName),
        sqlStr(lastName),
        sqlStr(`${firstName.toLowerCase()}.${lastName.toLowerCase()}.${c.id}@example.com`),
        sqlStr(`+91${faker.string.numeric(10)}`),
        sqlDate(faker.date.birthdate({ min: 21, max: 70, mode: 'age' })),
        sqlStr(pick(SEGMENTS)),
        sqlStr(c.city),
        sqlStr(c.state),
        sqlBool(faker.datatype.boolean(0.95)),
        sqlTimestamp(faker.date.between({ from: '2015-01-01', to: '2025-06-01' })),
      ];
    }),
  );
}

// ---------- products ----------
insertBatch(
  'products',
  ['id', 'code', 'name', 'category', 'interest_rate'],
  PRODUCTS.map((p) => [
    String(p.id),
    sqlStr(p.code),
    sqlStr(p.name),
    sqlStr(p.category),
    sqlNum(p.interestRate),
  ]),
);

// ---------- accounts ----------
interface Account {
  id: number;
  customerId: number;
  branchId: number;
  productId: number;
  accountType: string;
  openedDate: Date;
  balance: number;
}
const accounts: Account[] = [];
let accountId = 1;
for (const customer of customers) {
  const numAccounts = randInt(...ACCOUNTS_PER_CUSTOMER);
  for (let i = 0; i < numAccounts; i++) {
    const product = pick(ACCOUNT_PRODUCTS);
    const branch = pick(branches);
    accounts.push({
      id: accountId++,
      customerId: customer.id,
      branchId: branch.id,
      productId: product.id,
      accountType: product.category,
      openedDate: faker.date.between({ from: '2016-01-01', to: '2025-01-01' }),
      balance: faker.number.float({ min: 500, max: 500_000, fractionDigits: 2 }),
    });
  }
}
for (const batch of chunk(accounts, 500)) {
  insertBatch(
    'accounts',
    [
      'id',
      'account_number',
      'customer_id',
      'branch_id',
      'product_id',
      'account_type',
      'status',
      'opened_date',
      'balance',
    ],
    batch.map((a) => [
      String(a.id),
      sqlStr(`AC${String(a.id).padStart(9, '0')}`),
      String(a.customerId),
      String(a.branchId),
      String(a.productId),
      sqlStr(a.accountType),
      sqlStr(faker.datatype.boolean(0.92) ? 'active' : faker.datatype.boolean() ? 'dormant' : 'closed'),
      sqlDate(a.openedDate),
      sqlNum(a.balance),
    ]),
  );
}

// ---------- cards ----------
interface Card {
  id: number;
  accountId: number;
  cardType: string;
  issuedDate: Date;
}
const cards: Card[] = [];
let cardId = 1;
for (const account of accounts) {
  if (faker.datatype.boolean(CARD_RATE) && account.accountType !== 'fixed_deposit') {
    const cardType = account.accountType === 'current' ? 'debit' : pick(['debit', 'credit']);
    const issuedDate = faker.date.between({ from: account.openedDate, to: '2025-06-01' });
    cards.push({ id: cardId++, accountId: account.id, cardType, issuedDate });
  }
}
for (const batch of chunk(cards, 500)) {
  insertBatch(
    'cards',
    ['id', 'account_id', 'card_number_masked', 'card_type', 'issued_date', 'expiry_date', 'status', 'credit_limit'],
    batch.map((c) => {
      const expiry = new Date(c.issuedDate);
      expiry.setFullYear(expiry.getFullYear() + 4);
      return [
        String(c.id),
        String(c.accountId),
        sqlStr(`**** **** **** ${faker.string.numeric(4)}`),
        sqlStr(c.cardType),
        sqlDate(c.issuedDate),
        sqlDate(expiry),
        sqlStr(faker.datatype.boolean(0.9) ? 'active' : 'blocked'),
        sqlNum(c.cardType === 'credit' ? faker.number.int({ min: 20_000, max: 500_000 }) : null),
      ];
    }),
  );
}

// ---------- loans ----------
interface Loan {
  id: number;
  customerId: number;
  disbursedDate: Date;
  termMonths: number;
  status: string;
}
const loans: Loan[] = [];
const loanCustomers = faker.helpers.arrayElements(customers, LOAN_COUNT);
const loanRows: string[][] = [];
for (let i = 0; i < loanCustomers.length; i++) {
  const customer = loanCustomers[i];
  if (!customer) continue;
  const product = pick(LOAN_PRODUCTS);
  const branch = pick(branches);
  const disbursedDate = faker.date.between({ from: '2015-01-01', to: '2024-06-01' });
  const termMonths = product.category === 'home_loan' ? pick([120, 180, 240]) : pick([12, 24, 36, 60]);
  const status = pick(['active', 'active', 'active', 'closed', 'default']);
  const principal = faker.number.float({ min: 50_000, max: 3_000_000, fractionDigits: 2 });
  const id = i + 1;
  loans.push({ id, customerId: customer.id, disbursedDate, termMonths, status });
  loanRows.push([
    String(id),
    String(customer.id),
    String(branch.id),
    String(product.id),
    sqlNum(principal),
    sqlNum(product.interestRate),
    String(termMonths),
    sqlStr(status),
    sqlDate(disbursedDate),
  ]);
}
for (const batch of chunk(loanRows, 500)) {
  insertBatch(
    'loans',
    [
      'id',
      'customer_id',
      'branch_id',
      'product_id',
      'principal_amount',
      'interest_rate',
      'term_months',
      'status',
      'disbursed_date',
    ],
    batch,
  );
}

// ---------- loan_payments ----------
const loanPaymentRows: string[][] = [];
let paymentId = 1;
for (const loan of loans) {
  const numPayments = randInt(...PAYMENTS_PER_LOAN);
  for (let i = 0; i < numPayments; i++) {
    const paymentDate = new Date(loan.disbursedDate);
    paymentDate.setMonth(paymentDate.getMonth() + i + 1);
    if (paymentDate > new Date('2026-08-20')) break;
    const amount = faker.number.float({ min: 2000, max: 60_000, fractionDigits: 2 });
    const interestComponent = faker.number.float({ min: 100, max: amount * 0.4, fractionDigits: 2 });
    const principalComponent = Math.round((amount - interestComponent) * 100) / 100;
    const status = pick(['on_time', 'on_time', 'on_time', 'on_time', 'late', 'missed']);
    loanPaymentRows.push([
      String(paymentId++),
      String(loan.id),
      sqlDate(paymentDate),
      sqlNum(amount),
      sqlNum(principalComponent),
      sqlNum(interestComponent),
      sqlStr(status),
    ]);
  }
}
for (const batch of chunk(loanPaymentRows, 500)) {
  insertBatch(
    'loan_payments',
    ['id', 'loan_id', 'payment_date', 'amount', 'principal_component', 'interest_component', 'status'],
    batch,
  );
}

// ---------- transactions (fact table) ----------
const TXN_TYPES = ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee', 'interest'];
const CHANNELS = ['branch', 'atm', 'online', 'mobile', 'upi'];
const transactionRows: string[][] = [];
let txnId = 1;
for (const account of accounts) {
  const numTxns = randInt(...TRANSACTIONS_PER_ACCOUNT);
  let runningBalance = account.balance;
  for (let i = 0; i < numTxns; i++) {
    const txnType = pick(TXN_TYPES);
    const isCredit = txnType === 'deposit' || txnType === 'transfer_in' || txnType === 'interest';
    const amount = faker.number.float({ min: 100, max: 75_000, fractionDigits: 2 });
    runningBalance = isCredit ? runningBalance + amount : runningBalance - amount;
    const txnDate = faker.date.between({ from: account.openedDate, to: '2025-06-01' });
    transactionRows.push([
      String(txnId++),
      String(account.id),
      sqlTimestamp(txnDate),
      sqlStr(txnType),
      sqlNum(isCredit ? amount : -amount),
      sqlNum(Math.round(runningBalance * 100) / 100),
      sqlStr(pick(CHANNELS)),
      sqlStr(`${txnType.replace('_', ' ')} via ${pick(CHANNELS)}`),
    ]);
  }
}
for (const batch of chunk(transactionRows, 1000)) {
  insertBatch(
    'transactions',
    ['id', 'account_id', 'txn_date', 'txn_type', 'amount', 'balance_after', 'channel', 'description'],
    batch,
  );
}

const header = `-- Generated by scripts/generate-seed-data.ts — do not hand-edit.
-- ${branches.length} branches, ${employees.length} employees, ${customers.length} customers,
-- ${PRODUCTS.length} products, ${accounts.length} accounts, ${cards.length} cards,
-- ${loans.length} loans, ${loanPaymentRows.length} loan_payments, ${transactionRows.length} transactions.
`;

writeFileSync(OUTPUT_PATH, header + '\n' + lines.join('\n'));
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(
  `Rows: branches=${branches.length} employees=${employees.length} customers=${customers.length} ` +
    `accounts=${accounts.length} cards=${cards.length} loans=${loans.length} ` +
    `loan_payments=${loanPaymentRows.length} transactions=${transactionRows.length}`,
);
