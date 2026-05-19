// Karma configuration for unit tests.
// Tests: только *.service.spec.ts (ограничено через tsconfig.spec.json).
// Coverage: только *.service.ts (фильтруется через coverageReporter.include).
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/fluxpilot-workflow-lab'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcovonly' },
      ],
      // Включаем в отчёт ТОЛЬКО сервисы (*.service.ts).
      // karma-coverage поддерживает поле `include` (массив минимэтч-паттернов
      // относительно cwd, поэтому добавляем `**/`-обёртку).
      includeAllSources: false,
      check: { global: {} },
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadlessCI'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu'],
      },
    },
    restartOnFileChange: true,
    singleRun: false,
  });
};
