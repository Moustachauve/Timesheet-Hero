const $ = require('jquery');
require('angular');
require('angular-material');
require('angular-animate');
require('angular-aria');
const moment = require('moment');
const {ipcRenderer, remote} = require('electron');  
const lockedData = require('../lib/lockedData');
const globalSettings = require('../lib/globalSettings');

'use strict'

const DATE_FORMAT = 'YYYY-MM-DD';

var app = angular.module('afkCalculator',['ngMaterial']);

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
    $scope.dateFormat = DATE_FORMAT;
    $scope.globalSettings = {};

    $scope.selectedWeekCalendar = $scope.selectedWeek = moment().startOf('isoWeek');
    $scope.weekDays = [];
    $scope.hoursToWork = 0;
    $scope.processedData = {};
    $scope.totalWeekly = 0;
    $scope.totalLeft = 0;

    $scope.datesAvailable = [];

    var intervalRefresh;

    globalSettings.load(function(err, data) {
        $scope.globalSettings = data;
        lockedData.load($scope.selectedWeek, function(err, data) {
            console.log('wow data', data);
            processWeekInformation(null, data);
        });
    });

    lockedData.getAvailableDates(function(err, dates) {
        $scope.datesAvailable = {};
        for(var i = 0; i < dates.length; i++) {
            var date = moment(dates[i]);
            for(var j = 0; j < 7; j++) {
                $scope.datesAvailable[date.format(DATE_FORMAT)] = moment(date);
                date.add(1, 'day');
            }
        }
        console.log($scope.datesAvailable);
        $scope.$apply();
    });

    ipcRenderer.send('getDatesAvailable');
    startInterval();

    $scope.changePauseTime = function(key) {
        ipcRenderer.send('setTimeOff', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].time.pause);
        calculateTotal();
        refreshDayInfo();
    }

    $scope.setDayOff = function(key) {
        ipcRenderer.send('setDayOff', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].isOff);
        calculateTotal();
        refreshDayInfo();
    }

    $scope.showAdvanced = function(ev) {
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
            console.log('wow data', data);
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

    function startInterval() {
        if(intervalRefresh) {
            $interval.cancel(intervalRefresh);
        }
        intervalRefresh = $interval(function () {
            if($scope.processedData && $scope.processedData.days) {
                var today = moment();
                if(!$scope.processedData.days[today.format($scope.dateFormat)]) {
                    $scope.processedData.days[today.format($scope.dateFormat)] = {};
                    $scope.processedData.days[today.format($scope.dateFormat)].time = {};
                }
                calculateTotal();
                refreshDayInfo();
            }
        }, 1000);
    }

    function stopInterval() {
        if(intervalRefresh) {
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

        for(var i = 0; i < 7; i++) {
            var arrayKey = currentDate.format($scope.dateFormat);

            returnValue.days[arrayKey] = {};
            day = returnValue.days[arrayKey];
            day.date = moment(currentDate);
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
            }
            
            currentDate.add(1, 'day');
        }
        $scope.processedData = returnValue;
        calculateTotal();
        $scope.$apply();
    }

    function calculateTotal() {
        $scope.totalWeekly = moment.duration();
        $scope.totalLeft = 0;

        for (var key in $scope.processedData.days) {
            var element = $scope.processedData.days[key];
            if(!element.total) {
                element.total = {};
            }

            if(element.isOff) {
                element.total.subtotal = 7 * 60 * 60 * 1000;
                element.total.corrected = element.total.subtotal;
                $scope.totalWeekly.add(element.total.corrected);
            }
            else if(element.time.stop || element.isToday) {

                var stopTime = element.time.stop;
                if(element.isToday) {
                    stopTime = moment();
                } 
                
                element.total.subtotal = stopTime.diff(element.time.start);


                if(element.total.subtotal > (element.time.pause * 60 * 60 * 1000)) {
                    element.total.corrected = moment(stopTime).subtract(element.time.pause, 'hours').diff(element.time.start);
                } else {
                    element.total.corrected = element.total.subtotal;
                }
                $scope.totalWeekly.add(element.total.corrected);
            }
        }

        var timeLeft = moment.duration($scope.hoursToWork, 'hours').subtract($scope.totalWeekly);

        if(!$scope.processedData.notified && timeLeft.hours() >= $scope.hoursToWork) {
            $scope.processedData.notified = true;
            ipcRenderer.send('notify', '', 'You worked enough hours for the week.');
        }

        $scope.totalLeft = timeLeft;
    }

    function refreshDayInfo() {
        var today = moment().format($scope.dateFormat);
        var isFuture = false;

        var hoursToWorkDaily = $scope.hoursToWork / 5;

        for (var key in $scope.processedData.days) {
            var element = $scope.processedData.days[key];
            element.isToday = key == today;
            element.isFuture = isFuture;
            if(element.isToday) {
                isFuture = true;

                if(!element.date.isSame(previousDayToday, 'day')) {
                    previousDayToday = moment(element.date);
                    lockedData.load($scope.selectedWeek, function(err, data) {
                        processWeekInformation(null, data);
                    });
                }

                if(!element.notified && element.total.corrected > (hoursToWorkDaily * 60 * 60 * 1000)) {
                    element.notified = true;
                    ipcRenderer.send('notify', '', 'You worked enough hours for today (' + hoursToWorkDaily + 'h).');
                }
            }
        }
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
        var confirm = $mdDialog.confirm()
            .textContent('Do you want to install the update and restart the app?' + info.releaseNotes)
            .ariaLabel('Update available')
            .targetEvent(event)
            .theme();

        $scope.updateInfo = info;
        $scope.updateInfo.releaseNotes = $sce.trustAsHtml(info.releaseNotes);

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
            $mdToast.show($mdToast.simple()
                .textContent('You will be asked again next time you open the app.')
                .hideDelay(3000)
            );
        });
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