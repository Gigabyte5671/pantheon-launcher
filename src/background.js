/*
    background.js

    Created by Kalila L. on 15 Dec 2019.
    Copyright 2020 Vircadia contributors.
    
    Distributed under the Apache License, Version 2.0.
    See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
*/

'use strict'
require('./global.js');

// import * as Sentry from '@sentry/electron'
// import { init } from '@sentry/electron/dist/main';
// init({dsn: 'https://def94db0cce14e2180e054407e551220@sentry.vircadia.dev/3'});

import { app, protocol, BrowserWindow, DownloadItem, Menu, Tray } from 'electron';
// To ensure only one instance of the launcher can exist, we request a lock.
let requestAppLock = app.requestSingleInstanceLock();
import {
	installVueDevtools,
	createProtocol,
} from 'vue-cli-plugin-electron-builder/lib';
import path from 'path';
const { shell, dialog } = require('electron');
const electronDlMain = require('electron-dl');
const { readdirSync } = require('fs');
const { forEach } = require('p-iteration');
const hasha = require('hasha');
const compareVersions = require('compare-versions');
const glob = require('glob');
const cp = require('child_process');
const log = require('electron-log');
import { autoUpdater } from 'electron-updater'
const tasklist = require('tasklist'); // This is specific to Windows.
// For tasklist to work correctly on some systems...
// if (process.platform === "win32") {
    process.env.PATH = 'C:\\Windows\\System32;' + process.env.PATH;
// }
// electron_modules
import * as versionPaths from './electron_modules/versionPaths.js';
import * as migrateLauncher from './electron_modules/migrateLauncher.js';
import * as download from './electron_modules/networking/download.js';
import * as privileges from './electron_modules/privileges.js'

function initialize () {
    if (pantheonConfig.app.storagePath) {
        if (pantheonConfig.app.storagePath.main !== '') {
            storagePath.main = pantheonConfig.app.storagePath.main;
        }
    }
    
    // Assign electron-log to take over.
    Object.assign(console, log.functions);
    
    // Initiate electron-dl
    electronDlMain();
}

initialize();

console.log("Data Path: " + storagePath.main);

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: { secure: true, standard: true } }])

function createWindow () {
    tray = new Tray(LAUNCHER_ICON);
    tray.setToolTip(APPLICATION_NAME);

    tray.setContextMenu(Menu.buildFromTemplate([
        { 
            label: 'Show Launcher', click:  function () {
                win.show();
            } 
        },
        { 
            label: 'Quit', click:  function () {
                win.show();
                requestClose();
            } 
        }
    ]));

    tray.on('double-click', function(event) {
        win.show();
    });

	// Create the browser window.
	win = new BrowserWindow({ 
		width: APPLICATION_WIDTH, 
		height: APPLICATION_HEIGHT,
        title: APPLICATION_NAME + ' ' + APPLICATION_VERSION,
		icon: LAUNCHER_ICON, 
		resizable: false,
		webPreferences: {
			nodeIntegration: true,
			devTools: true,
            // webSecurity: false
		} 
	})

	// This line disables the default menu behavior on Windows.
    if (developmentMode && !process.env.IS_TEST) {
        // Don't nullify the menu.
    } else {
        win.setMenu(null);
    }

	if (process.env.WEBPACK_DEV_SERVER_URL) {
		// Load the url of the dev server if in development mode
		win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    	if (!process.env.IS_TEST) {
            win.webContents.openDevTools()
        }
	} else {
		createProtocol('app')
		// Load the index.html when not in development
		win.loadURL('app://./index.html');
	}

    win.on('minimize', function (event) {
        event.preventDefault();
        win.hide();
    });

	win.on('closed', () => {
    	win = null;
	})
}

function attemptCreateWindow () {
    if (!requestAppLock && !developmentMode) {
        app.exit();
    } else {
        createWindow();
    }
}

// This stops CORS from getting in the way...
// app.commandLine.appendSwitch('disable-site-isolation-trials');
// app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// Someone tried to run a second instance, we should focus our window.
app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (win) {
        if (win.isMinimized()) {
            win.show();
        }
    }
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit();
	}
})

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (win === null) {
		attemptCreateWindow();
	}
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    if (developmentMode && !process.env.IS_TEST) {
        // Install Vue Devtools
        try {
            // console.info("Installing VueDevTools, if this does not work, Electron will not generate an interface.");
            // await installVueDevtools()
        } catch (e) {
            // console.error('Vue Devtools failed to install:', e.toString())
        }
    }

    attemptCreateWindow();
})

// Exit cleanly on request from parent process in development mode.
if (developmentMode) {
    if (process.platform === 'win32') {
        process.on('message', data => {
            if (data === 'graceful-exit') {
                app.quit()
            }
        })
    } else {
        process.on('SIGTERM', () => {
            app.quit()
        })
    }
}

