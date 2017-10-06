'use strict'

/* global angular */
require('angular')
require('angular-material')
require('angular-animate')
require('angular-aria')
require('md-pickers')
const moment = require('moment')
const {ipcRenderer, remote, shell} = require('electron')
const log = require('electron-log')
const drag = require('electron-drag')
const lockedData = require('../lib/lockedData')
const globalSettings = require('../lib/globalSettings')

var titleBarDrag = drag('#titleBar')

// var oldConsoleLog = console.log
console.log = function (...args) {
  if (args && args[0]) {
    args[0] = '[renderer] ' + args[0]
  } else {
    args = ['[renderer]']
  }

  log.info(...args)
}

const DATE_FORMAT = 'YYYY-MM-DD'

// eslint-disable-next-line no-undef
var app = angular.module('afkCalculator', ['ngMaterial', 'mdPickers'])

app.config(function ($mdThemingProvider) {
  $mdThemingProvider.theme('default')
    .dark()
    .primaryPalette('amber')
    .accentPalette('blue')
  $mdThemingProvider.theme('updateAlert')
    .backgroundPalette('grey')
    .primaryPalette('amber')
    .accentPalette('blue')
})

app.config(function ($mdDateLocaleProvider) {
  $mdDateLocaleProvider.firstDayOfWeek = 1
})

