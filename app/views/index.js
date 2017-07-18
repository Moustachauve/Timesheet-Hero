require('angular');
require('angular-material');
require('angular-animate');
require('angular-aria');
require('md-pickers')
const moment = require('moment');
const {ipcRenderer, remote} = require('electron');
const log = require('electron-log');
const drag = require('electron-drag');
const lockedData = require('../lib/lockedData');
const globalSettings = require('../lib/globalSettings');

'use strict'

var titleBarDrag = drag('#titleBar');

var oldConsoleLog = console.log;
console.log = function() {
    if(arguments && arguments[0]) {
        arguments[0] = '[renderer] ' + arguments[0];
    } else {
        arguments = ['[renderer]'];
    }

    log.info(...arguments);
}

const DATE_FORMAT = 'YYYY-MM-DD';

var app = angular.module('afkCalculator',['ngMaterial', 'mdPickers']);

app.config(function($mdThemingProvider) {
  $mdThemingProvider.theme('default')
    .dark()
    .primaryPalette('amber')
    .accentPalette('blue');
  $mdThemingProvider.theme('updateAlert')
    .backgroundPalette('grey')
    .primaryPalette('amber')
    .accentPalette('blue');
});

app.config(function($mdDateLocaleProvider) {
    $mdDateLocaleProvider.firstDayOfWeek = 1;
});

