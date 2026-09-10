/* ============================================================================
   Ukrainian.

   Typed as Record<Key, Phrase> against ./en, so the compiler refuses a build
   with a key missing here. Values are free-form: a phrase English says with one
   string may need the four plural categories Ukrainian uses, and vice versa -
   the count-driven ones below are exactly that case.
   ============================================================================ */

import type { Key } from "./index";
import type { Phrase } from "./types";

export const uk: Record<Key, Phrase> = {
  /* ------------------------------------------------------------------ app -- */
  "app.nav.boards": "Дошки",
  "app.nav.calendar": "Календар",
  "app.nav.settings": "Налаштування",

  /* --------------------------------------------------------------- common -- */
  "common.back": "Назад",
  "common.close": "Закрити",
  "common.none": "Немає",
  "common.online": "онлайн",
  "common.offline": "офлайн",
  "common.checking": "…",

  /* --------------------------------------------------------------- boards -- */
  "boards.title": "Дошки",
  "boards.new": "Нова дошка",
  "boards.empty.title": "Дошок ще немає",
  "boards.empty.withTasks":
    "Дошка містить набір завдань — по одній на проєкт, клієнта чи тиждень.",
  "boards.empty.boardsOnly":
    "Створіть дошку, щоб перевірити, що вона доходить до сервера й повертається.",
  "boards.allDone": "Усе виконано",
  "boards.open": {
    one: "{count} відкрите",
    few: "{count} відкриті",
    many: "{count} відкритих",
    other: "{count} відкритих",
  },
  "boards.loadFailed": "Не вдалося завантажити ваші дошки.",
  "boards.notRegistered":
    "Не зареєстровано на сервері: {reason}. Дошки не збережуться.",
  "boards.sheet.title": "Нова дошка",
  "boards.sheet.field": "Назва",
  "boards.sheet.placeholder": "Спринт 12",
  "boards.sheet.submit": "Створити дошку",
  "boards.sheet.failed": "Не вдалося створити дошку.",

  /* ---------------------------------------------------------------- board -- */
  "board.deleteAria": "Видалити дошку",
  "board.newTaskAria": "Нове завдання",
  "board.noTasks": "Завдань ще немає",
  "board.openDone": "{open} відкрито · {done} виконано",
  "board.taskCount": {
    one: "{count} завдання",
    few: "{count} завдання",
    many: "{count} завдань",
    other: "{count} завдання",
  },
  "board.confirmDelete":
    "Видалити «{title}» і всі її завдання? Цю дію не можна скасувати.",
  "board.saveFailed": "Не вдалося зберегти.",
  "board.deleteFailed": "Не вдалося видалити дошку.",
  "board.hidden.title": "Поки що лише дошки",
  "board.hidden.body":
    "Ця дошка збережена на сервері. Завдання — ще ні, тож вони приховані, а не записані туди, де ця дошка їх не побачить.",
  "board.empty.title": "Тут поки порожньо",
  "board.empty.body": "Додайте перше завдання до цієї дошки.",
  "board.markDone": "Позначити виконаним",
  "board.markNotDone": "Зняти позначку виконання",
  "board.sheet.title": "Нове завдання",
  "board.sheet.submit": "Створити завдання",
  "board.sheet.failed": "Не вдалося створити завдання.",

  /* ------------------------------------------------------------- calendar -- */
  "calendar.title": "Календар",
  "calendar.today": "Сьогодні",
  "calendar.prevMonth": "Попередній місяць",
  "calendar.nextMonth": "Наступний місяць",
  "calendar.nothingDue": "На цей день нічого не заплановано.",
  "calendar.noBoard": "—",

  /* ----------------------------------------------------------------- task -- */
  "task.title": "Завдання",
  "task.done": "Виконано",
  "task.open": "Відкрито",
  "task.deleteAria": "Видалити завдання",
  "task.confirmDelete": "Видалити це завдання та його коментарі?",
  "task.deadline": "Дедлайн",
  "task.priority": "Пріоритет",
  "task.edit": "Редагувати завдання",
  "task.sheet.title": "Редагувати завдання",
  "task.sheet.submit": "Зберегти зміни",
  "task.sheet.failed": "Не вдалося зберегти завдання.",

  /* ------------------------------------------------------------- comments -- */
  "comments.title": "Коментарі",
  "comments.placeholder": "Додати коментар",
  "comments.post": "Надіслати коментар",
  "comments.editAria": "Редагувати коментар",
  "comments.deleteAria": "Видалити коментар",
  "comments.confirmDelete": "Видалити цей коментар?",
  "comments.postFailed": "Не вдалося надіслати коментар.",
  "comments.saveFailed": "Не вдалося зберегти коментар.",
  "comments.deleteFailed": "Не вдалося видалити коментар.",
  "comments.loadFailed": "Не вдалося завантажити коментарі.",
  "comments.sheet.title": "Редагувати коментар",
  "comments.sheet.submit": "Зберегти коментар",
  "comments.attach": "Прикріпити зображення",
  "comments.you": "Ви",
  "comments.someone": "Учасник команди",

  /* ------------------------------------------------------------- settings -- */
  "settings.title": "Налаштування",
  "settings.account": "Обліковий запис",
  "settings.signedIn": "Вхід через Telegram",
  "settings.language": "Мова",
  "settings.languageSub": "Застосовується в усьому застосунку на цьому пристрої.",
  "settings.team": "Команда",
  "settings.roleOwner": "власник",
  "settings.roleMember": "учасник",
  "settings.invited": "запрошено",
  "settings.noBoards": "Ще без дошок",
  "settings.confirmRemove": "Вилучити {name} з команди?",
  "settings.removeAria": "Вилучити {name}",
  "settings.removeFailed": "Не вдалося вилучити.",
  "settings.loadFailed": "Не вдалося завантажити команду.",
  "settings.invite": "Запросити людину",
  "settings.inviteHint":
    "Спершу створіть дошку — запрошення дає доступ до конкретних дошок.",
  "settings.inviteLinks": "Посилання-запрошення",
  "settings.used": "використано",
  "settings.shareAgain": "Поділитися посиланням ще раз",
  "settings.revoke": "Відкликати посилання",
  "settings.boardDeleted": "Дошку видалено",
  "settings.confirmRevoke":
    "Відкликати це посилання? Той, хто вже його має, не зможе приєднатися.",
  "settings.fallbackNote":
    "Меню «Поділитися» доступне лише в застосунку Telegram — посилання відкрилося у вкладці браузера. Воно є в списку нижче, готове до копіювання.",
  "settings.inviteText": "Приєднуйтеся до {what} у Planner",
  "settings.inviteBoards": {
    one: "{count} дошки",
    few: "{count} дошок",
    many: "{count} дошок",
    other: "{count} дошок",
  },
  "settings.data": "Дані",
  "settings.backend": "Сервер",
  "settings.backendSub": "Дошки та ваш обліковий запис зберігаються на сервері.",
  "settings.notRegistered": "Обліковий запис не зареєстровано",
  "settings.localTag": "локально",
  "settings.storedHere": "Зберігається в цьому браузері",
  "settings.storedHereApi": "Команда та запрошення — ще не на сервері.",
  "settings.storedHereLocal":
    "Поки нічого не надсилається на сервер — запрошення лише локальні.",
  "settings.erase": "Стерти локальні дані",
  "settings.confirmErase":
    "Стерти всі дошки, завдання та коментарі, збережені в цьому браузері? Цю дію не можна скасувати.",
  "settings.sheet.title": "Запросити на дошку",
  "settings.sheet.noBotUsername":
    "BOT_USERNAME не задано у config.js — посилання вестиме на t.me/?startapp=… і нічого не відкриє.",
  "settings.sheet.boards": "Дошки, які вони зможуть відкрити",
  "settings.sheet.selected": "вибрано: {count}",
  "settings.sheet.hint":
    "Далі Telegram відкриє власне меню «Поділитися» — пошук, останні чати й контакти — і надішле посилання від вашого імені. Нічого не залишить цей пристрій, доки ви там когось не виберете.",
  "settings.sheet.submit": "Вибрати чат у Telegram",
  "settings.sheet.failed": "Не вдалося створити запрошення.",

  /* --------------------------------------------------------------- invite -- */
  "invite.title": "Вас запросили",
  "invite.checking": "Перевіряємо посилання…",
  "invite.unknownHandoff":
    "Це посилання несе токен {token}, і Telegram коректно передав його застосунку — уся передача працює.",
  "invite.unknownWhy":
    "Його не можна активувати тут, бо запрошення досі зберігаються в браузері, який їх створив. Щойно на сервері з’явиться таблиця /invites, саме тут відбуватиметься приєднання до дошки.",
  "invite.boards": "Дошки, які відкриває це посилання",
  "invite.boardsDeleted": "Ці дошки вже видалено.",
  "invite.alreadyUsed": "Це посилання вже використано.",
  "invite.join": "Приєднатися",
  "invite.joined": "Ви в команді",
  "invite.joinedBody": "Дошка вже на вкладці «Дошки».",
  "invite.open": "Відкрити Planner",
  "invite.loadFailed": "Не вдалося завантажити дошки.",
  "invite.acceptFailed": "Не вдалося прийняти запрошення.",

  /* --------------------------------------------------------------- fields -- */
  "fields.title": "Назва",
  "fields.description": "Опис",
  "fields.deadline": "Дедлайн",
  "fields.priority": "Пріоритет",
  "fields.titlePlaceholder": "Написати нотатки до релізу",
  "fields.descriptionPlaceholder": "Необов’язкові деталі",

  /* ---------------------------------------------------------------- image -- */
  "image.label": "Зображення",
  "image.processing": "Обробка…",
  "image.replace": "Замінити",
  "image.attach": "Прикріпити",
  "image.remove": "Видалити зображення",
  "image.readFailed": "Не вдалося прочитати це зображення.",
  "image.tooLarge":
    "Це зображення завелике навіть після стиснення. Спробуйте менше.",
  "image.notAnImage": "Цей файл не є зображенням, яке ми можемо прочитати.",
  "image.noCanvas": "Canvas недоступний у цьому браузері.",

  /* ------------------------------------------------------------- priority -- */
  "priority.low": "Низький",
  "priority.medium": "Середній",
  "priority.high": "Високий",
  "priority.unknown": "Пріоритет {code}",

  /* ----------------------------------------------------------------- user -- */
  "user.telegram": "Користувач Telegram",

  /* ----------------------------------------------------------------- date -- */
  "date.today": "Сьогодні",
  "date.tomorrow": "Завтра",
  "date.yesterday": "Учора",
  "date.justNow": "щойно",

  /* ----------------------------------------------------------------- http -- */
  "http.noBackend": "Сервер не налаштовано. Задайте API_BASE у config.js.",
  "http.unreachable": "Не вдалося зв’язатися з сервером. Перевірте з’єднання.",
  "http.timeout": "Сервер відповідав задовго.",
  "http.failed": "Запит не вдався ({status})",

  /* ------------------------------------------------------------------ api -- */
  "api.noIdentity": "Цей запуск не має ідентифікації Telegram",
  "api.titleRequired": "Потрібна назва",
  "api.titleTooLong": "Назва обмежена 30 символами",
  "api.boardNotFound": "Дошку не знайдено",
  "api.taskNotFound": "Завдання не знайдено",
  "api.commentNotFound": "Коментар не знайдено",
  "api.memberNotFound": "Учасника не знайдено",
  "api.ownerImmutable": "Власника не можна вилучити",
  "api.writeSomething": "Спершу щось напишіть",
  "api.pickBoard": "Виберіть хоча б одну дошку",
  "api.inviteInvalid": "Це посилання-запрошення більше не дійсне",
  "api.inviteUsed": "Це запрошення вже використано",
  "api.outOfStorage":
    "Локальне сховище заповнене. Видаліть кілька зображень або очистіть дані застосунку в Налаштуваннях.",
  "api.localRow":
    "Цей запис створено в локальному режимі, і на сервері його немає. Зітріть локальні дані в Налаштуваннях.",
  "api.noRoute": "На сервері ще немає маршруту {route}.",
  "api.noUserId": "Сервер повернув користувача без id.",
  "api.noBoardId": "Сервер повернув дошку без id.",
  "api.noTaskId": "Сервер повернув завдання без id.",
  "api.commentShape":
    "Сервер надіслав коментарі без id, тому жоден із них не можна показати. Додайте `id` до CommentRead у backend/app/schemas.py — response_model пропускає лише ті поля, які в ньому оголошені.",

  /* -------------------------------------------------- why a feature hides -- */
  "missing.taskDone":
    "Щоб позначати завдання виконаним, моделі Task потрібен стовпець `done`.",
  "missing.comments":
    "Коментарям потрібно, щоб CommentRead у backend/app/schemas.py містив id, user_id і created_at.",
  "missing.team":
    "Списку команди потрібна таблиця учасників і маршрут для її читання.",
  "missing.invites":
    "Запрошенням потрібна таблиця з унікальним токеном і маршрути для створення та активації.",

  /* -------------------------------------------------------------- credits -- */
  "powered.by": "Працює на",
};