// var needsLauncherMigration = migrateLauncher.detectOldDataPath("VircadiaLauncher", app.name, storagePath.main);
// 
// if (needsLauncherMigration) {
//     migrateLauncher.moveInstalls(needsLauncherMigration, storagePath.main);
// }

var currentInterface;
var requireInterfaceSelection;

async function generateInterfaceList(interfaces) {
    var interfacesArray = [];
    var dataPath;
    for (var i in interfaces) {
        var client = interfaces[i];
        dataPath = client + "launcher_settings";
        // dataPath = client;

        await getSetting('interface_package', dataPath).then(function(pkg){
            var appName = pkg.package.name;
            var appObject = { 
                [appName]: {
                    "location": client,
                }
            };
            interfacesArray.push(appObject);
        });

        // var appName = "Vircadia Interface";
        // var appObject = { 
        // 	[appName]: {
        // 		"location": client,
        // 	}
        // };
        // interfacesArray.push(appObject);
    }
    return interfacesArray;
}

async function getDirectories (src) {
    var interfacesToReturn = [];

    let getDirectoriesPromise = new Promise((res, rej) => {
        var res_p = res;
        var rej_p = rej;
        
        // THIS CODE ACTUALLY LOOKS FOR A PACKAGE.JSON TO REGISTER
		// glob(src + '/*/launcher_settings/interface_package.json', function(err, folders) {
		// 	console.log(folders);
		// 	if(folders) {
		// 		folders.forEach(function (folder) {
		// 			var folderToReturn = folder.replace("launcher_settings/interface_package.json", "");
		// 			interfacesToReturn.push(folderToReturn);
		// 		});
		// 		res_p();
		// 	} else {
		// 		rej_p("Failed to load directories.");
		// 	}
		// });
		
        // THIS CODE ONLY LOOKS FOR INTERFACE.EXE
        
        glob(src + '/*/interface.exe', function(err, folders) {
            console.log(folders);
            if (folders) {
                folders.forEach(function (folder) {
                    var folderToReturn = folder.replace("interface.exe", "");
                    interfacesToReturn.push(folderToReturn);
                });
                res_p();
            } else {
                rej_p("Failed to load directories.");
            }
        });
    });

    let result = await getDirectoriesPromise; 
    return interfacesToReturn;
}

async function getLibraryInterfaces() {
    var interfaces = [];

    let getLibraryPromise = new Promise((res, rej) => {
        var res_p = res;
        var rej_p = rej;
        getSetting('vircadia_interface.library', storagePath.main).then(async function(libraryPath){
            if(libraryPath) {
                await getDirectories(libraryPath).then(function(interfacesList) {
                    interfaces = interfacesList;
                    res_p();
                });
                console.info("Found library path:", libraryPath);
            } else {
                setLibrary(storagePath.main);
                await getDirectories(storagePath.main).then(function(interfacesList) {
                    interfaces = interfacesList;
                    res_p();
                });
            }
        });
    });

    let result = await getLibraryPromise; 
    return interfaces;
}

function setLibrary(libPath) {
	storage.set('vircadia_interface.library', libPath, {dataPath: storagePath.main}, function(error) {
		if (error) {
			throw error;
		} else {
			win.webContents.send('current-library-folder', {
				"libraryPath": libPath
			});
			storagePath.currentLibrary = libPath;
			return true;
		}
	});
}

function setLibraryDialog() {
	const {dialog} = require('electron') 

	dialog.showOpenDialog(win, {
		title: "Select A Folder",
		properties: ['openDirectory'],
	}).then(result => {
		console.log("Cancelled set library dialog: " + result.canceled)
		console.log("Selected library: " + result.filePaths)
		if(!result.canceled && result.filePaths[0]) {
			setLibrary(result.filePaths[0]);
		} else {
			return false;
		}
	}).catch(err => {
		console.log(err)
		return false;
	})
}

function requestLauncherAsAdmin() {
    var appPathSplit = app.getPath('exe').split('\\');
    var appPathCleaned = appPathSplit.slice(0, appPathSplit.length - 1).join('\\');
    
    var pathToLauncher = appPathCleaned + '\\' + PRODUCT_NAME;
    var pathToElevator = '"' + appPathCleaned + '\\resources\\elevate.exe' + '"';
    var launchParameter = '-k "' + pathToLauncher + '"';
    var interface_exe = require('child_process').spawn;
    
    // console.info(dialog.showMessageBox({ message: pathToElevator }))
    // console.info(dialog.showMessageBox({ message: launchParameter }))
    // console.info(dialog.showMessageBox({ message: appPathCleaned }))
    
    var elevateExe = interface_exe(pathToElevator, [launchParameter], {
        windowsVerbatimArguments: true,
        shell: true,
        detached: true
    });
    
    app.exit();
}

