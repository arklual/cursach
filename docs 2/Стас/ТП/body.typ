= ОБЩИЕ СВЕДЕНИЯ
== Наименование программы
Программа «Платформа для no-code автоматизации бизнес-процессов» (условное обозначение — «FluxPilot»). Клиентская часть.

== Область применения
Настоящий документ является индивидуальной частью текста программы к командной курсовой работе (общая часть — RU.17701729.09.03-04 12 01-1) и относится к клиентской части программного продукта, разрабатываемой студентом группы БДРИП241 Гаврилиным С.В.

== Наименование файла
Исходный код клиентской части размещён в репозитории #link("https://github.com/arklual/cursach")[`github.com/arklual/cursach`] в директории `frontend/`.

= СТРУКТУРА ИСХОДНОГО КОДА
== Структура директории frontend
Исходный код клиентской части организован в соответствии с таблицей 1.

#figure(
    caption: [Структура директории frontend],
    table(
        columns: (40mm, auto),
        align: (left, left),
        inset: (x: 3mm, y: 2mm),
        stroke: 0.5pt,
        table.header([*Файл/директория*], [*Назначение*]),
        [src/app/], [Исходный код приложения],
        [src/app/pages/], [Компоненты страниц (workflow-editor, workflows-list, not-found)],
        [src/app/components/], [Переиспользуемые компоненты (11 компонентов)],
        [src/app/services/], [Сервисы уровня приложения (workflow, validator, execution)],
        [src/app/core/], [Базовая инфраструктура (API, WebSocket, утилиты)],
        [src/app/models/], [Доменные типы и интерфейсы],
        [src/environments/], [Конфигурация окружений (development, production)],
        [src/assets/], [Статические ресурсы (JSON схемы, иконки)],
        [e2e/], [End-to-end тесты на Playwright (9 сценариев)],
        [angular.json], [Конфигурация Angular CLI],
        [package.json], [Зависимости npm и скрипты],
        [tsconfig.json], [Конфигурация TypeScript],
        [playwright.config.ts], [Конфигурация Playwright],
    )
)

== Основные компоненты
Перечень основных компонентов клиентской части приведён в таблице 2.

#figure(
    caption: [Основные компоненты клиентской части],
    table(
        columns: (60mm, 45mm, auto),
        align: (left, left, left),
        inset: (x: 3mm, y: 2mm),
        stroke: 0.5pt,
        table.header([*Компонент*], [*Файл*], [*Назначение*]),
        [WorkflowEditorComponent], [workflow-editor.component.ts], [Основная страница редактора workflow],
        [WorkflowCanvasComponent], [workflow-canvas.component.ts], [Интерактивный холст с SVG, drag-and-drop, зум, панорамирование],
        [PaletteComponent], [palette.component.ts], [Палитра типов узлов с drag-and-drop],
        [InspectorComponent], [inspector.component.ts], [Инспектор конфигурации с динамическими формами],
        [RunsPanelComponent], [runs-panel.component.ts], [Панель истории запусков workflow],
        [AnalyticsPanelComponent], [analytics-panel.component.ts], [Панель продуктовой A/B-аналитики],
        [SnapshotsPanelComponent], [snapshots-panel.component.ts], [Панель управления снапшотами],
        [ExecutionPanelComponent], [execution-panel.component.ts], [Панель подробного просмотра запуска],
        [ModalComponent], [modal.component.ts], [Универсальный модальный контейнер],
        [OnboardingTourComponent], [onboarding-tour.component.ts], [Онбординг-тур для новых пользователей],
        [WorkflowNodeComponent], [workflow-node.component.ts], [Отображение узла на холсте],
        [CanvasEmptyComponent], [canvas-empty.component.ts], [Подсказка для пустого холста],
    )
)

== Основные сервисы
Перечень основных сервисов клиентской части приведён в таблице 3.

#figure(
    caption: [Основные сервисы клиентской части],
    table(
        columns: (60mm, 45mm, auto),
        align: (left, left, left),
        inset: (x: 3mm, y: 2mm),
        stroke: 0.5pt,
        table.header([*Сервис*], [*Файл*], [*Назначение*]),
        [WorkflowService], [workflow.service.ts], [UI-состояние графа (узлы, рёбра, активная нода)],
        [WorkflowValidatorService], [workflow-validator.service.ts], [Валидация графа перед сохранением],
        [ExecutionService], [execution.service.ts], [Исполнение workflow (REST API вызовы)],
        [WorkflowWsService], [workflow-ws.service.ts], [WebSocket-клиент (STOMP поверх SockJS)],
        [WorkflowFacade], [workflow.facade.ts], [REST API фасад для работы с workflow],
        [TriggerApiService], [trigger.api.ts], [REST API фасад для работы с триггерами],
    )
)

== Технологический стек
Клиентская часть реализована с использованием следующих технологий: TypeScript 5.6, Angular 19.2, RxJS 7.8, Angular CDK 19.2 (DragDropModule), Chart.js 4.4.6, `@stomp/stompjs` 7.3.0, sockjs-client 1.6.1, openapi-typescript 7.13.0.

== Объём исходного кода
Общий объём исходного кода клиентской части составляет около 8 500 строк TypeScript (без учёта тестов и конфигурационных файлов). Из них: компоненты — около 4 200 строк, сервисы — около 1 100 строк, API фасады и мапперы — около 900 строк, модели и типы — около 600 строк, тесты — около 1 700 строк.

= ССЫЛКА НА РЕПОЗИТОРИЙ
Исходный код клиентской части размещён в репозитории:

https://github.com/arklual/cursach

Директория клиентской части: `frontend/`

Доступ к репозиторию: публичный (open source).

#set heading(numbering: none)
= СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
1. Angular Documentation [Электронный ресурс] / Google. — URL: https://angular.dev/ (дата обращения: 10.12.2025).
2. GitHub Repository [Электронный ресурс]. — URL: https://github.com/arklual/cursach (дата обращения: 19.05.2026).
