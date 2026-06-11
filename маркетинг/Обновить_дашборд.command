#!/bin/bash
# Двойной клик в Finder: пересобирает маркетинг-дашборд из документов и открывает его.
# Зависимость openpyxl ставится автоматически при первом запуске.
cd "$(dirname "$0")" || exit 1

if ! python3 -c "import openpyxl" 2>/dev/null; then
  echo "Первый запуск: ставлю openpyxl (нужен для чтения xlsx)…"
  pip3 install --user openpyxl --break-system-packages 2>/dev/null \
    || pip3 install --user openpyxl \
    || { echo "⚠ Не удалось установить openpyxl автоматически."; \
         echo "  Вручную: pip3 install openpyxl --break-system-packages"; \
         read -r -p "Enter — закрыть…"; exit 1; }
fi

echo "Пересобираю дашборд из 00_Сводной_панели + 22 + 25 + 29…"
if python3 tools/build_dashboard.py; then
  open "00_Дашборд.html"
else
  echo "⚠ Сборка упала — текст ошибки выше."
  read -r -p "Enter — закрыть…"
fi
