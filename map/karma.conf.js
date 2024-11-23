// karma config for `karma-webdriver-launcher` - https://github.com/karma-runner/karma-webdriver-launcher
// address/hostname for selenium server/chrome is `browser`
// locally we want to use default chrome and in CI/CD we want to use selenium server

console.log("process.env.CI: ", process.env.CI);

var baseSettings = {
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

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,
};

if (process.env.CI) {
    //let webdriverConfig = {
    //    hostname: 'browser',
    //    port: 4444,
    //};

    module.exports = function (config) {
        config.set({
            ...baseSettings,

            // level of logging
            logLevel: config.LOG_INFO,

            // ...
            browsers: ['ChromeHeadless'],
            customLaunchers: {
                ChromeHeadless: {
                    base: 'WebDriver',
                    config: {
                        hostname: 'browser',
                        port: 4444
                    },
                    browserName: 'chrome'
                }
            },

            plugins: [
                'karma-chrome-launcher',
                'karma-jasmine',
                'karma-jasmine-html-reporter',
                'karma-webdriver-launcher'
            ],

            frameworks: ['jasmine', 'webdriver'],
        });
    }
}
else
{
    module.exports = function (config) {
        config.set({
            ...baseSettings,
            
            // level of logging
            logLevel: config.LOG_INFO,

            // start these browsers
            browsers: ['Chrome'],
            //browsers: ['ChromeHeadlessCI'],

            // Concurrency level
            // how many browser should be started simultaneous
            concurrency: Infinity,

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