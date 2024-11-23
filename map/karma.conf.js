// karma config for `karma-webdriver-launcher` - https://github.com/karma-runner/karma-webdriver-launcher
// address/hostname for selenium server/chrome is `browser`
// locally we want to use default chrome and in CI/CD we want to use selenium server

if (process.env.CI) {
    //let webdriverConfig = {
    //    hostname: 'browser',
    //    port: 4444,
    //};

    module.exports = function (config) {
        config.set({
            files: [
                "src/**/*.spec.ts",
                "src/**/*.d.ts",
            ],
            // ...
            browsers: ['Chrome'],
            customLaunchers: {
                Chrome: {
                    base: 'WebDriver',
                    config: {
                        hostname: 'browser',
                        port: 4444
                    },
                    browserName: 'chrome'
                }
            },
            frameworks: ['jasmine', 'webdriver'],
        });
    }
}
else
{
    module.exports = function (config) {
        config.set({
            // // list of files / patterns to load in the browser
            // files: [
            //     'test/e2e/**/*.js'
            // ],
            // files for angular
            files: [
                "src/**/*.spec.ts",
                "src/**/*.d.ts",
            ],
            // // list of files to exclude
            // exclude: [],
            // // web server port
            // port: 9876,
            // enable / disable colors in the output (reporters and logs)
            colors: true,
            // level of logging
            logLevel: config.LOG_INFO,
            // enable / disable watching file and executing tests whenever any file changes
            autoWatch: false,
            // start these browsers
            browsers: ['Chrome'],
            // Continuous Integration mode
            // if true, Karma captures browsers, runs the tests and exits
            singleRun: true,
            // Concurrency level
            // how many browser should be started simultaneous
            concurrency: Infinity,
            // custom launcher
            customLaunchers: {
                ChromeHeadlessCI: {
                    base: 'ChromeHeadless',
                    flags: ['--no-sandbox']
                }
            },
            // plugins
            plugins: [
                'karma-chrome-launcher',
                'karma-jasmine',
                'karma-jasmine-html-reporter',
            //    'karma-webdriver-launcher'
            ],
            // frameworks to use
            // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
            //frameworks: ['jasmine', 'webdriver'],
            frameworks: ['jasmine'],
            // list of reporters
            //reporters: ['progress', 'kjhtml'],
        });
    }
}