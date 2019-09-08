'use strict'

const APP_ID = 'ca.cgagnier.timesheethero'

const path = require('path')
const moment = require('moment')
const log = require('electron-log')
const { app, ipcMain, Menu, Tray, nativeImage } = require('electron')
const { autoUpdater } = require('electron-updater')
const isDev = require('electron-is-dev')
const mkdirp = require('mkdirp')
const timeTracker = new (require('./lib/timeTracker'))()
const lockedData = require('./lib/lockedData')
const globalSettings = require('./lib/globalSettings')
const windowManager = require('./lib/windowManager')
const notifier = require('node-notifier')

// const updateFeedUrl = 'http://timesheethero.cgagnier.ca/'

if (isDev) {
  mkdirp.sync('./dist')
  log.transports.file.file = 'dist/log-dev.log'
}

console.log = log.info
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

autoUpdater.fullChangelog = true

// prevent multiple instances
var shouldQuit = app.makeSingleInstance(function (commandLine, workingDirectory) {
  if (windowManager) {
    windowManager.createWindow()
  }
})

app.setAppUserModelId(APP_ID)

if (shouldQuit) {
  console.log('App is already running...')
  app.quit()
}

app.on('window-all-closed', function () {
  // TODO: Quit the window for real on all platform and re-create it when needed
  if (process.platform !== 'darwin') {
    // app.quit();
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  windowManager.createWindow()
})

app.on('before-quit', function () {
  lockedData.addLockStateChanged(true, null, function (err, success) {
    if (err) {
      throw err
    }
  })
})

var trayIcon
var trayIconPath = ''

app.on('ready', function () {
  console.log('App is ready.')

  var isSavingDone = false
  var isSaving = false
  var firstTimeClosing = true

  if (process.platform === 'win32') {
    trayIconPath = path.join(__dirname, 'icon.ico')
  } else {
    trayIconPath = nativeImage.createFromPath(path.join(__dirname, 'trayIcon.png'))
  }

  windowManager.init()

  console.log('Setting up the tray icon...')
  trayIcon = new Tray(trayIconPath)
  trayIcon.setToolTip('Timesheet Hero')
  var contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      checked: true,
      click: function () {
        windowManager.createWindow()
      }
    },
    {
      label: 'Quit',
      click: function () {
        app.isQuiting = true
        windowManager.closeWindow()
        timeTracker.stop()
        if (!isSaving && !isSavingDone) {
          isSaving = true
          lockedData.addLockStateChanged(true, null, function (err, success) {
            if (err) {
              throw err
            }
            isSaving = false
            isSavingDone = true
            timeTracker.stop()
            app.quit()
          })
        }
      }
    }
  ])
  trayIcon.setContextMenu(contextMenu)
  trayIcon.on('click', function () {
    windowManager.createWindow()
  })

  // Save as unlocked when the app launch as we assume the computer is unlocked
  console.log('Saving unlock...')
  lockedData.addLockStateChanged(false, null, function (err, success) {
    console.log('Creating the main window...')
    windowManager.createWindow()

    if (err) {
      throw err
    }
  })

  console.log('Starting the time tracker...')
  timeTracker.start()

  // TODO: Create a module to handle the autoUpdater
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...')
  })
  autoUpdater.on('update-available', (ev) => {
    console.log('Update available.', ev)
  })
  autoUpdater.on('update-not-available', (ev, info) => {
    console.log('Update not available.')
    windowManager.sendToRenderer('updateNotAvailable')
  })
  autoUpdater.on('error', (ev, err) => {
    console.log('Error in auto-updater.')
  })
  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = 'Download speed: ' + progressObj.bytesPerSecond
    logMessage = logMessage + ' - Downloaded ' + progressObj.percent + '%'
    logMessage = logMessage + ' (' + progressObj.transferred + '/' + progressObj.total + ')'
    console.log(logMessage)
  })
  autoUpdater.on('update-downloaded', (ev) => {
    console.log('Update downloaded')
    windowManager.sendToRenderer('updateDownloaded', ev)
  })

  lockedData.on('dataChange', function (date, data) {
    windowManager.sendToRenderer('lockedDataChange', date.valueOf(), data)
  })
  globalSettings.on('dataChange', function (date, data) {
    windowManager.sendToRenderer('globalSettingsChange', data)
    console.log('settings changed')
  })

  windowManager.on('windowClosed', function (event) {
    if (!app.isQuiting && process.platform === 'win32') {
      if (firstTimeClosing) {
        notifier.notify({
          title: 'Timesheet Hero',
          message: 'The app is still running in the background.',
          icon: trayIconPath,
          appID: APP_ID
        })

        firstTimeClosing = false
      }
    }
  })

  ipcMain.on('setTimeOff', (event, dateMs, timeOff) => {
    var date = moment(dateMs)
    lockedData.setTimeOff(date, timeOff, function (err) {
      if (err) { throw err }
    })
  })

  ipcMain.on('setHoursToWork', (event, dateMs, hoursToWork) => {
    var date = moment(dateMs)
    lockedData.setHoursToWork(date, hoursToWork, function (err) {
      if (err) { throw err }
    })
  })

  ipcMain.on('setDayOff', (event, dateMs, isOff) => {
    var date = moment(dateMs)
    lockedData.setDayOff(date, isOff, function (err) {
      if (err) { throw err }
    })
  })

  ipcMain.on('setOverrideStartTime', (event, dateMs, time) => {
    var date = moment(dateMs)
    lockedData.setOverrideStartTime(date, time, function (err) {
      if (err) { throw err }
    })
  })

  ipcMain.on('setOverrideStopTime', (event, dateMs, time) => {
    var date = moment(dateMs)
    lockedData.setOverrideStopTime(date, time, function (err) {
      if (err) { throw err }
    })
  })

  ipcMain.on('resetOverrideTime', (event, dateMs) => {
    var date = moment(dateMs)
    lockedData.resetOverrideTime(date, function (err) {
      if (err) { throw err }
    })
  })

  ipcMain.on('saveWeekPlan', (event, dateMs, weekPlan) => {
    var date = moment(dateMs)
    lockedData.saveWeekPlan(date, weekPlan, function (err) {
      if (err) { throw err }
      console.log('Week plan changed')
    })
  })

  ipcMain.on('notify', (event, title, content) => {
    notifier.notify({
      title: title || 'Timesheet Hero',
      message: content,
      icon: trayIconPath,
      appID: APP_ID
    })
  })

  ipcMain.on('checkForUpdates', (event, title) => {
    console.log('Checking for updates (manually)...')
    checkForUpdates()
  })

  ipcMain.on('resetUI', (event) => {
    console.log('Reseting UI as per user request')
    windowManager.destroyWindow()
    windowManager.createWindow()
  })

  ipcMain.on('installUpdate', (event, title, content) => {
    console.log('restarting...')
    autoUpdater.quitAndInstall()
  })

  ipcMain.on('windowMinimize', (event) => {
    windowManager.browserWindow.minimize()
  })

  ipcMain.on('windowMaximize', (event) => {
    if (windowManager.browserWindow.isMaximized()) {
      windowManager.browserWindow.unmaximize()
    } else {
      windowManager.browserWindow.maximize()
    }
  })

  ipcMain.on('windowClose', (event) => {
    windowManager.closeWindow()
  })

  function checkForUpdates () {
    try {
      autoUpdater.checkForUpdates()
    } catch (ex) {
      console.log('Error while trying to check for updates:')
      console.error(ex)
      windowManager.sendToRenderer('updateNotAvailable')
    }
  }

  // if(!isDev) {
  checkForUpdates()

  setInterval(function () {
    checkForUpdates()
  }, 21600000) // 6hrs

  // }

  console.log('App is ready and running!')
})
