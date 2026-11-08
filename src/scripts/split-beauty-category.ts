/**
 * Splits the «Здоровье» category in two: the «Красота» subcategory moves into a new «Красота» category, «Здоровье»
 * keeps «Медицинские расходы». The subcategory keeps its document (and id), so the budget sheet doesn't change: it
 * writes the subcategory name as the article. Its expenses get the new `categoryId`.
 *
 *   npm run split-beauty-category            — only report, nothing is written
 *   npm run split-beauty-category -- --apply — write; the old documents and expense ids go to backups/ first
 *   (in Windows PowerShell `--` doesn't reach npm: use `npx ts-node src/scripts/split-beauty-category.ts --apply`)
 *
 * Writes go in this order: the new category, the subcategory, then the expenses. It can be run again: it finds the
 * subcategory in either category and an existing «Красота» category is reused.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getDb } from '../config/firebase';
import { COLLECTIONS } from '../constants/firestore';
import { CategoryDocument, CategoryItem, SubcategoryItem } from '../interfaces/firestore.interface';

dotenv.config();

const SOURCE_CATEGORY = 'Здоровье';
const TARGET_CATEGORY = 'Красота';
const SUBCATEGORY = 'Красота';
const BATCH_SIZE = 400;
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const isApply = process.argv.includes('--apply');

const normalize = (name: string) => name.trim().toLocaleLowerCase().replace(/ё/g, 'е');

function fail(message: string): never {
  console.log(`\n❌ Nothing written: ${message}`);
  process.exit(1);
}

async function main() {
  const db = getDb();
  const [categoriesSnapshot, subcategoriesSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.categories).get(),
    db.collection(COLLECTIONS.subcategories).get(),
  ]);
  const categories = categoriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CategoryItem);
  const subcategories = subcategoriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SubcategoryItem);
  const categoriesNamed = (name: string) => categories.filter((category) => normalize(category.name) === normalize(name));

  const sources = categoriesNamed(SOURCE_CATEGORY);
  if (sources.length !== 1) fail(`category «${SOURCE_CATEGORY}»: ${sources.length} matches`);
  const source = sources[0];
  const targets = categoriesNamed(TARGET_CATEGORY);
  if (targets.length > 1) fail(`category «${TARGET_CATEGORY}»: ${targets.length} matches`);
  const target = targets[0];

  const candidates = subcategories.filter(
    (subcategory) =>
      normalize(subcategory.name) === normalize(SUBCATEGORY) &&
      (subcategory.categoryId === source.id || subcategory.categoryId === target?.id),
  );
  if (candidates.length !== 1) {
    fail(`subcategory «${SUBCATEGORY}» in «${SOURCE_CATEGORY}» or «${TARGET_CATEGORY}»: ${candidates.length} matches`);
  }
  const subcategory = candidates[0];
  const targetId = target?.id ?? db.collection(COLLECTIONS.categories).doc().id;

  const expensesSnapshot = await db.collection(COLLECTIONS.expenses).where('subcategoryId', '==', subcategory.id).get();
  const expensesToMove = expensesSnapshot.docs.filter((doc) => doc.data().categoryId !== targetId);
  const left = subcategories.filter((item) => item.categoryId === source.id && item.id !== subcategory.id);

  console.log(`Category «${TARGET_CATEGORY}»: ${target ? `exists (${target.id})` : `new (${targetId})`}`);
  console.log(
    `Subcategory «${subcategory.name}» (${subcategory.id}): ${
      subcategory.categoryId === targetId ? 'already there' : `moves from «${source.name}»`
    }`,
  );
  console.log(`Expenses of the subcategory: ${expensesSnapshot.size}, to update: ${expensesToMove.length}`);
  console.log(`Left in «${source.name}»: ${left.map((item) => `«${item.name}»`).join(', ') || 'nothing'}`);

  if (target && subcategory.categoryId === targetId && !expensesToMove.length) {
    console.log('\nNothing to do.');
    return;
  }
  if (!isApply) {
    console.log('\nDry run: nothing written. Run with --apply to write.');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(
    BACKUP_DIR,
    `split-beauty-category-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        createdCategoryId: target ? null : targetId,
        subcategory,
        expenses: expensesToMove.map((doc) => ({ id: doc.id, categoryId: doc.data().categoryId ?? null })),
      },
      null,
      2,
    ),
  );
  console.log(`Backup: ${backupFile}`);

  if (!target) {
    const data: CategoryDocument = { name: TARGET_CATEGORY, description: '' };
    await db.collection(COLLECTIONS.categories).doc(targetId).set(data);
  }
  if (subcategory.categoryId !== targetId) {
    await db.collection(COLLECTIONS.subcategories).doc(subcategory.id).update({ categoryId: targetId });
  }
  for (let start = 0; start < expensesToMove.length; start += BATCH_SIZE) {
    const batch = db.batch();
    expensesToMove.slice(start, start + BATCH_SIZE).forEach((doc) => batch.update(doc.ref, { categoryId: targetId }));
    await batch.commit();
  }
  console.log(`✅ Done: «${TARGET_CATEGORY}» split out, ${expensesToMove.length} expenses updated`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
