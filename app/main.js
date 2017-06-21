'use strict';

if (require('electron-squirrel-startup')) return;

const path = require("path");
var timeTracker = new (require('./lib/timeTracker'))();
var lockedData = require('./lib/lockedData');
var globalSettings = require('./lib/globalSettings');
var moment = require('moment');
const {app, BrowserWindow, ipcMain, Menu, Tray} = require("electron");

app.on('window-all-closed', function() {
  if (process.platform != 'darwin') {
    app.quit();
  }
});

app.on('ready', function () {
    //Add unlock at start if computer is already unlocked
    if(!timeTracker.isLocked()) {
        lockedData.addData(false, null, function(err, success) {
            if(err) {
                throw err;
            }
        });
    }

    var isSavingDone = false;
    var isSaving = false;

    timeTracker.start();
    var window = new BrowserWindow({
        frame: true,
        icon: path.join(__dirname, 'icon.ico')
    });
    
    var trayIcon = new Tray(path.join(__dirname, 'icon.ico'));
    trayIcon.setToolTip('Timesheet Hero');
    
    var contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show App', checked: true, click:  function() {
                window.show();
            } 
        },
        { 
            label: 'Quit', click:  function() {
                app.isQuiting = true;
                app.quit();
            } 
        }
    ]);
    trayIcon.setContextMenu(contextMenu);
    trayIcon.on('click', function() {
        window.show();
    });
    
    window.setMenu(null);
    window.tray = trayIcon;
    window.loadURL(path.join(__dirname, 'views/index.html'));
    window.show();
    window.openDevTools();

    lockedData.on('dataChange', function(date, data) {
        window.webContents.send('lockedDataChange', date.valueOf(), data);
    });
    globalSettings.on('dataChange', function(date, data) {
        window.webContents.send('globalSettingsChange', data);
        console.log('settings changed');
    });

    window.on('close', function (event) {
        if( !app.isQuiting){
            event.preventDefault();
            window.hide();
            return false;
        } 
        if(isSaving || !isSavingDone) {
            event.preventDefault();
        }

        if(!isSaving && !isSavingDone) {
            isSaving = true;
            lockedData.addData(true, null, function(err, success) {
                if(err) {
                    throw err;
                }
                isSaving = false;
                isSavingDone = true;
                app.quit();
            });
        } 
        
        return false;
    });

    ipcMain.on('setTimeOff', (event, dateMs, timeOff) => {
        var date = moment(dateMs);
        lockedData.setTimeOff(date, timeOff, function(err) {
            if(err) { throw err; }
        });
    });  

    ipcMain.on('setHoursToWork', (event, dateMs, hoursToWork) => {
        var date = moment(dateMs);
        lockedData.setHoursToWork(date, hoursToWork, function(err) {
            if(err) { throw err; }
        });
    });  
    
    ipcMain.on('setDayOff', (event, dateMs, isOff) => {
        var date = moment(dateMs);
        lockedData.setDayOff(date, isOff, function(err) {
            if(err) { throw err; }
        });
    });

    ipcMain.on('notify', (event, title, content) => {
        trayIcon.displayBalloon({title: title, content: content});
    });
});