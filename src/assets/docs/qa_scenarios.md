## QA сценарии

1. **Simulate 500 users**
   - Нажать `Simulate 500 users`.
   - Проверить рост бейджей `Reached/Clicked/p̂` на каждой ноде.
   - Открыть Node Analytics → график p̂(t) растёт монотонно.

2. **Run with sample payload**
   - Нажать `Run sample payload`.
   - Открыть Execution log — присутствует запись про прохождение payload.
   - Проверить таблицу "кто дошёл" для стартовой ноды.

3. **Traffic allocation validation**
   - Открыть A/B Config.
   - Изменить вес варианта B на 70% — сумма остаётся 100%.
   - Randomization переключается между режимами без ошибки.

4. **Stopping rules alerts**
   - В инспекторе выбрать Sequential.
   - Проверить наличие предупреждения про FDR.

5. **Edge cases**
   - Удалить провод между нодами, запустить симуляцию — лог показывает предупреждение об ошибке маршрута.
   - Форсировать timeout: установить успех ноды = 0, наблюдать статус pending/error.

6. **Export events**
   - Открыть Analytics → `Export sample payloads`.
   - Проверить скачанный JSON ≤ 4KB на запись, user_id захеширован.
