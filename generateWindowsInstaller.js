var electronInstaller = require('electron-winstaller');

resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: 'packaged/Timesheet Hero-win32-x64',
    outputDirectory: 'build/timesheet-hero-installer',
    authors: 'Christophe Gagnier',
    exe: 'Timesheet Hero.exe',
    setupIcon: 'app/icon.ico',
    iconUrl: 'app/icon.ico'
  });

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));