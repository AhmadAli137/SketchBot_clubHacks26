'use strict';

const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

/**
 * Set up auto-update checks after the main window is ready.
 * Only runs in packaged builds — never in dev.
 *
 * electron-updater fetches latest.yml from RELEASE_CDN_URL and compares
 * the version field against the running app version. If a newer build is
 * available the user is prompted to download it; on next quit it installs.
 */
function setupAutoUpdater(mainWindow) {
  const cdnBase = process.env.RELEASE_CDN_URL || 'https://releases.sayspark.ca';

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: cdnBase,
  });

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update available',
      message: `SaySpark ${info.version} is ready to download.`,
      detail: 'The update will be installed when you quit the app.',
      buttons: ['Download in background', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    }).catch(() => {});
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: 'Restart SaySpark to apply the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    }).catch(() => {});
  });

  autoUpdater.on('error', (err) => {
    // Silent — update failures should never disrupt the user
    console.error('[updater] error:', err?.message ?? String(err));
  });

  // Check 8 seconds after launch so it doesn't compete with runtime startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 8000);
}

module.exports = { setupAutoUpdater };
