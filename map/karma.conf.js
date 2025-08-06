// karma config for `karma-webdriver-launcher` - https://github.com/karma-runner/karma-webdriver-launcher
// address/hostname for selenium server/chrome is `browser`
// locally we want to use default chrome and in CI/CD we want to use selenium server

console.log("process.env.CI: ", process.env.CI);


module.exports = function (config) {
    const isCI = process.env.CI;
    
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
        preprocessors: {
            'src/**/*.ts': ['karma-typescript'],
            'src/**/*.spec.ts': ['karma-typescript']
        },
        frameworks: ['jasmine', 'karma-typescript'],
        plugins: [
            'karma-jasmine',
            'karma-chrome-launcher',
            'karma-typescript',
            'karma-webdriver-launcher'
        ],
        karmaTypescriptConfig: {
            tsconfig: './tsconfig.json',
            compilerOptions: {
                sourceMap: true,
                target: "ES6"
            }
        },
        // // list of files to exclude
        // exclude: [],
        // // web server port
        // port: 9876,
        // enable / disable colors in the output (reporters and logs)
        colors: true,
    
        // enable / disable watching file and executing tests whenever any file changes
        autoWatch: false,
        watch: false,
    
        // Continuous Integration mode
        // if true, Karma captures browsers, runs the tests and exits
        singleRun: true,
        
        // level of logging
        logLevel: config.LOG_INFO,

        // start these browsers
        //browsers: ['Chrome'],
        //browsers: ['ChromeHeadlessCI'],
        browsers: isCI ? ['ChromeHeadless'] : ['Chrome'],

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