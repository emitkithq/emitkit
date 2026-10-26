interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

const IOS_DEVICE = /iPad|iPhone|iPod/u;

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export const isIos = (): boolean =>
  IOS_DEVICE.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

/** Running as an installed app rather than in a browser tab. */
export const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as NavigatorWithStandalone).standalone === true;