app.controller('indexController', ['$scope', '$interval', '$mdDialog', '$mdToast', '$sce', function ($scope, $interval, $mdDialog, $mdToast, $sce) {
  var isCurrentWeekSelected = true
  var previousDayToday = moment()

  $scope.appVersion = remote.app.getVersion()

  $scope.isWindowMaximized = false

  $scope.dateFormat = DATE_FORMAT
  $scope.globalSettings = {}

  $scope.selectedWeekCalendar = $scope.selectedWeek = moment().startOf('isoWeek')
  $scope.weekDays = []
  $scope.hoursToWork = {time: 0, hours: 0, minutes: 0}
  $scope.processedData = {}
  $scope.weekPlan = []
  $scope.totals = {
    totalWeekly: 0,
    totalLeft: 0,
    totalPercent: 0,
    totalClass: 'not-done'
  }

  $scope.hasNextWeek = false
  $scope.hasPreviousWeek = false

  $scope.datesAvailable = []

  var intervalRefresh
  var saveWeekPlanDebounce

  var notifiedForDayDone = false
  var notifiedForWeekDone = false

  $scope.isUpdateAvailable = false
  $scope.checkingForUpdates = false
  $scope.showUpdateNotAvailable = false
  var shouldShowUpdateDialog = true

  $scope.isWindows = process.platform === 'win32'

  globalSettings.load(function (err, data) {
    if (err) { throw err }
    console.log('loaded global settings, loading locked data...')
    applyGlobalSettings(data)
    lockedData.load($scope.selectedWeek, function (err, data) {
      if (err) { throw err }
      console.log('locked data loaded.')
      processWeekInformation(null, data)
    })
  })

  $scope.changePauseTime = function (key) {
    var hours = $scope.selectedDayDetails.pausePart.hours || 0
    var minutes = ($scope.selectedDayDetails.pausePart.minutes || 0) / 60
    $scope.processedData.days[key].time.pause = hours + minutes
    ipcRenderer.send('setTimeOff', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].time.pause)
    calculateTotal()
    refreshDayInfo()
    setSelectedDayDetails(key)
  }

  $scope.setDayOff = function (key) {
    $scope.processedData.days[key].isOff = $scope.selectedDayDetails.day.isOff
    ipcRenderer.send('setDayOff', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].isOff)
    calculateTotal()
    refreshDayInfo()
    setSelectedDayDetails(key)
  }

  $scope.setOverrideStartTime = function (key) {
    $scope.processedData.days[key].overrideStartTime = $scope.selectedDayDetails.day.overrideStartTime
    ipcRenderer.send('setOverrideStartTime', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].overrideStartTime)
    calculateTotal()
    refreshDayInfo()
    setSelectedDayDetails(key)
  }

  $scope.setOverrideStopTime = function (key) {
    $scope.processedData.days[key].overrideStopTime = $scope.selectedDayDetails.day.overrideStopTime
    ipcRenderer.send('setOverrideStopTime', $scope.processedData.days[key].date.valueOf(), $scope.processedData.days[key].overrideStopTime)
    calculateTotal()
    refreshDayInfo()
    setSelectedDayDetails(key)
  }

  $scope.showSettings = function (ev) {
    $scope.showUpdateNotAvailable = false

    $mdDialog.show({
      controller: SettingsController,
      templateUrl: 'settings.dialog.html',
      scope: $scope,
      preserveScope: true,
      parent: angular.element(document.body),
      targetEvent: ev,
      clickOutsideToClose: true,
      fullscreen: true
    })
  }

  $scope.showDayDetails = function (ev, key, day) {
    setSelectedDayDetails(key)

    $mdDialog.show({
      templateUrl: 'dayDetails.dialog.html',
      controller: DayDetailsController,
      scope: $scope,
      preserveScope: true,
      parent: angular.element(document.body),
      targetEvent: ev,
      clickOutsideToClose: true,
      fullscreen: true
    })
  }

  $scope.showWeekPlan = function (ev) {
    $mdDialog.show({
      templateUrl: 'weekPlan.dialog.html',
      controller: WeekPlanController,
      scope: $scope,
      preserveScope: true,
      parent: angular.element(document.body),
      targetEvent: ev,
      clickOutsideToClose: true,
      fullscreen: true
    })
  }

  $scope.windowMinimize = function () {
    ipcRenderer.send('windowMinimize')
  }

  $scope.windowMaximize = function () {
    ipcRenderer.send('windowMaximize')
  }

  $scope.windowClose = function () {
    ipcRenderer.send('windowClose')
  }

  $scope.setSelectedWeek = function (week) {
    if (!week) {
      week = $scope.selectedWeekCalendar
    }
    var newDate = moment(week)
    $scope.selectedWeek = newDate.startOf('isoWeek')

    isCurrentWeekSelected = $scope.selectedWeek.isSame(moment().startOf('isoWeek'), 'day')

    if (isCurrentWeekSelected) {
      startInterval()
    } else {
      stopInterval()
    }

    var allDates = Object.keys($scope.datesAvailable)
    var oldestDate = moment(allDates[0]).startOf('isoWeek')
    var mostRecentDate = moment(allDates[allDates.length - 1]).startOf('isoWeek')
    var currentDate = moment(newDate).startOf('isoWeek')

    $scope.hasNextWeek = !mostRecentDate.isSame(currentDate.startOf('isoWeek'), 'day')
    $scope.hasPreviousWeek = !oldestDate.isSame(currentDate.startOf('isoWeek'), 'day')

    lockedData.load($scope.selectedWeek, function (err, data) {
      if (err) { throw err }
      processWeekInformation(week, data)
      recalculateWeekPlan()
    })
  }

  $scope.setHoursToWork = function (key) {
    var hours = $scope.hoursToWork.hours || 0
    var minutes = +((($scope.hoursToWork.minutes || 0) / 60).toFixed(2))
    $scope.hoursToWork.time = hours + minutes
    ipcRenderer.send('setHoursToWork', $scope.selectedWeek.valueOf(), $scope.hoursToWork.time)
    calculateTotal()
    refreshDayInfo()
  }

  $scope.setDefaultHoursToWork = function (key) {
    var hours = $scope.globalSettings.defaultHoursToWork.hours || 0
    var minutes = +((($scope.globalSettings.defaultHoursToWork.minutes || 0) / 60).toFixed(2))
    $scope.globalSettings.defaultHoursToWork.time = hours + minutes
    globalSettings.set('defaultHoursToWork', $scope.globalSettings.defaultHoursToWork.time)
  }

  $scope.setWeekPlanMode = function (key) {
    globalSettings.set('weekPlanMode', $scope.globalSettings.weekPlanMode)
    $scope.saveWeekPlan()
  }

  $scope.setDefaultTimeOff = function (key) {
    var hours = $scope.globalSettings.defaultTimeOff.hours || 0
    var minutes = +((($scope.globalSettings.defaultTimeOff.minutes || 0) / 60).toFixed(2))
    $scope.globalSettings.defaultTimeOff.time = hours + minutes

    globalSettings.set('defaultTimeOff', $scope.globalSettings.defaultTimeOff.time)
  }

  $scope.saveWeekPlan = function () {
    // setTimeout so we have some sort of debounce when sliding
    clearTimeout(saveWeekPlanDebounce)
    saveWeekPlanDebounce = setTimeout(function () {
      if ($scope.globalSettings.weekPlanMode === 'auto') {
        recalculateWeekPlan()
      }

      var weekPlan = {}
      for (var dayPlan in $scope.weekPlan) {
        var useDay = $scope.weekPlan[dayPlan].time > 0
        if ($scope.globalSettings.weekPlanMode === 'auto') {
          useDay = $scope.weekPlan[dayPlan].useDay
        }

        weekPlan[dayPlan] = {
          time: $scope.weekPlan[dayPlan].time,
          useDay: useDay
        }
      }

      console.log('saving week plan')
      ipcRenderer.send('saveWeekPlan', $scope.selectedWeek.valueOf(), weekPlan)
    }, 350)
  }

  $scope.showUpdateDialog = function () {
    $mdDialog.show({
      controller: UpdateAvailableController,
      templateUrl: 'updateAvailable.dialog.html',
      scope: $scope,
      preserveScope: true,
      parent: angular.element(document.body),
      targetEvent: null,
      clickOutsideToClose: false
    }).then(function () {
      ipcRenderer.send('installUpdate')
    }, function () {
      shouldShowUpdateDialog = false
      $mdToast.show($mdToast.simple()
        .textContent('You will be asked again next time you open the app.')
        .hideDelay(3000)
      )
    })
  }

  $scope.checkForUpdates = function () {
    $scope.showUpdateNotAvailable = false
    $scope.checkingForUpdates = true
    shouldShowUpdateDialog = true

    ipcRenderer.send('checkForUpdates')
  }

  $scope.resetUI = function () {
    ipcRenderer.send('resetUI')
  }

  $scope.showPreviousWeek = function () {
    if ($scope.hasPreviousWeek) {
      var newWeek = moment($scope.selectedWeek).add(-1, 'week')
      $scope.setSelectedWeek(newWeek)
    }
  }

  $scope.showNextWeek = function () {
    if ($scope.hasNextWeek) {
      var newWeek = moment($scope.selectedWeek).add(1, 'week')
      $scope.setSelectedWeek(newWeek)
    }
  }

  $scope.isDateSelectionnable = function (date) {
    var day = moment(date)
    return !!$scope.datesAvailable[day.format(DATE_FORMAT)]
  }

  $scope.round = function (number, precision = 0) {
    var multiplier = Math.pow(10, precision || 0)
    return Math.round(number * multiplier) / multiplier
  }

  function startInterval () {
    stopInterval()

    console.log('starting Interval...')
    intervalRefresh = $interval(function () {
      if ($scope.processedData && $scope.processedData.days) {
        var today = moment()
        if (!$scope.processedData.days[today.format($scope.dateFormat)]) {
          console.log('Current day is not in processed days. Reloading proccessed days...')
          console.log('This is probably because we changed week')
          getAvailableDatesForCalendar(function () {
            $scope.setSelectedWeek(moment())
          })
          return
        }
        calculateTotal()
        refreshDayInfo()
      }
    }, 1000)
  }

  function stopInterval () {
    if (intervalRefresh) {
      console.log('Stopping Interval...')
      $interval.cancel(intervalRefresh)
    }
  }

  function processWeekInformation (date, data) {
    if (!date) {
      date = moment().startOf('isoWeek')
    }
    var returnValue = {
      days: {}
    }

    var currentDate = moment(date).startOf('isoWeek')
    var today = moment().format($scope.dateFormat)
    var isFuture = false

    var minutes = (data.hoursToWork % 1) * 60
    var hours = Math.trunc(data.hoursToWork)

    $scope.hoursToWork = {
      time: data.hoursToWork,
      hours: hours,
      minutes: Math.round(minutes)
    }
    $scope.weekPlan = data.weekPlan

    for (var i = 0; i < 7; i++) {
      var arrayKey = currentDate.format($scope.dateFormat)

      // Week Plan
      $scope.weekPlan[arrayKey].date = moment(currentDate)
      $scope.weekPlan[arrayKey].timeMS = $scope.weekPlan[arrayKey].time * 60 * 60 * 1000

      // Daily hours
      returnValue.days[arrayKey] = {}
      var day = returnValue.days[arrayKey]
      day.date = moment(currentDate)
      day.plan = $scope.weekPlan[arrayKey]
      day.isOff = false
      day.time = { start: 0, stop: 0, total: 0 }
      day.isToday = arrayKey === today
      day.isFuture = isFuture
      if (day.isToday) {
        isFuture = true
      }
      day.title = currentDate.format('dddd')

      if (data.dates[arrayKey]) {
        day.isOff = data.dates[arrayKey].isOff
        data.dates[arrayKey].lockTime.sort(function (a, b) {
          if (a.time < b.time) { return -1 }
          if (a.time > b.time) { return 1 }
          return 0
        })
        var reversedData = data.dates[arrayKey].lockTime.slice(0).reverse()

        var start = data.dates[arrayKey].lockTime.find(function (element) {
          if (!element.lockstate) { return element }
        })
        if (start) {
          day.time.start = moment(start.time, 'HH:mm:ss')
        }

        if (day.isToday) {
          day.time.stop = null
        } else {
          var stop = reversedData.find(function (element) {
            if (element.lockstate) { return element }
          })
          if (stop) {
            day.time.stop = moment(stop.time, 'HH:mm:ss')
          }
        }
        day.time.pause = data.dates[arrayKey].timeOff

        if (data.dates[arrayKey].overrideStartTime) {
          day.time.start = moment(data.dates[arrayKey].overrideStartTime, 'HH:mm:ss')
          day.overrideStartTime = data.dates[arrayKey].overrideStartTime
        }
        if (data.dates[arrayKey].overrideStopTime) {
          day.time.stop = moment(data.dates[arrayKey].overrideStopTime, 'HH:mm:ss')
          day.overrideStopTime = data.dates[arrayKey].overrideStopTime
        }
      }

      currentDate.add(1, 'day')
    }

    $scope.processedData = returnValue
    calculateTotal()
    recalculateWeekPlan()
    $scope.$apply()
  }

  function calculateTotal () {
    $scope.totals.totalWeekly = moment.duration()
    $scope.totals.totalLeft = 0

    for (var key in $scope.processedData.days) {
      var element = $scope.processedData.days[key]
      if (!element.total) {
        element.total = {}
      }

      if (element.isOff) {
        element.total.subtotal = 7 * 60 * 60 * 1000
        element.total.corrected = element.total.subtotal
        $scope.totals.totalWeekly.add(element.total.corrected)
        element.total.percentWorked = 100
        element.total.percentWorkedClass = 'done'
        element.total.timeLeft = 0
        element.total.timeOver = 0
      } else if (element.time.start && (element.time.stop || element.isToday)) {
        var stopTime = element.time.stop
        if (element.isToday && !element.overrideStopTime) {
          stopTime = moment()
          element.total.timeToLeave = moment(element.time.start).add(element.plan.timeMS, 'ms').add(element.time.pause, 'h')
        }

        element.total.subtotal = stopTime.diff(element.time.start)

        if (element.total.subtotal > (element.time.pause * 60 * 60 * 1000)) {
          element.total.corrected = moment(stopTime).subtract(element.time.pause, 'hours').diff(element.time.start)
        } else {
          element.total.corrected = element.total.subtotal
        }
        if (element.plan.timeMS > 0) {
          element.total.percentWorked = (element.total.corrected / element.plan.timeMS) * 100
          if (element.total.percentWorked >= 99.99) {
            element.total.percentWorkedClass = 'done'
            element.total.timeOver = element.total.corrected - element.plan.timeMS
            element.total.timeLeft = 0

            if (element.total.timeOver < 0.01) {
              element.total.timeOver = 0
            }
          } else if (element.isToday) {
            element.total.percentWorkedClass = 'progressing'
            element.total.timeLeft = element.plan.timeMS - element.total.corrected
            element.total.timeOver = 0
          } else {
            element.total.percentWorkedClass = 'not-done'
            element.total.timeLeft = element.plan.timeMS - element.total.corrected
            element.total.timeOver = 0
          }
        } else {
          element.total.timeOver = 0
          element.total.percentWorked = 100
          element.total.percentWorkedClass = 'done'
        }

        $scope.totals.totalWeekly.add(element.total.corrected)
      } else {
        element.total.timeLeft = element.plan.timeMS
        element.total.percentWorked = 0
        element.total.timeOver = 0
      }
    }

    var timeLeft = moment.duration($scope.hoursToWork.time, 'hours').subtract($scope.totals.totalWeekly)

    if (!notifiedForWeekDone && timeLeft.hours() >= $scope.hoursToWork.time) {
      notifiedForDayDone = true
      ipcRenderer.send('notify', '', 'You worked enough hours for the week.')
    }

    $scope.totals.totalPercent = ($scope.totals.totalWeekly / ($scope.hoursToWork.time * 60 * 60 * 1000)) * 100
    if ($scope.totals.totalPercent >= 100) {
      $scope.totals.totalClass = 'done'
    } else {
      if (isCurrentWeekSelected) {
        $scope.totals.totalClass = 'progressing'
      } else {
        $scope.totals.totalClass = 'not-done'
      }
    }
    $scope.totals.totalLeft = timeLeft
  }

  function refreshDayInfo () {
    var today = moment().format($scope.dateFormat)
    var isFuture = false

    for (var key in $scope.processedData.days) {
      var element = $scope.processedData.days[key]
      element.isToday = key === today
      element.isFuture = isFuture
      if (element.isToday) {
        isFuture = true

        var hoursToWorkToday = $scope.weekPlan[key].time

        // We are starting a new day!
        if (!element.date.isSame(previousDayToday, 'day')) {
          console.log('Starting a new day: ', element.date.format('MMMM Do YYYY, h:mm:ss a'))
          // We are starting a new week!!
          if (previousDayToday.isoWeek() !== element.date.isoWeek()) {
            console.log('Starting a new week: ', element.date.format('MMMM Do YYYY, h:mm:ss a'))
            getAvailableDatesForCalendar(function () {
              $scope.setSelectedWeek(moment())
              startNewWeek()
              previousDayToday = moment(element.date)
              startNewDay()
            })
          } else {
            console.log('reloading current week information')
            lockedData.load($scope.selectedWeek, function (err, data) {
              if (err) { throw err }
              processWeekInformation(null, data)
            })
            previousDayToday = moment(element.date)
            startNewDay()
          }
        }

        if (!notifiedForDayDone && element.total.corrected > (hoursToWorkToday * 60 * 60 * 1000)) {
          notifiedForDayDone = true
          console.log('user worked ' + hoursToWorkToday + 'hrs today. Notifying...')
          ipcRenderer.send('notify', '', 'You worked enough hours for today (' + formatHours(hoursToWorkToday) + ').')
        }
      }
    }
  }

  function startNewDay () {
    notifiedForDayDone = false
  }

  function startNewWeek () {
    notifiedForWeekDone = false
  }

  $scope.recalculateWeekPlan = function () { recalculateWeekPlan() }

  function recalculateWeekPlan () {
    if (!isCurrentWeekSelected || $scope.globalSettings.weekPlanMode !== 'auto') {
      for (var day in $scope.weekPlan) {
        $scope.weekPlan[day].useDay = $scope.weekPlan[day].time > 0
      }
      return
    }
    console.log('recalculating week plan')

    var daysToSplit = {}
    var daysToSplitCount = 0
    var timeWorked = 0
    for (var dayKey in $scope.weekPlan) {
      if (!$scope.processedData.days[dayKey].isFuture && !$scope.processedData.days[dayKey].isToday) {
        if ($scope.weekPlan[dayKey].useDay && $scope.processedData.days[dayKey].total.corrected) {
          timeWorked += $scope.processedData.days[dayKey].total.corrected
          $scope.weekPlan[dayKey].time = ($scope.processedData.days[dayKey].total.corrected / 3600000)
        } else {
          $scope.weekPlan[dayKey].time = 0
        }
      } else {
        if ($scope.weekPlan[dayKey].useDay) {
          daysToSplit[dayKey] = true
          daysToSplitCount++
        } else {
          $scope.weekPlan[dayKey].time = 0
        }
      }
    }

    if (daysToSplitCount > 0) {
      var hrsToWorkInMs = ($scope.hoursToWork.time * 3600000) - timeWorked
      var hrsByDay = (hrsToWorkInMs / daysToSplitCount) / 3600000
      for (dayKey in daysToSplit) {
        $scope.weekPlan[dayKey].time = hrsByDay
      }
    }
  }

  function getAvailableDatesForCalendar (callback) {
    console.log('Getting available dates for calendar...')
    lockedData.getAvailableDates(function (err, dates) {
      if (err) { throw err }
      $scope.datesAvailable = {}
      for (var i = 0; i < dates.length; i++) {
        var date = moment(dates[i])
        for (var j = 0; j < 7; j++) {
          $scope.datesAvailable[date.format(DATE_FORMAT)] = moment(date)
          date.add(1, 'day')
        }
      }

      console.log('Received available dates for calendar.')

      if (callback) {
        callback()
      }
    })
  }

  function setSelectedDayDetails (key) {
    var day = $scope.processedData.days[key]

    var minutes = (day.time.pause % 1) * 60
    var hours = Math.trunc(day.time.pause)

    $scope.selectedDayDetails = {
      key: key,
      day: day,
      pausePart: {
        hours: hours,
        minutes: Math.round(minutes)
      }
    }
  }

  function applyGlobalSettings (data) {
    var minutes = (data.defaultHoursToWork % 1) * 60
    var hours = Math.trunc(data.defaultHoursToWork)

    data.defaultHoursToWork = {
      time: data.defaultHoursToWork,
      hours: hours,
      minutes: Math.round(minutes)
    }

    minutes = (data.defaultTimeOff % 1) * 60
    hours = Math.trunc(data.defaultTimeOff)

    data.defaultTimeOff = {
      time: data.defaultTimeOff,
      hours: hours,
      minutes: Math.round(minutes)
    }

    $scope.globalSettings = data
  }

  ipcRenderer.on('lockedDataChange', function (event, date, data) {
    console.log('locked data changed')
    date = moment(date)
    if ($scope.selectedWeek.isSame(moment(date).startOf('isoWeek'), 'day')) {
      processWeekInformation(date, data)
    }
  })
  ipcRenderer.on('globalSettingsChange', function (event, data) {
    applyGlobalSettings(data)
    $scope.$apply()
  })

  ipcRenderer.on('updateDownloaded', function (event, info) {
    console.log('new update', info)
    $scope.isUpdateAvailable = true
    $scope.checkingForUpdates = false

    $scope.updateInfo = info
    $scope.updateInfo.releaseNotes = $sce.trustAsHtml(info.releaseNotes)

    if (shouldShowUpdateDialog) {
      shouldShowUpdateDialog = false
      $scope.showUpdateDialog()
    }
  })

  ipcRenderer.on('updateNotAvailable', function (event, info) {
    console.log('no updates available', info)
    $scope.isUpdateAvailable = false
    $scope.checkingForUpdates = false
    $scope.showUpdateNotAvailable = true
  })

  ipcRenderer.on('windowMaximize', function () {
    $scope.isWindowMaximized = true
    titleBarDrag()
  })

  ipcRenderer.on('windowUnmaximize', function () {
    $scope.isWindowMaximized = false
    titleBarDrag = drag('#titleBar')
  })

  globalSettings.on('dataChange', function (date, data) {
    console.log('settings changed')
  })

  // Start the UI!
  getAvailableDatesForCalendar(function () {
    $scope.setSelectedWeek(moment())
  })
}])

