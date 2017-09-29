
'use strict'

const { BrowserWindow } = require('electron')
const path = require('path')
const url = require('url')
const isDev = require('electron-is-dev')
const windowStateKeeper = require('electron-window-state')
var EventEmitter = require('events').EventEmitter
var windowIconPath = ''

if (process.platform === 'win32') {
  windowIconPath = path.join(__dirname, 'icon.ico')
} else {
  windowIconPath = path.join(__dirname, 'icon.png')
}

var windowManager = new EventEmitter()
module.exports = windowManager

let mainWindowState
this.browserWindow = null

windowManager.init = function () {
  mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 625
  })
}

windowManager.createWindow = function () {
  if (windowManager.isWindowCreated()) {
    windowManager.browserWindow.show()
    return
  }
  windowManager.browserWindow = new BrowserWindow({
    backgroundColor: '#303030',
    frame: false,
    icon: windowIconPath,
    minWidth: 325,
    minHeight: 250,
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    isMaximized: mainWindowState.isMaximized,
    titleBarStyle: 'hiddenInset',
    fullscreenable: false
  })

  windowManager.browserWindow.setMenu(null)
  windowManager.browserWindow.loadURL(url.format({
    pathname: path.join(__dirname, '../views/index.html'),
    protocol: 'file:',
    slashes: true
  }))

  if (isDev) {
    windowManager.browserWindow.openDevTools()
  }
  mainWindowState.manage(windowManager.browserWindow)

  windowManager.browserWindow.on('closed', function (event) {
    console.log('window is closed.')
    windowManager.browserWindow = null
    windowManager.emit('windowClosed', event)
  })

  windowManager.browserWindow.on('maximize', function (event) {
    windowManager.sendToRenderer('windowMaximize')
  })

  windowManager.browserWindow.on('unmaximize', function (event) {
    windowManager.sendToRenderer('windowUnmaximize')
  })
}

windowManager.closeWindow = function () {
  if (windowManager.isWindowCreated()) {
    windowManager.browserWindow.hide()
  }
}

windowManager.destroyWindow = function () {
  if (windowManager.isWindowCreated()) {
    windowManager.browserWindow.destroy()
    windowManager.browserWindow = null
  }
}

windowManager.sendToRenderer = function (channel, ...args) {
  if (windowManager.isWindowCreated()) {
    windowManager.browserWindow.webContents.send(channel, ...args)
  }
}

windowManager.isWindowCreated = function () {
  return windowManager.browserWindow && !windowManager.browserWindow.isDestroyed()
}