app.controller('indexController', ['$scope', '$interval', '$mdDialog', '$mdToast', '$sce', function($scope, $interval, $mdDialog, $mdToast, $sce) {

    var isCurrentWeekSelected = true;
    var previousDayToday = moment();

    $scope.isWindowMaximized = false;

    $scope.dateFormat = DATE_FORMAT;
    $scope.globalSettings = {};

    $scope.selectedWeekCalendar = $scope.selectedWeek = moment().startOf('isoWeek');
    $scope.weekDays = [];
    $scope.hoursToWork = 0;
    $scope.processedData = {};
    $scope.weekPlan = [];
    $scope.totals = {
        totalWeekly: 0,
        totalLeft: 0,
        totalPercent: 0,
        totalClass: 'not-done'
    }

    $scope.datesAvailable = [];

    var intervalRefresh;

    $scope.isUpdateAvailable = false;
    $scope.checkingForUpdates = false;
    $scope.showUpdateNotAvailable = false;
    var shouldShowUpdateDialog = true;

    globalSettings.load(function(err, data) {
        console.log('loaded global settings, loading locked data...');
        $scope.globalSettings = data;
        lockedData.load($scope.selectedWeek, function(err, data) {
            console.log('locked data loaded.');
            processWeekInformation(null, data);
        });
    });

    getAvailableDatesForCalendar();
    startInterval();

    $scope.changePauseTime = function(key) {
        $scope.processedData.days[key].time.pause = $scope.selectedDayDetails.day.time.pause;
        ipcRenderer.send('setTimeOff', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].time.pause);
        calculateTotal();
        refreshDayInfo();
        $scope.selectedDayDetails = {key: key, day: $scope.processedData.days[key]};
    }

    $scope.setDayOff = function(key) {
        $scope.processedData.days[key].isOff = $scope.selectedDayDetails.day.isOff;
        ipcRenderer.send('setDayOff', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].isOff);
        calculateTotal();
        refreshDayInfo();
        $scope.selectedDayDetails = {key: key, day: $scope.processedData.days[key]};
    }

    $scope.setOverrideStartTime = function(key) {
        $scope.processedData.days[key].overrideStartTime = $scope.selectedDayDetails.day.overrideStartTime;
        ipcRenderer.send('setOverrideStartTime', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].overrideStartTime);
        calculateTotal();
        refreshDayInfo();
        $scope.selectedDayDetails = {key: key, day: $scope.processedData.days[key]};
    }

    $scope.setOverrideStopTime = function(key) {
        $scope.processedData.days[key].overrideStopTime = $scope.selectedDayDetails.day.overrideStopTime;
        ipcRenderer.send('setOverrideStopTime', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].overrideStopTime);
        calculateTotal();
        refreshDayInfo();
        $scope.selectedDayDetails = {key: key, day: $scope.processedData.days[key]};
    }

    $scope.showSettings = function(ev) {
        $scope.showUpdateNotAvailable = false;

        $mdDialog.show({
            controller: SettingsController,
            templateUrl: 'settings.dialog.html',
            scope: $scope,
            preserveScope: true,
            parent: angular.element(document.body),
            targetEvent: ev,
            clickOutsideToClose: true,
            fullscreen: true
        });
    };

    $scope.showDayDetails = function(ev, key, day) {
        $scope.selectedDayDetails = {key: key, day: day};

        $mdDialog.show({
            templateUrl: 'dayDetails.dialog.html',
            controller: DayDetailsController,
            scope: $scope,
            preserveScope: true,
            parent: angular.element(document.body),
            targetEvent: ev,
            clickOutsideToClose: true,
            fullscreen: true
        });
    }

    $scope.showWeekPlan = function(ev) {
        $mdDialog.show({
            templateUrl: 'weekPlan.dialog.html',
            controller: WeekPlanController,
            scope: $scope,
            preserveScope: true,
            parent: angular.element(document.body),
            targetEvent: ev,
            clickOutsideToClose: true,
            fullscreen: true
        });
    }

    $scope.windowMinimize = function() {
        ipcRenderer.send('windowMinimize');
    }

    $scope.windowMaximize = function() {
        ipcRenderer.send('windowMaximize');
    }

    $scope.windowClose = function() {
        ipcRenderer.send('windowClose');
    }

    $scope.setSelectedWeek = function(week) {
        if(!week) {
            week = $scope.selectedWeekCalendar;
        }
        var newDate = moment(week);
        $scope.selectedWeek = newDate.startOf('isoWeek');

        isCurrentWeekSelected = $scope.selectedWeek.isSame(moment().startOf('isoWeek'), 'day');

        if(isCurrentWeekSelected) {
            startInterval();
        } else {
            stopInterval();
        }

        lockedData.load($scope.selectedWeek, function(err, data) {
            processWeekInformation(week, data);
        });
    }
    
    $scope.setHoursToWork = function(key) {
        ipcRenderer.send('setHoursToWork', $scope.selectedWeek.valueOf(), $scope.hoursToWork);
        calculateTotal();
        refreshDayInfo();
    }
    
    $scope.setDefaultHoursToWork = function(key) {
        globalSettings.set('defaultHoursToWork', $scope.globalSettings.defaultHoursToWork);
    }
    
    $scope.setDefaultTimeOff = function(key) {
        globalSettings.set('defaultTimeOff', $scope.globalSettings.defaultTimeOff);
    }

    $scope.saveWeekPlan = function() {
        var weekPlan = {};
        for(dayPlan in $scope.weekPlan) {
            weekPlan[dayPlan] = {
                time: $scope.weekPlan[dayPlan].time
            }
        }
        console.log('saving week plan');
        ipcRenderer.send('saveWeekPlan', $scope.selectedWeek.valueOf(), weekPlan);
    }

    $scope.showUpdateDialog = function() {
        var confirm = $mdDialog.confirm()
            .textContent('Do you want to install the update and restart the app?' + $scope.updateInfo.releaseNotes)
            .ariaLabel('Update available')
            .targetEvent(event)
            .theme();

        $mdDialog.show({
            controller: UpdateAvailableController,
            templateUrl: 'updateAvailable.dialog.html',
            scope: $scope,
            preserveScope: true,
            parent: angular.element(document.body),
            targetEvent: event,
            clickOutsideToClose: false,
        }).then(function() {
            ipcRenderer.send('installUpdate');
        }, function() {
            shouldShowUpdateDialog = false;
            $mdToast.show($mdToast.simple()
                .textContent('You will be asked again next time you open the app.')
                .hideDelay(3000)
            );
        });
    };

    $scope.checkForUpdates = function() {
        $scope.showUpdateNotAvailable = false;
        $scope.checkingForUpdates = true;
        shouldShowUpdateDialog = true;
        
        ipcRenderer.send('checkForUpdates');
    };

    function startInterval() {
        stopInterval();

        console.log('starting Interval...');
        intervalRefresh = $interval(function () {
            if($scope.processedData && $scope.processedData.days) {
                var today = moment();
                if(!$scope.processedData.days[today.format($scope.dateFormat)]) {
                    console.log('Current day is not in processed days. Reloading proccessed days...');
                    console.log('This is probably because we changed week');
                    getAvailableDatesForCalendar();
                    $scope.setSelectedWeek(moment());
                    return;
                }
                calculateTotal();
                refreshDayInfo();
            }
        }, 1000);
    }

    function stopInterval() {
        if(intervalRefresh) {
            console.log('Stopping Interval...');
            $interval.cancel(intervalRefresh);
        }
    }

    function processWeekInformation(date, data) {
        if(!date) {
            date = moment().startOf('isoWeek');
        }
        var returnValue = {
            notified: false,
            days: {}
        };

        var currentDate = moment(date).startOf('isoWeek');
        var today = moment().format($scope.dateFormat);
        var isFuture = false;

        $scope.hoursToWork = data.hoursToWork;
        $scope.weekPlan = data.weekPlan;

        for(var i = 0; i < 7; i++) {
            var arrayKey = currentDate.format($scope.dateFormat);

            // Week Plan
            $scope.weekPlan[arrayKey].date = moment(currentDate);
            $scope.weekPlan[arrayKey].timeMS = $scope.weekPlan[arrayKey].time * 60 * 60 * 1000;

            // Daily hours
            returnValue.days[arrayKey] = {};
            day = returnValue.days[arrayKey];
            day.date = moment(currentDate);
            day.plan = $scope.weekPlan[arrayKey];
            day.isHidden = day.plan.time == 0;
            day.isOff = false;
            day.time = { start: 0, stop: 0, total: 0 };
            day.notified = false;
            day.isToday = arrayKey == today;
            day.isFuture = isFuture;
            if(day.isToday) {
                isFuture = true;
            }
            day.title = currentDate.format('dddd');

            if(data.dates[arrayKey]) {
                day.isOff = data.dates[arrayKey].isOff;
                data.dates[arrayKey].lockTime.sort(function(a, b) {
                    if (a.time < b.time)
                        return -1;
                    if (a.time > b.time)
                        return 1;
                    return 0;
                });
                var reversedData = data.dates[arrayKey].lockTime.slice(0).reverse();

                var start = data.dates[arrayKey].lockTime.find(function(element) {
                    if(!element.lockstate)
                        return element;
                });
                if(start) {
                    day.time.start = moment(start.time, 'HH:mm:ss');
                }

                if(day.isToday) {
                    day.time.stop = null;
                } else {
                    var stop = reversedData.find(function(element) {
                        if(element.lockstate)
                            return element;
                    });
                    if(stop) {
                        day.time.stop = moment(stop.time, 'HH:mm:ss');
                    }
                }
                day.time.pause = data.dates[arrayKey].timeOff;

                if(data.dates[arrayKey].overrideStartTime) {
                    day.time.start = moment(data.dates[arrayKey].overrideStartTime, 'HH:mm:ss');
                    day.overrideStartTime = data.dates[arrayKey].overrideStartTime;
                }
                if(data.dates[arrayKey].overrideStopTime) {
                    day.time.stop = moment(data.dates[arrayKey].overrideStopTime, 'HH:mm:ss');
                    day.overrideStopTime = data.dates[arrayKey].overrideStopTime;
                }
            }
            
            currentDate.add(1, 'day');
        }

        $scope.processedData = returnValue;
        calculateTotal();
        $scope.$apply();
    }

    function calculateTotal() {
        $scope.totals.totalWeekly = moment.duration();
        $scope.totals.totalLeft = 0;
        var today = moment().format($scope.dateFormat);

        for (var key in $scope.processedData.days) {
            var element = $scope.processedData.days[key];
            if(!element.total) {
                element.total = {};
            }

            if(element.isOff) {
                element.total.subtotal = 7 * 60 * 60 * 1000;
                element.total.corrected = element.total.subtotal;
                $scope.totals.totalWeekly.add(element.total.corrected);
                element.total.percentWorked = 100;
                element.total.percentWorkedClass = 'done';
                element.total.timeLeft = 0;
                element.total.timeOver = 0;
            }
            else if(element.time.start && (element.time.stop || element.isToday)) {

                var stopTime = element.time.stop;
                if(element.isToday && !element.overrideStopTime) {
                    stopTime = moment();
                } 
                
                element.total.subtotal = stopTime.diff(element.time.start);


                if(element.total.subtotal > (element.time.pause * 60 * 60 * 1000)) {
                    element.total.corrected = moment(stopTime).subtract(element.time.pause, 'hours').diff(element.time.start);
                } else {
                    element.total.corrected = element.total.subtotal;
                }
                if(element.plan.timeMS > 0) {
                    element.total.percentWorked = (element.total.corrected / element.plan.timeMS) * 100;
                    if(element.total.percentWorked >= 100) {
                        element.total.percentWorkedClass = 'done';
                        element.total.timeOver = element.total.corrected - element.plan.timeMS;
                        element.total.timeLeft = 0;
                    } else if(key == today) {
                        element.total.percentWorkedClass = 'progressing';
                        element.total.timeLeft = element.plan.timeMS - element.total.corrected;
                        element.total.timeOver = 0;
                    } else {
                        element.total.percentWorkedClass = 'not-done';
                        element.total.timeLeft = element.plan.timeMS - element.total.corrected;
                        element.total.timeOver = 0;
                    }
                } else {
                    element.total.percentWorked = 100;
                    element.total.percentWorkedClass = 'done';
                }

                $scope.totals.totalWeekly.add(element.total.corrected);
            } else {
                element.total.percentWorked = 0;
            }
        }

        var timeLeft = moment.duration($scope.hoursToWork, 'hours').subtract($scope.totals.totalWeekly);

        if(!$scope.processedData.notified && timeLeft.hours() >= $scope.hoursToWork) {
            $scope.processedData.notified = true;
            ipcRenderer.send('notify', '', 'You worked enough hours for the week.');
        }

        $scope.totals.totalPercent = ($scope.totals.totalWeekly / ($scope.hoursToWork * 60 * 60 * 1000)) * 100;
        if($scope.totals.totalPercent >= 100) {
            $scope.totals.totalClass = 'done';
        }
        $scope.totals.totalLeft = timeLeft;
    }

    function refreshDayInfo() {
        var today = moment().format($scope.dateFormat);
        var isFuture = false;

        for (var key in $scope.processedData.days) {
            var element = $scope.processedData.days[key];
            element.isToday = key == today;
            element.isFuture = isFuture;
            if(element.isToday) {
                isFuture = true;

                var hoursToWorkToday = $scope.weekPlan[key].time;

                // We are starting a new day!
                if(!element.date.isSame(previousDayToday, 'day')) {
                    console.log("Starting a new day: ", element.date.format('MMMM Do YYYY, h:mm:ss a'));
                    // We are starting a new week!!
                    if(previousDayToday.isoWeek() !== element.date.isoWeek()) {
                        console.log("Starting a new week: ", element.date.format('MMMM Do YYYY, h:mm:ss a'));
                        getAvailableDatesForCalendar();
                        $scope.setSelectedWeek(moment());
                    } else {
                        console.log('reloading current week information');
                        lockedData.load($scope.selectedWeek, function(err, data) {
                            processWeekInformation(null, data);
                        });
                    }
                    previousDayToday = moment(element.date);
                }

                if(!element.notified && element.total.corrected > (hoursToWorkToday * 60 * 60 * 1000)) {
                    element.notified = true;
                    console.log('user worked ' + hoursToWorkToday + 'hrs today. Notifying...');
                    ipcRenderer.send('notify', '', 'You worked enough hours for today (' + hoursToWorkToday + 'h).');
                }
            }
        }
    }

    function getAvailableDatesForCalendar() {
        console.log('Getting available dates for calendar...');
        lockedData.getAvailableDates(function(err, dates) {
            $scope.datesAvailable = {};
            for(var i = 0; i < dates.length; i++) {
                var date = moment(dates[i]);
                for(var j = 0; j < 7; j++) {
                    $scope.datesAvailable[date.format(DATE_FORMAT)] = moment(date);
                    date.add(1, 'day');
                }
            }

            console.log('Received available dates for calendar.');
            $scope.$apply();
        });
    }

    ipcRenderer.on('lockedDataChange', function(event, date, data) {
        date = moment(date);
        if($scope.selectedWeek.isSame(moment(date).startOf('isoWeek'), 'day')) {
            processWeekInformation(date, data);
        }
    });
    ipcRenderer.on('globalSettingsChange', function(event, data) {
        $scope.globalSettings = data;
        $scope.$apply();
    });

    ipcRenderer.on('updateDownloaded', function(event, info) {
        console.log('new update', info);
        $scope.isUpdateAvailable = true;
        $scope.checkingForUpdates = false;

        $scope.updateInfo = info;
        $scope.updateInfo.releaseNotes = $sce.trustAsHtml(info.releaseNotes);

        if(shouldShowUpdateDialog) {
            shouldShowUpdateDialog = false;
            $scope.showUpdateDialog();
        } 
    });

    ipcRenderer.on('updateNotAvailable', function(event, info) {
        console.log('no updates available', info);
        $scope.isUpdateAvailable = false;
        $scope.checkingForUpdates = false;
        $scope.showUpdateNotAvailable = true;
    });

    ipcRenderer.on('windowMaximize', function() {
        $scope.isWindowMaximized = true;
        titleBarDrag();
    });

    ipcRenderer.on('windowUnmaximize', function() {
        $scope.isWindowMaximized = false;
        titleBarDrag = drag('#titleBar');
    });

    globalSettings.on('dataChange', function(date, data) {
        console.log('settings changed');
    });
}]);

