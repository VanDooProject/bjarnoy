// karma config for `karma-webdriver-launcher` - https://github.com/karma-runner/karma-webdriver-launcher
// address/hostname for selenium server/chrome is `browser`
// locally we want to use default chrome and in CI/CD we want to use selenium server

console.log("process.env.CI: ", process.env.CI);


module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('karma-junit-reporter'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {},
      clearContext: false
    },
    jasmineHtmlReporter: {
      suppressAll: true
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcovonly', subdir: '.', file: 'lcov.info' }
      ]
    },
    junitReporter: {
      outputDir: 'test-results',
      outputFile: 'junit.xml',
      useBrowserName: false
    },
    reporters: ['progress', 'kjhtml', 'junit'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    },
    browsers: ['ChromeHeadlessNoSandbox'],
    singleRun: true,
    restartOnFileChange: true,
    listenAddress: 'localhost',
    hostname: 'localhost'
  });
};

        // Concurrency level
        // how many browser should be started simultaneous
        //concurrency: Infinity,
        concurrency: isCI ? 1 : Infinity,


        
        // custom launchers for CI
        customLaunchers: isCI ? {
            ChromeHeadless: {
                base: 'WebDriver',
                config: {
                    hostname: 'browser',
                    port: 4444, // 4444=selenium,7900 vnc port
                    // https://stackoverflow.com/questions/58481584/karma-not-able-to-launch-browser-using-karma-webdriver-launcher
                    path: '/wd/hub', // https://www.npmjs.com/package/wd#defaults
                },
                browserName: 'chrome',
                //version: 'ANY',
                //platform: 'ANY',
                
                //spec: {
                //    platform: 'ANY',
                //    testName: 'Karma test',
                //    tags: [],
                //    version: '',
                //    base: 'WebDriver',
                //    browserName: 'chrome'
                //  },
                testName: '',
                platform: '',
            }
        } : {},


        // plugins
        //plugins: [
        //    'karma-chrome-launcher',
        //    'karma-jasmine',
        //    'karma-jasmine-html-reporter',
        ////    'karma-webdriver-launcher'
        //],
        // use only one launcher plugin depending on CI
        plugins: isCI ? [
            'karma-jasmine',
            'karma-jasmine-html-reporter',
            'karma-webdriver-launcher',
        ] : [
            'karma-jasmine',
            'karma-jasmine-html-reporter',
            'karma-chrome-launcher',
        ],

        // frameworks to use
        // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
        //frameworks: ['jasmine', 'webdriver'],
        frameworks: ['jasmine'],
        // list of reporters
        //reporters: ['progress', 'kjhtml'],
    });
}