// async function getCurrentInterfaceJSON() {
//     var interfacePackageJSON = storagePath.interfaceSettings + '/interface_package.json';
// 
//     let rawdata;
//     try {
//         rawdata = fs.readFileSync(interfacePackageJSON);
//     } catch {
//         // win.webContents.send('failed-to-retrieve-interface-metadata', "We failed to get the current selected Interface metadata to perform the requested action.");
//         return false;
//     }
// 
//     let interfaceJSON = JSON.parse(rawdata);
// 
//     if (interfaceJSON) {
//         console.info("Interface Package JSON:", interfaceJSON);
//         return interfaceJSON;
//     } else {
//         return false;
//     }
// }

async function checkForInterfaceUpdates() {
	var vircadiaMeta = await download.cdn.meta();
    // var interfacePackage = await getCurrentInterfaceJSON();
    storagePath.interfaceSettings = storagePath.interfaceSettings.replace("//launcher_settings", "");
    storagePath.interfaceSettings = storagePath.interfaceSettings.replace("\\/launcher_settings", "");
    var interfacePackage = versionPaths.fromPath(storagePath.interfaceSettings);
    var cleanedLocalMeta = interfacePackage.version.replace(/_/g, '-');
    console.info("interfacePackage", interfacePackage);
    console.info("vircadiaMeta", vircadiaMeta);

    if (vircadiaMeta && vircadiaMeta[0].tag_name && interfacePackage && interfacePackage.version) {
        let latestVersion = vircadiaMeta[0].tag_name;
        var versionCompare = compareVersions(latestVersion, cleanedLocalMeta);
        console.info("Compare Versions:", versionCompare);
        if (versionCompare == 1) {
            return { "updateAvailable": true, "latestVersion": latestVersion };
        } else {
            // Version check failed, interface is either equal to or above the server's version.
            return { "updateAvailable": false, "latestVersion": latestVersion };
        }
    } else {
        // Failed to retrieve either or both the server meta and interface meta .JSON files.
        return { "updateAvailable": false, "latestVersion": null };
    }
}

async function checkForUpdates (checkSilently) {
    if (storagePath.interfaceSettings) {
        // This means to update because an interface exists and is selected.
        console.info("Checking for updates.");
        var result = await checkForInterfaceUpdates();
        if (result != null) {
            // Return with the URL to download or false if not.
            result.checkSilently = checkSilently;
            return result;
        }
    }
}

async function checkRunningApps() {
    var list = await tasklist();
    var runningApps = { "sandbox": false, "interface": false };
    
    list.forEach((task) => {
        if (task.imageName === "server-console.exe") {
            console.log("SANDBOX RUNNING!");
            runningApps.sandbox = true;
        }
        if (task.imageName === "interface.exe") {
            console.log("INTERFACE RUNNING!");
            runningApps.interface = true;
        }
    });
    
    return runningApps;
}

async function getDownloadURL() {
    var metaJSON = await download.cdn.meta();

    /*
    GitHub provides releases in the following format:
    metaJSON                                    -> A list of all releases.
    metaJSON[0]                                 -> Latest release.
    metaJSON[0].assets                          -> A list of downloadable assets (installers, etc) for the latest release.
    metaJSON[0].assets[0].browser_download_url  -> The download link for the first asset in the list.

    Since the assets list could contain any number of files in any order, we need to search through the list until we find the windows installer.
    The windows installer will be demarcated by its content type: 'application/x-msdownload'.
    */

    let latest_url = false;
    metaJSON[0].assets.forEach((asset) => {
        if (asset.content_type === 'application/x-msdownload') {
            latest_url = asset.browser_download_url;
        }
    });
    
    if (metaJSON && latest_url) {
        return latest_url;
    } else {
        return false;
    }
}

async function getSetting(setting, storageDataPath) {
    var returnValue;

    let storagePromise = new Promise((res, rej) => {
        storage.get(setting, {dataPath: storageDataPath}, function(error, data) {
            if (error) {
                returnValue = false;
                rej("Error: " + error);
                throw error;
            } else if (Object.entries(data).length === 0) {
                // console.info("Requested:", setting, "Got data:", data, "Object.entries:", Object.entries(data).length);
                returnValue = false;
                rej("Not found.")
            } else {
                returnValue = data;
                res("Success!");
            }
        });
    }).catch(err => {
        console.info("Attempted to retrieve:", setting, "from:", storageDataPath, "but got:", err)
    });

    // because async won't work otherwise. 
    let result = await storagePromise; 
    console.info("getSetting Return Value:", returnValue);
    return returnValue;
}

const { ipcMain } = require('electron')

ipcMain.on('save-state', (event, arg) => {
    // FIXME: Find out why your settings keep getting nuked...? Specifically current interface and the library folder sometimes.
    // create a log file... and logging function to find the source of these issues.
    storage.set('vircadia_launcher.state', arg, {dataPath: storagePath.main}, function(error) {
        console.info("Saving state.", error);
        if (error) throw error;
    });
})

