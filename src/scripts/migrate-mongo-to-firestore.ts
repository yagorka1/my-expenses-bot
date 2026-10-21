/**
 * One-off copy of categories, subcategories and expenses from MongoDB to Firestore.
 * Mongo `_id`s become Firestore document ids, so references stay valid and re-running is safe
 * (documents are overwritten, not duplicated).
 *
 *   npm run migrate              — copy everything
 *   npm run migrate -- --dry-run — only count and validate
 *
 * Env: MONGODB_URI, FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS), optional DNS_SERVERS.
 */
import dns from 'dns';
import dotenv from 'dotenv';
import { Timestamp } from 'firebase-admin/firestore';
import mongoose, { Types } from 'mongoose';
import { getDb } from '../config/firebase';
import { COLLECTIONS, EXPENSE_SOURCES, SYSTEM_AUTHORS } from '../constants/firestore';
import { CategoryDocument, ExpenseDocument, SubcategoryDocument } from '../interfaces/firestore.interface';

dotenv.config();

const BATCH_SIZE = 400;
const isDryRun = process.argv.includes('--dry-run');

type MongoDoc = Record<string, any> & { _id: Types.ObjectId };
type Mapper<T> = (doc: MongoDoc) => T | null;

const idOf = (value: unknown) => (value ? String(value) : '');

const mapCategory: Mapper<CategoryDocument> = (doc) => ({
  name: doc.name ?? '',
  description: doc.description ?? '',
});

const mapSubcategory: Mapper<SubcategoryDocument> = (doc) => ({
  categoryId: idOf(doc.categoryId),
  name: doc.name ?? '',
  description: doc.description ?? '',
  isNecessary: doc.isNecessary === true,
});

const mapExpense: Mapper<ExpenseDocument> = (doc) => {
  if (!(doc.date instanceof Date) || typeof doc.amount !== 'number') {
    console.warn(`  ⚠️ Skipping expense ${doc._id}: missing date or amount`);
    return null;
  }
  if (!doc.amounts) {
    console.warn(`  ⚠️ Expense ${doc._id} has no converted amounts — it won't show up in statistics`);
  }
  return {
    amount: doc.amount,
    currency: doc.currency ?? '',
    categoryId: idOf(doc.categoryId),
    categoryName: doc.categoryName ?? '',
    subcategoryId: idOf(doc.subcategoryId),
    subcategoryName: doc.subcategoryName ?? '',
    person: doc.person ?? '',
    description: doc.description ?? '',
    date: Timestamp.fromDate(doc.date),
    amounts: doc.amounts ?? {},
    source: EXPENSE_SOURCES.migration,
    createdBy: SYSTEM_AUTHORS.migration,
    createdAt: Timestamp.fromDate(doc._id.getTimestamp()),
  };
};

async function copyCollection<T extends object>(name: string, target: string, map: Mapper<T>): Promise<void> {
  const source = mongoose.connection.db!.collection<MongoDoc>(name);
  const firestore = getDb();
  let batch = firestore.batch();
  let pending = 0;
  let copied = 0;
  let skipped = 0;

  for await (const doc of source.find()) {
    const data = map(doc);
    if (!data) {
      skipped++;
      continue;
    }
    copied++;
    if (isDryRun) {
      continue;
    }

    batch.set(firestore.collection(target).doc(doc._id.toHexString()), data);
    if (++pending === BATCH_SIZE) {
      await batch.commit();
      batch = firestore.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }
  console.log(`✅ ${name} → ${target}: ${copied} ${isDryRun ? 'to copy' : 'copied'}, ${skipped} skipped`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined');
  }
  if (process.env.DNS_SERVERS) {
    // Some local resolvers refuse the SRV lookups that mongodb+srv:// needs.
    dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB${isDryRun ? ' (dry run)' : ''}`);

  try {
    await copyCollection('categories', COLLECTIONS.categories, mapCategory);
    await copyCollection('subcategories', COLLECTIONS.subcategories, mapSubcategory);
    await copyCollection('expenses', COLLECTIONS.expenses, mapExpense);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