app.filter('formatMomentTime', function() {
    return function (momentTime) {
        if(momentTime) {
            return formatIntTwoDigits(momentTime.hours()) + ":" + formatIntTwoDigits(momentTime.minutes()) + ":" + formatIntTwoDigits(momentTime.seconds());
        }
        return '--:--:--';
    };
});

app.filter('formatMomentTimeDurationMS', function() {
    return function (momentTime) {
        if(momentTime) {
            var momentTime = moment.duration(momentTime);
            var hours = momentTime.hours() + (momentTime.days() * 24);
            return formatIntTwoDigits(hours) + ":" + formatIntTwoDigits(momentTime.minutes()) + ":" + formatIntTwoDigits(momentTime.seconds());
        }
        return '--:--:--';
    };
});

app.filter('formatHours', function() {
    return function (hours) {
        if(hours) {
            var momentTime = moment.duration(hours, 'hours');
            var hours = momentTime.hours() + (momentTime.days() * 24);
            return formatIntTwoDigits(hours) + ":" + formatIntTwoDigits(momentTime.minutes()) + ":" + formatIntTwoDigits(momentTime.seconds());
        }
        return '--:--:--';
    };
});

function formatIntTwoDigits(integer) {
    if(integer < 0) {
        return '00';
    }
    return ("0" + integer).slice(-2);
}