ipcMain.on('load-state', (event, arg) => {
	getSetting('vircadia_launcher.state', storagePath.main).then(function(results) {
        if (results) {    
            if (results.sentryEnabled === true) {
                init({dsn: 'https://def94db0cce14e2180e054407e551220@sentry.vircadia.dev/3'});
            }
            console.info("Loaded state:", results);
            win.webContents.send('state-loaded', {
                results
            });
        } else {
            win.webContents.send('first-time-user');
        }
	});
    
    win.webContents.send('development-mode', developmentMode);
})

ipcMain.on('set-metaverse-server', (event, arg) => {
    if (arg !== "") {
        process.env.HIFI_METAVERSE_URL = arg;
    } else {
        delete process.env.HIFI_METAVERSE_URL;
    }
    console.info("Current Metaverse Server:", process.env.HIFI_METAVERSE_URL);
})

ipcMain.on('launch-interface', async (event, arg) => {
    var executablePath = arg.exec;
    var parameters = [];
    var canLaunch = true;
    var isPathSet = false;
    
    if (arg.customPath) {
        isPathSet = true;
        // var convertProtocol = arg.customPath.replace("hifi://", "http://")
        parameters.push('--url "' + arg.customPath + '"');
    }

    if (arg.shouldCheckForUpdates) {
        var checkResult = await checkForUpdates(true);

        if (checkResult.updateAvailable === true) {
            if (isPathSet === true) {
                checkResult.customPath = arg.customPath;
            }

            win.webContents.send('checked-for-updates-on-launch', checkResult);
            return;
        }
    }
    
    if (arg.customLaunchParameters) {
        var splitParameters = arg.customLaunchParameters.split(",");
        splitParameters.forEach(parameter => parameters.push(parameter));
    }
    
    if (arg.allowMultipleInstances) {
        parameters.push('--allowMultipleInstances');
    } else { // If a link is being opened, don't warn as we may be trying to send to the current interface running.
        var list = await tasklist();
        list.forEach((task) => {
            if (task.imageName === "interface.exe") {
                console.log("Interface is already running while attempting to launch without --allowMultipleInstances set!");
                if (isPathSet === true) {
                    console.log("A goto URL was set, we will redirect this to the operating system.");
                    shell.openExternal(arg.customPath);
                } else {
                    win.webContents.send("launch-interface-already-running");
                }
                canLaunch = false;
            }
        });
    }

    if (!canLaunch) {
        return;
    }

    if (arg.noSteamVR && !arg.noOculus) {
        parameters.push('--disable-displays="OpenVR (Vive)"');
        parameters.push('--disable-inputs="OpenVR (Vive)"');
    }
    
    if (arg.noOculus && !arg.noSteamVR) {
        parameters.push('--disable-displays="Oculus Rift"');
        parameters.push('--disable-inputs="Oculus Rift"');
    }
    
    if (arg.noOculus && arg.noSteamVR) {
        parameters.push('--disable-displays="OpenVR (Vive),Oculus Rift"');
        parameters.push('--disable-inputs="OpenVR (Vive),Oculus Rift"');
    }
    
    if (arg.autoRestartInterface && arg.launchAsChild) {
        parameters.push('--suppress-settings-reset');
    }
    
    if (arg.dontPromptForLogin) {
        parameters.push('--no-login-suggestion');
    }
    
    // TODO: Set this dynamically.
    // parameters.push('-qwindowtitle "Vircadia Quantum K3"');
    
    // TODO: Add "QUANTUM_K3_INSTAQUIT" environment variable.
	
    console.info("Parameters:", parameters, "type:", Array.isArray(parameters));
    console.info("arg.launchAsChild", arg.launchAsChild);
    if (arg.launchAsChild) {
        launchInterface(executablePath, parameters, arg);
    } else {
        launchInterfaceDetached(executablePath, parameters, arg);
    }
})

function launchInterface(executablePath, parameters, passedArgs) {
    win.webContents.send('launching-interface');

    if (passedArgs.hideOnLaunch === true) {
        win.hide();
    }

    var interface_exe = require('child_process').execFile;

    interface_exe(executablePath, parameters, { windowsVerbatimArguments: true }, function(err, stdout, data) {
        console.info("Interface.exe exited with code:", err);
        if (passedArgs.autoRestartInterface == true && err && !err.killed) {
            launchInterface(executablePath, parameters, passedArgs);
        }
    });
}

