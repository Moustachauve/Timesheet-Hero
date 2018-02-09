# ![TIMESHEET HERO](/docs/timesheet-hero.png?raw=true "TIMESHEET HERO")
This is a small utility app to keep track of your time. It is an ideal tool for a workplace that does not provide you with an automated way of knowing at which time you arrived and left the office.

## How does it work
You do not need to input anything related to your arrival and departure to the app. With the help of a little bit of magic, it automatically detects at which time you first unlocked your computer on a day and the last time that you locked your computer.
Based on that information, it is able to calculate how much hours you were at work. You can then adjust how many minutes you spend in pause.

## Installation
To install this app, simply [click here](https://github.com/Moustachauve/Timesheet-Hero/releases/latest) and download the most recent .exe file.

## Screenshot
# ![Screenshot 1](/docs/screenshot-1.png?raw=true)

## Running the code
To run the code, simply execute `npm start` from the root of the project.
To Package the code in an executable, execute `npm run pack`.
To create an installer, execute `npm run dist`.

If the executable created by the package gives you an error related to a missing library for edge-cs.dll, follow these steps:
1. In the app/node-modules folder, delete the `edge-cs` folder;
2. Copy the `edge-asar-cs` folder and name the copy `edge-cs`;
3. Repack the project and the executable should now work.