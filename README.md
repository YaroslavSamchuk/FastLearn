# 🇩🇰 FastLearn — Brutalist LingQ AI Danish Tutor

Повністю клієнтський, мінімалістичний та брутальний веб-застосунок для вивчення датської мови у форматі інтерактивного діалогу з ШІ в стилі **LingQ**.

Інтегровано з [**Antigravity Client**](https://github.com/YaroslavSamchuk/AntigravityClient) для прямого доступу до моделей ШІ та підготовлено до **деплою на Cloudflare (Pages & Workers), Vercel, Koyeb або GitHub Pages**.

---

## ⚡ Особливості архітектури
- **☁️ 100% безкоштовний Edge-деплой на Cloudflare**:
  - **Варіант А (Рекомендовано)**: **Cloudflare Pages** — сайт і проксі живуть на одному домені (`https://fastlearn.pages.dev`). Повна підтримка Serverless Edge Functions (`functions/_middleware.ts`).
  - **Варіант Б (Гібридний)**: **GitHub Pages + окремий Cloudflare Worker** (`cloudflare-worker/`) як безкоштовний шлюз для Antigravity API.
  - Ліміт безкоштовного тарифу Cloudflare: **100 000 запитів на день** та необмежений статичний трафік.
- **⚡ Вбудований реверс-проксі для Antigravity (`/v1internal`)**: Автоматично інжектує системний `User-Agent: antigravity/cli/...` для взаємодії з бекендом Google Antigravity без браузерних CORS-блокувань.
- **▲ Готовність до Vercel**: Додано `vercel.json` та Vercel Edge Function (`api/v1internal/[...path].ts`).
- **🐳 Готовність до Koyeb & Docker**: Проєкт містить оптимізований `Dockerfile` та `server.js` (Node.js 22).
- **🔐 Google OAuth (PKCE) або Gemini API Key**: Локально — вхід через Google в 1 клік; онлайн — швидкий доступ через безкоштовний Gemini API Key або власний токен.
- **100% збереження прогресу у клієнті**: Усі діалоги, персональний словник та налаштування зберігаються у вашому браузері (`localStorage`).
- **Синтез мови Web Speech API**: Природна вимова датських слів та речень (`da-DK`) без сторонніх платних TTS-сервісів.
- **Експорт в Anki**: Експорт персонального словника у `.tsv` / `.csv` для щоденного інтервального повторення.

---

## 🚀 Варіанти деплою

### Варіант 1: Cloudflare Pages (🏆 Найкращий вибір — 100% безкоштовно)
І сайт, і проксі працюють на одному домені без налаштування CORS.

1. Перейдіть у [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → вкладка **Pages** → **Connect to Git**.
2. Оберіть свій репозиторій **FastLearn**.
3. У налаштуваннях збірки (**Build settings**):
   - **Framework preset**: `Vite` (або `None`)
   - **Build command**: `npm run build`
   - **Build output directory**: `frontend/dist`
   - **Root directory**: `/` (або залиште порожнім)
4. Натисніть **Save and Deploy**.

Cloudflare автоматично підхопить `functions/_middleware.ts` для проксі та скомпілює фронтенд. Готово!

---

### Варіант 2: GitHub Pages + окремий Cloudflare Worker (Гібрид)
Якщо ви хочете залишити статичний сайт на GitHub Pages, а сервер-проксі винести на Cloudflare Worker:

1. **Деплой воркера**:
   ```bash
   cd cloudflare-worker
   npm install
   npx wrangler deploy
   ```
   Воркер розгорнеться за адресою на зразок `https://fastlearn-antigravity-proxy.<your-subdomain>.workers.dev`.
2. **Підключення у FastLearn**:
   - Відкрийте ваш сайт на GitHub Pages.
   - Зайдіть у **⚙ Налаштування** → у додатковому полі **URL проксі Antigravity** вставте адресу вашого воркера.
   - Натисніть **Зберегти**. Усі запити до Antigravity підуть через ваш безкоштовний воркер!

---

### Варіант 3: Vercel
1. Імпортуйте репозиторій у [Vercel](https://vercel.com/new).
2. Vercel автоматично розпізнає `vercel.json` і налаштує збірку `npm run build` та вихідний каталог `frontend/dist`.
3. Edge-функція `api/v1internal/[...path].ts` автоматично проксуватиме запити.

---

### Варіант 4: Koyeb / Docker
1. Перейдіть на [app.koyeb.com](https://app.koyeb.com/) → **Create Service** → **GitHub**.
2. Builder: **Dockerfile** (порт: `8000`, маршрут: `/`, health check: `/health`).

---

## 💻 Локальний запуск

```bash
# Встановлення та запуск dev-сервера з гарячим перезавантаженням
npm run dev

# Або запуск продакшн-сервера
npm run build
npm start
```
Відкрийте `http://localhost:5173` (dev) або `http://localhost:8000` (prod).

---

## 🧩 Функціонал LingQ

1. **Інтерактивні слова-токени**:
   - 🔵 **Нове слово (0)** — синій акцент.
   - 🟡 **На вивченні 1 (1)** — фірмовий жовтий LingQ колір.
   - 🟡 **Знайоме (2)** — м'який жовтий відтінок.
   - ⚪ **Вивчене (3)** — чистий звичайний текст.
2. **Миттєвий поп-ап слова**:
   - 🔊 Озвучка слова датською.
   - 🇺🇦 Переклад на українську (можна редагувати прямо в інтерфейсі).
   - 💡 Датські синоніми з можливістю прослухати кожен.
   - ⚡ Гарячі клавіші для зміни статусу: натискайте `1`, `2`, `3` або `0` на клавіатурі.
3. **Виділення фраз та ідіом**:
   - Виділіть фрагмент тексту мишкою для перекладу та збереження виразу.
4. **Педагогічний блок аналізу реплік**:
   - Аналіз граматики, виправлення помилок та поради щодо природного вживання мови.

---

## 📄 Ліцензія
MIT © Yaroslav Samchuk
