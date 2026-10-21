# my-expenses-bot

Telegram-бот для записи трат. Данные хранятся в Firestore (тот же проект, что и у `expenses-mobile`),
доступ через Firebase Admin SDK. Сервер `expenses-server` боту больше не нужен.

## Переменные окружения

| Переменная | Описание |
| --- | --- |
| `BOT_TOKEN` | токен бота |
| `ALLOWED_USERS` | Telegram id через запятую — кто может пользоваться ботом и получает рассылки |
| `FIREBASE_SERVICE_ACCOUNT` | JSON ключа сервисного аккаунта одной строкой (или `GOOGLE_APPLICATION_CREDENTIALS` — путь к файлу) |
| `IS_LOCAL` | `true` — long polling, иначе webhook |
| `DOMAIN`, `PORT` | для webhook |
| `MONGODB_URI`, `DNS_SERVERS` | только для скрипта миграции |

Ключ: Firebase console → Project settings → Service accounts → Generate new private key.
Файл ключа не коммитить (он в `.gitignore`).

## Перенос данных из MongoDB

```bash
npm run migrate -- --dry-run   # проверить, ничего не пишет
npm run migrate                # скопировать categories, subcategories, expenses
```

Id документов сохраняются, поэтому дублей не будет. Категории и подкатегории перезаписываются при каждом запуске —
так категории, добавленные в админке, попадают в приложение. Траты копируются, только пока в Firestore их нет:
повторное копирование отменило бы правки, сделанные в приложении, и вернуло бы удалённые там траты.

## Доступ к приложению

Человек один раз входит в приложение (email или Google), после этого:

```bash
npm run add-member -- someone@gmail.com
```

## Запуск

```bash
npm run dev      # локально (nodemon + ts-node)
npm run build && npm start
```

Нужен Node 22+ (требование firebase-admin).
