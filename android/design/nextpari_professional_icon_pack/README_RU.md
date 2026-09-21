# Nextpari Professional Premium Icon Pack

Этот пакет сделан для того, чтобы Cursor больше НЕ рисовал иконки сам.

## Источник
Основной профессиональный источник: **Phosphor Icons** (`phosphor-icons/core`), лицензия MIT.

Импортёр скачивает точные официальные SVG-файлы по адресу:
`https://raw.githubusercontent.com/phosphor-icons/core/main/assets/<weight>/<name>-<weight>.svg`

## Что делать
1. Скопировать папку пакета в проект.
2. Положить `import_nextpari_professional_icons.py` в `android/tools/`.
3. Запустить:
   `python android/tools/import_nextpari_professional_icons.py`
4. Получится:
   `android/app/src/main/java/com/nextpari/app/core/ui/icons/ProfessionalPremiumIcons.kt`
5. Cursor должен только подключить эти готовые профессиональные ImageVector к уже существующему Premium registry.
6. Legacy НЕ удалять.

## Цвета спортивных иконок в Premium
- Все: #16D982
- Футбол: белый на dark / #0F172A на light
- Теннис: #C7F000
- Баскетбол: #FF7A1A
- Хоккей: белый на dark / #0F172A на light
- Волейбол: белый на dark / #0F172A на light
- Esports: #22F39A
- Остальные: текущий Nextpari green

В папке есть утверждённый референс-борд.