function launchInterfaceDetached(executablePath, parameters, passedArgs) {
    win.webContents.send('launching-interface');

    if (passedArgs.hideOnLaunch === true) {
        win.hide();
    }

    // All arguments that have or may have spaces should be wrapped in ""
    var appPathSplit = app.getPath('exe').split('\\');
    var appPathCleaned = appPathSplit.slice(0, appPathSplit.length - 1).join('\\');
    var pathToLaunch = appPathCleaned + "\\bat\\launcher.bat";
    console.info("pathToLaunch:", pathToLaunch);
    // console.info(dialog.showMessageBox({ message: pathToLaunch }))
    
    parameters = parameters.join(' '); // ['--arg1=""', '--arg2=""'] -> '--arg1="" --arg2=""'
    parameters = parameters.split(' ').join('#20'); // convert spaces to #20
    parameters = parameters.split('"').join('#40'); // convert " to #40
    parameters = parameters.split('=').join('#60'); // convert = to #60
    parameters = parameters.split(',').join('#80'); // convert , to #60
    console.info("Detached Launch PARAMETERS:", parameters);
    executablePath = '"' + executablePath + '"';
    // console.info(dialog.showMessageBox({ message: parameters }))
    pathToLaunch = '"' + pathToLaunch + '"';
    
    var interface_exe = require('child_process').spawn;
    var launcherBat = interface_exe(pathToLaunch, [executablePath, parameters], {
        windowsVerbatimArguments: true,
        shell: true
    });
    
    launcherBat.stdout.on('data', function (data) {
        console.log('launcherBatOut: ' + data);
        // console.info(dialog.showMessageBox({ message: 'launcherBatOut: ' + data }))
    });
    
    launcherBat.stderr.on('data', function (data) {
        console.log('launcherBatErr: ' + data);
        // console.info(dialog.showMessageBox({ message: 'launcherBatErr: ' + data }))
    });
    
    launcherBat.on('exit', function (code) {
        console.log('child process exited with code ' + code);
    });
}

var installer_exe = cp.execFile;

function launchInstaller() {
    getSetting('vircadia_interface.library', storagePath.main).then(function (libPath) {
        var executablePath = libPath + '/' + pantheonConfig.manager.preInstallerName;
        var installPath = libPath + "/Vircadia_Interface_Latest";
        var parameters = [""];

        if (!fs.existsSync(executablePath)) {
            // Notify main window of the issue.
            win.webContents.send('no-installer-found');
            return;
        }

        console.info("Installing, params:", executablePath, installPath, parameters)

        installer_exe(executablePath, parameters, function (err, data) {
            console.log(err)
            console.log(data.toString());
        });
    });
}

async function silentInstall(useOldInstaller) {
    var vircadiaMetaJSON = await download.cdn.meta();
    var executableLocation; // This is the downloaded installer.
    var installPath; // This is the location to install the application to.
    var installFolderName = "\\" + versionPaths.toPath(vircadiaMetaJSON[0]) + "\\";
    console.info("silentInstall: installFolderName:", installFolderName);
    var executablePath; // This is the location that the installer exe is located in after being downloaded.
    var exeLocToInstall; // This is what gets installed.
    var checkPrereqs = await checkRunningApps();
    var isAdmin = await privileges.isRunningAsAdministrator();

    if (checkPrereqs.sandbox === true) {
        win.webContents.send('silent-installer-failed', { "message": 'Your server sandbox is running. Please close it before proceeding.' });
        return;
    }
    
    if (checkPrereqs.interface === true) {
        win.webContents.send('silent-installer-failed', { "message": 'An instance of Interface is running, please close it before proceeding.' });
        return;
    }
    
    if (!isAdmin) {
        win.webContents.send('silent-installer-failed', { "message": 'You need to run the launcher as an administrator to continue.', "code": -1 });
        return;
    }
    
    getSetting('vircadia_interface.library', storagePath.main).then(function (libPath) {    
        if (libPath) {
            executableLocation = libPath + '/' + pantheonConfig.manager.preInstallerName;
            installPath = libPath + installFolderName;
            executablePath = libPath;
        } else {
            executableLocation = storagePath.main + '/' + pantheonConfig.manager.preInstallerName;
            installPath = storagePath.main + installFolderName;
            executablePath = storagePath.main;
        }
        
        var parameters = [];
        
        parameters.push("/S");
        parameters.push("/D=" + installPath);
        
        if (useOldInstaller === true) {
            exeLocToInstall = executablePath + '/' + pantheonConfig.manager.postInstallerName;
        } else {
            if (!fs.existsSync(executableLocation)) {
                // Notify main window of the issue.
                win.webContents.send('no-installer-found');
                return;
            } else {
                console.info("exeLoc:", executableLocation);
                console.info("exePath:", executablePath);
                
                fs.copyFileSync(executableLocation, executablePath + '/' + pantheonConfig.manager.postInstallerName, (err) => {
                    if (err) console.log('ERROR ON COPY: ' + err);
                    console.log('Completed copy operation successfully.');
                });
                
                fs.unlink(executableLocation, (err) => {
                    if (err) console.log('ERROR ON ORIGINAL INSTALLER DELETE: ' + err);
                    console.info(executableLocation, 'was deleted after copying.');
                });
                
                exeLocToInstall = executablePath + '/' + pantheonConfig.manager.postInstallerName;
            }
        }
        
        win.webContents.send('silent-installer-running');
        console.info("Installing silently, params:", exeLocToInstall, installPath, parameters)

        try { 
            installer_exe(exeLocToInstall, parameters, { windowsVerbatimArguments: true }, function (err, data) {
                console.log(err)
                console.log(data.toString());
                
                // On installer exit...
                if (err) {
                    console.info("Installation failed.");
                    var errorMessage;
                    
                    if (err.code === "EACCES") {
                        errorMessage = "Please run the launcher as an administrator to continue.";
                    } else {
                        if (err.code === 2) {
                            errorMessage = "An instance of Interface is running, please close it before proceeding.";
                        } else {
                            errorMessage = "An error has occurred.";                
                        }
                    }
                    
                    win.webContents.send('silent-installer-failed', { 
                        "message": errorMessage, 
                        "code": err.code, 
                        "fullerr": err 
                    });
                } else {
                    console.info("Installation complete.");
                    console.info("Running post-install.");
                    // postInstall();
                    win.webContents.send('silent-installer-complete', {
                        "name": vircadiaMetaJSON[0].tag_name,
                        "folder": installPath,
                    });
                }
            });
        } catch (e) {
            console.info("Try block: Silent installation failed.")
            var errorMessage = "An error has occurred: " + e;
            win.webContents.send('silent-installer-failed', { "message": errorMessage });
        }
        
    }).catch(function(e) {
        console.info("Failed to fetch library for silent install. Error:", e);
        var errorMessage = "An error has occurred: " + e;
        win.webContents.send('silent-installer-failed', { "message": errorMessage, "fullerr": e });
    });
}

