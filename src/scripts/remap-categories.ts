/**
 * Rebuilds categories and subcategories into the structure below (it matches the budget spreadsheet's articles:
 * the sheet sync writes the subcategory name as the article) and moves the expenses along.
 *
 * - A target subcategory keeps the document (and id) of the first subcategory in its `from`; the others in `from`
 *   are merged into it: their expenses are moved over and they are deleted. No `from` = a new subcategory.
 * - A target category keeps the document of its `from` category; no `from` = a new category. Existing categories
 *   that no target keeps are deleted.
 * - Every expense of a moved or merged subcategory gets the new `subcategoryId` and `categoryId`.
 * Existing items are found by name (case, `ё` and surrounding spaces don't matter). Nothing is written unless every
 * `from` matches exactly one existing item and every existing subcategory is mapped.
 *
 *   npm run remap-categories            — only report, nothing is written
 *   npm run remap-categories -- --apply — write; categories, subcategories and the old expense ids go to backups/ first
 *
 * Writes go in this order: new and updated categories and subcategories, then expenses, then deletions. So if it
 * stops halfway, every expense still points to an existing subcategory. It can't be run twice: the old names are gone.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { DocumentData, UpdateData } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase';
import { COLLECTIONS } from '../constants/firestore';
import {
  CategoryDocument,
  CategoryItem,
  SubcategoryDocument,
  SubcategoryItem,
} from '../interfaces/firestore.interface';

dotenv.config();

interface TargetSubcategory {
  name: string;
  /** Replaces the kept document's description; a new subcategory gets `''` without it. */
  description?: string;
  /** Existing subcategories as [category, subcategory] names; the first one keeps its document. */
  from: [string, string][];
}

interface TargetCategory {
  name: string;
  /** Existing category whose document this one keeps. */
  from?: string;
  subcategories: TargetSubcategory[];
}

const STRUCTURE: TargetCategory[] = [
  {
    name: 'Еда',
    from: 'Еда',
    subcategories: [
      { name: 'Продукты', from: [['Еда', 'Обычная еда'], ['Еда', 'Вкусняшки']] },
      { name: 'Кафе и рестораны', from: [['Еда', 'Еда в заведениях']] },
      { name: 'Готовая еда', from: [['Еда', 'Питание на работе']] },
    ],
  },
  {
    name: 'Жильё',
    from: 'Жилье',
    subcategories: [
      { name: 'Аренда квартиры', from: [['Жилье', 'Аренда Квартиры']] },
      { name: 'Коммунальные услуги', from: [['Жилье', 'Коммунальные услуги']] },
      { name: 'Хозтовары', from: [['Жилье', 'Бытовые товары']] },
      { name: 'Ремонт и уют', from: [['Жилье', 'Ремонт и Уют']] },
      { name: 'Мебель и бытовая техника', from: [['Электроника', 'Бытовая техника']] },
    ],
  },
  {
    name: 'Здоровье',
    from: 'Здоровье',
    subcategories: [
      {
        name: 'Медицинские расходы',
        from: [['Здоровье', 'Врач'], ['Здоровье', 'Анализы'], ['Здоровье', 'Медикаменты'], ['Здоровье', 'Процедуры']],
      },
      {
        name: 'Красота',
        from: [
          ['Здоровье', 'Массаж'],
          ['Красота', 'Волосы'],
          ['Красота', 'Косметика'],
          ['Красота', 'Ногти'],
          ['Красота', 'Процедры'],
        ],
      },
    ],
  },
  {
    name: 'Спорт',
    from: 'Спорт',
    subcategories: [{ name: 'Спорт и танцы', from: [['Спорт', 'Спорт'], ['Спорт', 'Танцы']] }],
  },
  {
    name: 'Одежда',
    from: 'Одежда',
    subcategories: [
      {
        name: 'Одежда, обувь и аксессуары',
        from: [['Одежда', 'Одежда'], ['Одежда', 'Обувь'], ['Одежда', 'Аксессуары']],
      },
    ],
  },
  {
    name: 'Подарки',
    from: 'Подарки',
    subcategories: [{ name: 'Подарки и цветы', from: [['Подарки', 'Подарки'], ['Подарки', 'Цветы']] }],
  },
  {
    name: 'Транспорт',
    from: 'Транспорт',
    subcategories: [
      { name: 'Общественный транспорт', from: [['Транспорт', 'Общественный транспорт']] },
      { name: 'Такси', from: [['Транспорт', 'Такси']] },
    ],
  },
  {
    name: 'Путешествия',
    from: 'Путешествия',
    subcategories: [
      {
        name: 'Транспорт в путешествиях',
        from: [['Путешествия', 'Транспорт в путешествиях'], ['Транспорт', 'Аренда машины']],
      },
      { name: 'Аренда жилья в путешествиях', from: [['Путешествия', 'Аренда жилья в путешествиях']] },
      { name: 'Экскурсии и др', from: [['Путешествия', 'Экскурсии и др']] },
    ],
  },
  {
    name: 'Связь и подписки',
    from: 'Связь и Подписки',
    subcategories: [
      { name: 'Мобильная связь', from: [['Связь и Подписки', 'Мобильная связь'], ['Путешествия', 'Связь']] },
      { name: 'Подписки на сервисы', description: 'ИИ, музыка, кино и т. д.', from: [] },
    ],
  },
  {
    name: 'Электроника',
    from: 'Электроника',
    subcategories: [
      { name: 'Компьютеры', from: [['Электроника', 'Компьютеры']] },
      { name: 'Телефоны', from: [['Электроника', 'Телефоны']] },
    ],
  },
  {
    name: 'Обучение',
    subcategories: [{ name: 'Обучение', from: [] }],
  },
  {
    name: 'Документы',
    subcategories: [{ name: 'ВНЖ, визы, бумаги', from: [['Путешествия', 'Страховка и документы']] }],
  },
  {
    name: 'Финансы',
    subcategories: [
      { name: 'Банковские списания', from: [] },
      { name: 'Штрафы и комиссии', from: [] },
    ],
  },
  {
    name: 'Развлечения',
    from: 'Развлечения',
    subcategories: [{ name: 'Развлечения', from: [['Развлечения', 'Развлечения']] }],
  },
  {
    name: 'Другое',
    from: 'Другое',
    subcategories: [{ name: 'Другое', from: [['Другое', 'Другое']] }],
  },
];

