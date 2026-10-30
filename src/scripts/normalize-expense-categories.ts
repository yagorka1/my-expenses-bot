/**
 * Brings expenses to the id-only shape: the app, the bot and the sheet sync look category names up by
 * `categoryId` / `subcategoryId`, so the names copied into expenses are no longer needed.
 *
 * For every expense:
 * - the subcategory is found by `subcategoryId`; failing that, by name within the category (found by
 *   `categoryId`, failing that by name);
 * - `categoryId` is set to the subcategory's own category, so the two always agree;
 * - `categoryName` and `subcategoryName` are removed.
 * Expenses that can't be matched to a subcategory are left as they are (the readers fall back to their
 * stored names) and listed.
 *
 *   npm run normalize-categories            — only report, nothing is written
 *   npm run normalize-categories -- --apply — write; the old values go to backups/ first
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { DocumentData, FieldValue, UpdateData } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase';
import { COLLECTIONS } from '../constants/firestore';
import { CategoryItem, SubcategoryItem } from '../interfaces/firestore.interface';

dotenv.config();

const BATCH_SIZE = 400;
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const isApply = process.argv.includes('--apply');

/** Category fields of an expense as stored, whatever the document holds. */
interface StoredCategoryFields {
  categoryId?: unknown;
  categoryName?: unknown;
  subcategoryId?: unknown;
  subcategoryName?: unknown;
}

interface Change {
  id: string;
  before: StoredCategoryFields;
  update: UpdateData<DocumentData>;
}

const asString = (value: unknown) => (typeof value === 'string' ? value : '');
const normalize = (name: string) => name.trim().toLocaleLowerCase();

/** The only item with this name; `undefined` when there is none or the name is ambiguous. */
function uniqueByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const matches = items.filter((item) => name && normalize(item.name) === normalize(name));
  return matches.length === 1 ? matches[0] : undefined;
}

function describe(id: string, data: DocumentData): string {
  const date = data.date?.toDate?.().toISOString().slice(0, 10) ?? '?';
  return `${id} ${date} ${data.amount} ${data.currency} «${data.categoryName ?? ''} / ${data.subcategoryName ?? ''}» (ids: ${data.categoryId || '—'} / ${data.subcategoryId || '—'})`;
}

async function main() {
  const db = getDb();
  const [categoriesSnapshot, subcategoriesSnapshot, expensesSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.categories).get(),
    db.collection(COLLECTIONS.subcategories).get(),
    db.collection(COLLECTIONS.expenses).get(),
  ]);
  const categories = categoriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CategoryItem);
  const subcategories = subcategoriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SubcategoryItem);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const subcategoryById = new Map(subcategories.map((subcategory) => [subcategory.id, subcategory]));

  console.log(
    `Categories: ${categories.length}, subcategories: ${subcategories.length}, expenses: ${expensesSnapshot.size}`,
  );
  for (const subcategory of subcategories) {
    if (!categoryById.has(subcategory.categoryId)) {
      console.warn(`  ⚠️ Subcategory ${subcategory.id} «${subcategory.name}» refers to a missing category`);
    }
  }

  const changes: Change[] = [];
  const unresolved: string[] = [];
  let alreadyClean = 0;
  let idsFixed = 0;
  let renamedSince = 0;

  for (const doc of expensesSnapshot.docs) {
    const data = doc.data();
    const categoryId = asString(data.categoryId);
    const subcategoryId = asString(data.subcategoryId);

    let subcategory = subcategoryById.get(subcategoryId);
    if (!subcategory) {
      const category = categoryById.get(categoryId) ?? uniqueByName(categories, asString(data.categoryName));
      subcategory = category
        ? uniqueByName(
            subcategories.filter((item) => item.categoryId === category.id),
            asString(data.subcategoryName),
          )
        : undefined;
    }
    const category = subcategory && categoryById.get(subcategory.categoryId);
    if (!subcategory || !category) {
      unresolved.push(describe(doc.id, data));
      continue;
    }

    const update: UpdateData<DocumentData> = {};
    if (categoryId !== category.id) {
      update.categoryId = category.id;
    }
    if (subcategoryId !== subcategory.id) {
      update.subcategoryId = subcategory.id;
    }
    if (Object.keys(update).length) {
      idsFixed++;
    }
    if (
      (data.categoryName !== undefined && data.categoryName !== category.name) ||
      (data.subcategoryName !== undefined && data.subcategoryName !== subcategory.name)
    ) {
      renamedSince++;
    }
    if (data.categoryName !== undefined) {
      update.categoryName = FieldValue.delete();
    }
    if (data.subcategoryName !== undefined) {
      update.subcategoryName = FieldValue.delete();
    }

    if (Object.keys(update).length) {
      const { categoryName, subcategoryName } = data;
      changes.push({ id: doc.id, before: { categoryId, categoryName, subcategoryId, subcategoryName }, update });
    } else {
      alreadyClean++;
    }
  }

  console.log(`Already id-only: ${alreadyClean}`);
  console.log(
    `To update: ${changes.length} (ids fixed: ${idsFixed}; stored names differ from the current ones: ${renamedSince})`,
  );
  console.log(`Can't be matched, left as they are: ${unresolved.length}`);
  unresolved.forEach((line) => console.log(`  ${line}`));

  if (!isApply) {
    console.log('Dry run: nothing written. Run with --apply to write.');
    return;
  }
  if (!changes.length) {
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `expense-categories-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(changes.map(({ id, before }) => ({ id, ...before })), null, 2));
  console.log(`Backup of the old values: ${backupFile}`);

  for (let start = 0; start < changes.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const { id, update } of changes.slice(start, start + BATCH_SIZE)) {
      batch.update(db.collection(COLLECTIONS.expenses).doc(id), update);
    }
    await batch.commit();
  }
  console.log(`✅ Updated ${changes.length} expenses`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