app.filter('formatMomentTime', function () {
  return function (momentTime) {
    if (momentTime) {
      return formatIntTwoDigits(momentTime.hours()) + ':' + formatIntTwoDigits(momentTime.minutes()) + ':' + formatIntTwoDigits(momentTime.seconds())
    }
    return '--:--:--'
  }
})

app.filter('formatMomentTimeDurationMS', function () {
  return function (momentTime) {
    if (momentTime) {
      momentTime = moment.duration(momentTime)
      var hours = momentTime.hours() + (momentTime.days() * 24)
      return formatIntTwoDigits(hours) + ':' + formatIntTwoDigits(momentTime.minutes()) + ':' + formatIntTwoDigits(momentTime.seconds())
    }
    return '--:--:--'
  }
})

function formatHours (hours) {
  if (hours) {
    var minutes = (hours % 1) * 60
    if (minutes + 0.001 > 60) {
      minutes = 0
      hours += 1
    }
    hours = Math.trunc(hours)
    return formatIntTwoDigits(hours) + ':' + formatIntTwoDigits(minutes)
  }
  return '--:--'
}

app.filter('formatHours', function () {
  return function (hours) {
    return formatHours(hours)
  }
})

function formatIntTwoDigits (integer) {
  if (integer < 0) {
    return '00'
  }
  integer = Math.round(integer)
  return ('0' + integer).slice(-2)
}

/* SETTINGS */

function SettingsController ($scope, $mdDialog) {
  $scope.close = function () {
    $mdDialog.hide()
  }

  $scope.openExternalLink = function (url) {
    shell.openExternal(url)
  }
}

/* UPDATE AVAILABLE */

function UpdateAvailableController ($scope, $mdDialog) {
  $scope.cancel = function () {
    $mdDialog.cancel()
  }

  $scope.confirm = function () {
    $mdDialog.hide()
  }
}

/* DAY DETAILS */

function DayDetailsController ($scope, $mdDialog) {
  $scope.close = function () {
    $mdDialog.hide()
  }
}

/* WEEK PLAN */

function WeekPlanController ($scope, $mdDialog) {
  $scope.close = function () {
    $mdDialog.hide()
  }

  $scope.totalTime = function () {
    var total = 0

    for (var dayPlan in $scope.weekPlan) {
      total += $scope.weekPlan[dayPlan].time
    }

    return total
  }
}
