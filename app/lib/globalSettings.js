var jsonfile = require('jsonfile');
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var inherits = require('util').inherits;  
var EventEmitter = require('events').EventEmitter;
var os = require('os');

'use strict'

var globalSettings = new EventEmitter();
module.exports = globalSettings;

var folder = path.join(os.homedir(), 'timesheet-hero');
var filename = 'globalSettings.json';

globalSettings.get = function(key, callback) {
    getFilePath(function(err, filePath) {
        if(err) { return callback(err); }

        globalSettings.load(function(err, data) {
            if(err) { return callback(err); }
            
            if(!data[key]) { return callback('This key does not exist', null); }

            return callback(null, data[key]);
        });
    });
}

globalSettings.set = function(key, value, callback) {
    if(!callback) {
        callback = function() {};
    }
    getFilePath(function(err, filePath) {
        if(err) { return callback(err); }

        globalSettings.load(function(err, data) {
            if(err) { return callback(err); }
        
            data[key] = value;
            
            saveData(data, function (err) {
                if(err) { return callback(err); }
                return callback(null, true)
            });
        });
    });
}

globalSettings.load = function(callback) {
    getFilePath(function(err, filePath) {
        if(err) { return callback(err); }

        fs.access(filePath, function(err) {
            if(err && err.code === 'ENOENT') {
                return callback(null, {
                    defaultTimeOff: 0.5,
                    defaultHoursToWork: 35
                });
            }
            jsonfile.readFile(filePath, function(err, data) {
                return callback(err, data);
            });
        });
    });
};

globalSettings.loadSync = function(callback) {
    mkdirp.sync(folder);
    var filePath = path.join(folder, filename);
    var settings = {
        defaultTimeOff: 0.5,
        defaultHoursToWork: 35
    };

    try{
        require('fs').accessSync(filePath, fs.R_OK | fs.W_OK)
        settings = jsonfile.readFileSync(filePath);
    } catch(e) {}

    return settings;
};

function saveData(data, callback) {
    getFilePath(function(err, filePath) {
        if(err) { return callback(err); }

        jsonfile.writeFile(filePath, data, function(err) {
            if(err) { return callback(err); }
            globalSettings.emit('dataChange', data);
            return callback();
        });
    });
}

function getFilePath(callback) {
    mkdirp(folder, function(err) {
        if(err) { return callback(err); }

        return callback(null, path.join(folder, filename));
    });
}