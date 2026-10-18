/**
 * Chess AI Assistant - Background Service Worker
 * Manages Side Panel behavior and background event handling.
 */

// Enable automatic side panel opening on extension icon click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[KnightVision] Side panel setup error:', error));

  console.log('[KnightVision] Installed successfully.');
});