/* SETTINGS */

function SettingsController($scope, $mdDialog) {
    $scope.close = function() {
        $mdDialog.hide();
    };

    $scope.isDateSelectionnable = function(date) {
        //return $scope.datesAvailable.indexOf(date);
        var day = moment(date);
        return !!$scope.datesAvailable[day.format(DATE_FORMAT)];
    }
}

/* UPDATE AVAILABLE */

function UpdateAvailableController($scope, $mdDialog) {
    $scope.cancel = function() {
        $mdDialog.cancel();
    };

    $scope.confirm = function() {
        $mdDialog.hide();
    }

    $scope.isDateSelectionnable = function(date) {
        //return $scope.datesAvailable.indexOf(date);
        var day = moment(date);
        return !!$scope.datesAvailable[day.format(DATE_FORMAT)];
    }
}

/* DAY DETAILS */

function DayDetailsController($scope, $mdDialog) {
    $scope.close = function() {
        $mdDialog.hide();
    };

    $scope.isDateSelectionnable = function(date) {
        //return $scope.datesAvailable.indexOf(date);
        var day = moment(date);
        return !!$scope.datesAvailable[day.format(DATE_FORMAT)];
    }
}

/* WEEK PLAN */

function WeekPlanController($scope, $mdDialog) {
    $scope.close = function() {
        $mdDialog.hide();
    };

    $scope.totalTime = function() {
        var total = 0;

        for(dayPlan in $scope.weekPlan) {
            total += $scope.weekPlan[dayPlan].time;
        }

        return total;
    }
}
