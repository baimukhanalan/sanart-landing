# SANART — лендинг музыкальной школы (Алматы)

Анимированный одностраничный сайт для [@sanaart.kz](https://www.instagram.com/sanaart.kz/): вокал, гитара, фортепиано. Есть тест типа голоса через микрофон.

**Сайт:** https://sanart-almaty.netlify.app

## Стек
Статический HTML/CSS/JS без сборки. GSAP + ScrollTrigger и Lenis подключены с CDN, звук синтезируется через WebAudio.

- `index.html` — разметка всех секций
- `css/style.css` — стили (масштаб на золотом сечении, glassmorphism)
- `js/main.js` — курсор, «струна» на фоне, звук, сцены прокрутки
- `js/voice-test.js` — определение типа голоса (бас … сопрано) по микрофону или по клавишам
- `js/sections.js` — колода кейсов и круг команды
- `_headers` (Netlify) / `vercel.json` (Vercel) — разрешение микрофона и кэш

## Локальный запуск
```bash
python3 -m http.server 5173
```
Микрофон работает только на `localhost` или по HTTPS.