// TODO: Fix this LATER, it's unacceptable.

// async function postInstall() {
//     getSetting('vircadia_interface.library', storagePath.main).then(async function (libPath) {
//         var installPath;
//         var vircadiaMetaJSON = await download.cdn.meta();
//         var vircadiaPackageJSON = 
//         {
//             "package": {
//                 "name": vircadiaMetaJSON[0].name,
//                 "version": vircadiaMetaJSON[0].tag_name
//             }
//         };
// 
//         if (libPath) {
//             installPath = libPath + installFolderName;
//         } else {
//             installPath = storagePath.main + installFolderName;
//         }
// 
//         var packageJSONLocation = installPath + "/launcher_settings";
//         var packageJSONFilename = installPath + "/launcher_settings/interface_package.json";
// 
//         try {
//             fs.mkdirSync(packageJSONLocation, { recursive: true });
//             fs.writeFileSync(packageJSONFilename, JSON.stringify(vircadiaPackageJSON));
//         } catch {
//             win.webContents.send('silent-installer-failed', { "message": 'Failed to create Interface metadata post-install.' });
//             return;
//         }
// 
//         var postInstallPackage = {
//             "name": vircadiaMetaJSON[0].name,
//             "folder": installPath,
//         }
// 
//         win.webContents.send('silent-installer-complete', postInstallPackage);
//     }).catch(function(e) {
//         console.info("Failed to fetch library for post install. Error:", e);
//     });
// }

async function requestClose () {
    var list = await tasklist();
    var canClose = true;
    
    list.forEach((task) => {
        if (task.imageName === "interface.exe") {
            console.log("Interface.exe found to be running.");
            canClose = false;
        }
    });
    
    if (!canClose) {
        win.webContents.send('request-close-interface-running');
    } else {
        app.exit();
    }
}

// ### MESSAGE HANDLING BETWEEN MAIN AND BROWSER ###

ipcMain.on('get-vircadia-location', async (event, arg) => {
    var vircadiaLocation = await getSetting('vircadia_interface.location', storagePath.interfaceSettings);
    var vircadiaLocationExe = vircadiaLocation.toString();
    console.info("VircadiaLocationExe:", vircadiaLocationExe);
    event.returnValue = vircadiaLocationExe;
})

ipcMain.on('set-vircadia-location', async (event, arg) => {
    const {dialog} = require('electron') 
  
    dialog.showOpenDialog(win, {
        title: "Select the Vircadia Interface executable",
        properties: ['openFile'],
        defaultPath: storage.getDataPath(),
        filters: [
            { name: 'Interface Executable', extensions: ['exe'] },
        ]
    }).then(result => {
        console.log(result.canceled)
        console.log(result.filePaths)
        if(!result.canceled && result.filePaths[0]) {
            var storageSavePath;
            if (storagePath.interfaceSettings) {
                storageSavePath = storagePath.interfaceSettings;
                storage.set('vircadia_interface.location', result.filePaths[0], {dataPath: storageSavePath}, function(error) {
                    if (error) throw error;
                });
            } else {
                win.webContents.send('need-interface-selection');
            }
        } else {
            return;
        }
    }).catch(err => {
        console.log(err)
        return;
    })
  
})