/** Same limit as the app's (CATEGORY_NAME_MAX_LENGTH, firestore.rules). */
const NAME_MAX_LENGTH = 40;
const BATCH_SIZE = 400;
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const isApply = process.argv.includes('--apply');

type Write =
  | { kind: 'set'; collection: string; id: string; data: DocumentData }
  | { kind: 'update'; collection: string; id: string; data: UpdateData<DocumentData> }
  | { kind: 'delete'; collection: string; id: string };

const asString = (value: unknown) => (typeof value === 'string' ? value : '');
const normalize = (name: string) => name.trim().toLocaleLowerCase().replace(/ё/g, 'е');

function only<T>(items: T[], what: string, problems: string[]): T | undefined {
  if (items.length !== 1) {
    problems.push(`${what}: ${items.length ? `${items.length} matches` : 'not found'}`);
    return undefined;
  }
  return items[0];
}

async function commit(writes: Write[]) {
  const db = getDb();
  for (let start = 0; start < writes.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_SIZE)) {
      const ref = db.collection(write.collection).doc(write.id);
      if (write.kind === 'set') batch.set(ref, write.data);
      else if (write.kind === 'update') batch.update(ref, write.data);
      else batch.delete(ref);
    }
    await batch.commit();
  }
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
  console.log(
    `Categories: ${categories.length}, subcategories: ${subcategories.length}, expenses: ${expensesSnapshot.size}`,
  );

  const problems: string[] = [];
  const findCategory = (name: string) =>
    only(
      categories.filter((category) => normalize(category.name) === normalize(name)),
      `Category «${name}»`,
      problems,
    );

  // ---- Resolve the structure against what exists ----

  const keptCategoryIds = new Set<string>();
  const usedSubcategoryIds = new Set<string>();
  const targetNames = new Set<string>();
  /** Old subcategory id → where its expenses go. */
  const moves = new Map<string, { subcategoryId: string; categoryId: string; label: string }>();
  const created: Write[] = [];
  const updated: Write[] = [];
  const deleted: Write[] = [];
  const report: string[] = [];

  for (const target of STRUCTURE) {
    for (const name of [target.name, ...target.subcategories.map((subcategory) => subcategory.name)]) {
      if (!name.trim() || name.length > NAME_MAX_LENGTH) problems.push(`Name «${name}»: empty or over ${NAME_MAX_LENGTH}`);
    }
    if (targetNames.has(normalize(target.name))) problems.push(`Category «${target.name}» is listed twice`);
    targetNames.add(normalize(target.name));

    const keptCategory = target.from === undefined ? undefined : findCategory(target.from);
    if (keptCategory) {
      if (keptCategoryIds.has(keptCategory.id)) problems.push(`Category «${target.from}» is kept twice`);
      keptCategoryIds.add(keptCategory.id);
    }
    const categoryId = keptCategory?.id ?? db.collection(COLLECTIONS.categories).doc().id;
    if (!keptCategory) {
      const data: CategoryDocument = { name: target.name, description: '' };
      created.push({ kind: 'set', collection: COLLECTIONS.categories, id: categoryId, data });
    } else if (keptCategory.name !== target.name) {
      updated.push({ kind: 'update', collection: COLLECTIONS.categories, id: categoryId, data: { name: target.name } });
    }
    report.push(`${target.name}${keptCategory ? (keptCategory.name !== target.name ? ` ← «${keptCategory.name}»` : '') : ' (new)'}`);

    for (const subcategoryTarget of target.subcategories) {
      const sources = subcategoryTarget.from.map(([categoryName, subcategoryName]) => {
        const category = findCategory(categoryName);
        const source =
          category &&
          only(
            subcategories.filter(
              (item) => item.categoryId === category.id && normalize(item.name) === normalize(subcategoryName),
            ),
            `Subcategory «${categoryName} / ${subcategoryName}»`,
            problems,
          );
        if (source) {
          if (usedSubcategoryIds.has(source.id)) problems.push(`Subcategory «${categoryName} / ${subcategoryName}» is used twice`);
          usedSubcategoryIds.add(source.id);
        }
        return { source, label: `${categoryName} / ${subcategoryName}` };
      });

      const kept = sources[0]?.source;
      const subcategoryId = kept?.id ?? db.collection(COLLECTIONS.subcategories).doc().id;
      if (!subcategoryTarget.from.length) {
        const data: SubcategoryDocument = {
          categoryId,
          name: subcategoryTarget.name,
          description: subcategoryTarget.description ?? '',
          isNecessary: false,
        };
        created.push({ kind: 'set', collection: COLLECTIONS.subcategories, id: subcategoryId, data });
      } else if (kept) {
        const data: UpdateData<DocumentData> = {};
        if (kept.name !== subcategoryTarget.name) data.name = subcategoryTarget.name;
        if (kept.categoryId !== categoryId) data.categoryId = categoryId;
        if (subcategoryTarget.description !== undefined && kept.description !== subcategoryTarget.description) {
          data.description = subcategoryTarget.description;
        }
        if (Object.keys(data).length) {
          updated.push({ kind: 'update', collection: COLLECTIONS.subcategories, id: subcategoryId, data });
        }
      }
      sources.forEach(({ source }, index) => {
        if (!source) return;
        moves.set(source.id, { subcategoryId, categoryId, label: `${target.name} / ${subcategoryTarget.name}` });
        if (index > 0) deleted.push({ kind: 'delete', collection: COLLECTIONS.subcategories, id: source.id });
      });
      const from = sources.map(({ label }) => label).join(' + ');
      report.push(`  ${subcategoryTarget.name}${from ? ` ← ${from}` : ' (new)'}`);
    }
  }

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  for (const subcategory of subcategories) {
    if (!usedSubcategoryIds.has(subcategory.id)) {
      problems.push(
        `Subcategory «${categoryNames.get(subcategory.categoryId) ?? subcategory.categoryId} / ${subcategory.name}» isn't mapped`,
      );
    }
  }
  for (const category of categories) {
    if (!keptCategoryIds.has(category.id)) {
      deleted.push({ kind: 'delete', collection: COLLECTIONS.categories, id: category.id });
      report.push(`Deleted category «${category.name}»`);
    }
  }

  // ---- Expenses ----

  const expenseWrites: Write[] = [];
  const backupExpenses: { id: string; categoryId: string; subcategoryId: string }[] = [];
  const movedTo = new Map<string, number>();
  const unknown: string[] = [];
  for (const doc of expensesSnapshot.docs) {
    const data = doc.data();
    const categoryId = asString(data.categoryId);
    const subcategoryId = asString(data.subcategoryId);
    const move = moves.get(subcategoryId);
    if (!move) {
      unknown.push(`${doc.id} (subcategoryId: ${subcategoryId || '—'}, stored: «${data.categoryName ?? ''} / ${data.subcategoryName ?? ''}»)`);
      continue;
    }
    if (move.subcategoryId === subcategoryId && move.categoryId === categoryId) continue;
    expenseWrites.push({
      kind: 'update',
      collection: COLLECTIONS.expenses,
      id: doc.id,
      data: { subcategoryId: move.subcategoryId, categoryId: move.categoryId },
    });
    backupExpenses.push({ id: doc.id, categoryId, subcategoryId });
    movedTo.set(move.label, (movedTo.get(move.label) ?? 0) + 1);
  }

  console.log('\nNew structure:');
  report.forEach((line) => console.log(`  ${line}`));
  console.log(`\nCreate: ${created.length}, update: ${updated.length}, delete: ${deleted.length} categories/subcategories`);
  console.log(`Expenses to update: ${expenseWrites.length}`);
  [...movedTo].forEach(([label, count]) => console.log(`  → ${label}: ${count}`));
  console.log(`Expenses with an unknown subcategory, left as they are: ${unknown.length}`);
  unknown.forEach((line) => console.log(`  ${line}`));

  if (problems.length) {
    console.log('\n❌ Nothing written, fix these first:');
    problems.forEach((problem) => console.log(`  ${problem}`));
    process.exit(1);
  }
  if (!isApply) {
    console.log('\nDry run: nothing written. Run with --apply to write.');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `remap-categories-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        categories: categoriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        subcategories: subcategoriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        expenses: backupExpenses,
      },
      null,
      2,
    ),
  );
  console.log(`Backup: ${backupFile}`);

  await commit([...created, ...updated]);
  await commit(expenseWrites);
  await commit(deleted);
  console.log(`✅ Done: ${expenseWrites.length} expenses moved`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
