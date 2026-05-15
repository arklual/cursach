// sockjs-client (используется в WorkflowWsService) ждёт Node.js-глобал `global`.
// Без полифилла ленивый чанк редактора падает с ReferenceError на этапе загрузки модуля,
// роутер откатывает навигацию и список не обновляется.
// Файл подключается через angular.json -> projects.fluxpilot-workflow-lab.architect.build.options.polyfills.
(globalThis as unknown as { global: typeof globalThis }).global = globalThis;