// TODO: switch to the proper ipcMain.on convention.
ipcMain.on('set-library-folder', (event, arg) => {
    setLibraryDialog();
})

ipcMain.on('set-library-folder-default', (event, arg) => {
    setLibrary(storagePath.main);
})

ipcMain.on('get-library-folder', (event, arg) => {
    getSetting('vircadia_interface.library', storagePath.main).then(async function(libraryPath){
        win.webContents.send('current-library-folder', {
            libraryPath
        });
        storagePath.currentLibrary = libraryPath;
    });
})

ipcMain.on('set-current-interface', (event, arg) => {
    if (arg) {
        storage.setDataPath(arg + "/launcher_settings");
        storagePath.interface = arg;
        storagePath.interfaceSettings = arg + "/launcher_settings";
        console.info("InterfaceSettings:", storagePath.interfaceSettings);
        console.info("storagePath:", JSON.stringify(storagePath));
    }
})

ipcMain.handle('isInterfaceSelectionRequired', (event, arg) => {
    if(storagePath.interface == null || storagePath.interfaceSettings == null) {
        event.sender.send('interface-selection-required', true);
    } else {
        event.sender.send('interface-selection-required', false);
    }
})

ipcMain.handle('populateInterfaceList', async (event, arg) => {
    var interface_exes = await getLibraryInterfaces();
    var list = interface_exes.map(function(filename) {
        // :)
        var nv = versionPaths.fromPath(filename);
        return { [nv.name]: { "location": filename.replace(/\binterface\.exe\b/i, ''), "version": nv.version } };
    });
    event.sender.send('interface-list', list);
    
    // COMMENT ABOVE, UNCOMMENT BELOW
    
    // getLibraryInterfaces().then(async function(results) {
    //     var generatedList = await generateInterfaceList(results);
    //     console.info("Returning...", generatedList, "typeof", typeof generatedList, "results", results);
    //     event.sender.send('interface-list', generatedList);
    // });
})

ipcMain.handle('get-interface-list-for-launch', async (event, arg) => {
    var interface_exes = await getLibraryInterfaces();
    var list = interface_exes.map(function(filename) {
        // :)
        var nv = versionPaths.fromPath(filename);
        return { [nv.name]: { "location": filename.replace(/\binterface\.exe\b/i, '') } };
    });
    event.sender.send('interface-list-for-launch', list);
    
    // COMMENT ABOVE, UNCOMMENT BELOW
    
	// getLibraryInterfaces().then(async function(results) {
	// 	var generatedList = await generateInterfaceList(results);
	// 	console.info("Returning...", generatedList, "typeof", typeof generatedList, "results", results);
	// 	event.sender.send('interface-list-for-launch', generatedList);
	// });
})

ipcMain.on('download-vircadia', async (event, arg) => {
    var libraryPath;
    var downloadURL = await getDownloadURL();
    var vircadiaMetaJSON = await download.cdn.meta();
    var isAdmin = await privileges.isRunningAsAdministrator();
    var checkPrereqs = await checkRunningApps();
    var installerName = pantheonConfig.manager.preInstallerName;
    var installerNamePost = pantheonConfig.manager.postInstallerName;
    console.info("DLURL:", downloadURL);
    console.info(checkPrereqs)
    
    if (checkPrereqs.sandbox === true) {
        win.webContents.send('download-installer-failed', { "message": 'Your server sandbox is running. Please close it before proceeding.' });
        return;
    }
    
    if (checkPrereqs.interface === true) {
        win.webContents.send('download-installer-failed', { "message": 'An instance of Interface is running. Please close it before proceeding.' });
        return;
    }
    
    if (!isAdmin) {
        console.info("isAdmin", isAdmin);
        win.webContents.send('download-installer-failed', { "message": 'You need to run the launcher as an administrator to continue.', "code": -1 });
        return;
    }
    
    if (downloadURL) {
        getSetting('vircadia_interface.library', storagePath.main).then(function(results){
            if(results) {
                libraryPath = results;
            } else {
                libraryPath = storagePath.main;
            }
            
            var previousInstaller = libraryPath + "/" + installerNamePost;
            
            if (fs.existsSync(previousInstaller)) {
                var md5current = hasha.fromFileSync(previousInstaller, {algorithm: 'md5'});
                md5current = md5current.toUpperCase();
                
                if (md5current === vircadiaMetaJSON[0].md5) {
                    silentInstall(true);
                    return;
                } else {
                    fs.unlink(previousInstaller, (err) => {
                        if (err) console.log("No previous installation to delete.");
                        console.info(installerName, 'was deleted prior to downloading.');
                        console.info("Latest Live MD5:", vircadiaMetaJSON[0].md5);
                        console.info(installerName, "MD5:", md5current);
                    });
                }
            }
            
			electronDlMain.download(win, downloadURL, {
				directory: libraryPath,
				showBadge: true,
				filename: installerName,
                // onStarted etc. event listeners are added to the downloader, not replaced in the downloader, so we need to
                // use the downloadItem to check which download is progressing.
                onStarted: downloadItem => {
                    electronDlItemMain = downloadItem;
                },
				onProgress: currentProgress => {
					console.info(currentProgress);
					var percent = currentProgress.percent;
                    if (electronDlItemMain && electronDlItemMain.getURL()) {
                        win.webContents.send('download-installer-progress', {
                            percent
                        });
                        if (percent === 1) { // When the setup download completes...
                            electronDlItemMain = null;
                            // launchInstaller();
                            silentInstall(false);
                        }
                    }
				},
                onCancel: downloadItem => {
                    electronDlItemMain = null;
                }
                // FIXME: electron-dl currently displays its own "download interrupted" message box if file not found or 
                // download interrupted. It would be nicer to display our own, download-installer-failed, message box.
                // https://github.com/sindresorhus/electron-dl/issues/105
			});
		}).catch(function(error) {
            console.info("Download library retrieval error:", error);
            win.webContents.send('download-installer-failed');
        });
	} else {
		console.info("Failed to download.");
        win.webContents.send('download-installer-failed');
	}
});

// this can be triggered identically to "launch-interface" -- ie: pass full path to interface.exe within arg.exec
ipcMain.on('uninstall-interface', (event, folder) => {
    var uninstallExec = folder + "Uninstall.exe";
    console.info("[uninstall] uninstaller: ", uninstallExec);
    require('child_process').execFile(uninstallExec);
});

ipcMain.on('launch-sandbox', (event, folder) => {
    var sandboxExec = folder + "server-console/" + "server-console.exe";
    console.info("[sandbox] launching: ", sandboxExec);
    var sandbox_exe = require('child_process').spawn;
    var runSandbox = sandbox_exe(sandboxExec, [], {
        detached: true
    });
});

ipcMain.on('cancel-download', async (event) => {
    if (electronDlItemMain) {
        electronDlItemMain.cancel();
        win.webContents.send('download-cancelled');
    }
});

ipcMain.on('install-vircadia', (event, arg) => {
    launchInstaller();
});

// TODO: Add version info for local and remote for both update available and 
//       update not available.
// TODO: When a new version is downloaded and installed, the old version is no
//       longer overwritten. What should we do about this?
ipcMain.on('check-for-updates', async (event, arg) => {
    var result = await checkForUpdates(arg);
    win.webContents.send('checked-for-updates', result);
});

ipcMain.on('check-for-events', async (event, arg) => {
    var fetchEvents = await download.cdn.events();
    win.webContents.send('events-list', fetchEvents);
});

// TODO: Ensure this is working effectively to most users.
ipcMain.on('request-close', async (event, arg) => {
    requestClose();
});

ipcMain.on('request-launcher-as-admin', async (event, arg) => {
    requestLauncherAsAdmin();
});

ipcMain.on('get-is-launcher-admin', async (event, arg) => {
    var isAdmin = await privileges.isRunningAsAdministrator();
    win.webContents.send('send-is-launcher-admin', isAdmin);
});

ipcMain.on('close-launcher', (event, arg) => {
    app.exit();
});

// LAUNCHER AUTO UPDATER //

autoUpdater.autoDownload = false;
const autoUpdaterLoggingPrefix = '[Launcher AutoUpdater]';

autoUpdater.on('checking-for-update', () => {
    console.info(autoUpdaterLoggingPrefix, 'checking-for-update');
})
autoUpdater.on('update-available', (ev, info) => {
    console.info(autoUpdaterLoggingPrefix, 'update-available', info);
    win.webContents.send('checked-for-launcher-updates', { 'updateAvailable': true });
})
autoUpdater.on('update-not-available', (ev, info) => {
    console.info(autoUpdaterLoggingPrefix, 'update-not-available', info);
    win.webContents.send('checked-for-launcher-updates', { 'updateAvailable': false });
})
autoUpdater.on('error', (ev, err) => {
    console.info(autoUpdaterLoggingPrefix, 'error', err);
})
autoUpdater.on('download-progress', (ev, progressObj) => {
    console.info(autoUpdaterLoggingPrefix, 'download-progress', progressObj);
})
autoUpdater.on('update-downloaded', (ev, info) => {
    console.info(autoUpdaterLoggingPrefix, 'update-downloaded');
    console.info(autoUpdaterLoggingPrefix, 'Attempting to install.');
    autoUpdater.quitAndInstall(true, true);
});

ipcMain.on('check-for-launcher-updates', async (event, arg) => {
    autoUpdater.checkForUpdates();
});

ipcMain.on('request-launcher-auto-update', async (event, arg) => {
    win.webContents.send('launcher-auto-updater-running');
    autoUpdater.downloadUpdate();
});

// END LAUNCHER AUTO UPDATER //
