# Notes: push that doesn't stop quietly (local, `pnpm dev`)

This builds on the email-code change (`../2026-09-28-local-email-code/notes.md`). The working tree sat on top of `97950a6` and was not committed yet, which is why the report shows that commit.

There are two changes:

- **Push health.** Push can stop on a device while the person still expects alerts. When the app opens or comes back to the foreground, it now checks the device:
  - A subscription the browser replaced: the device's rows move to the new endpoint, keeping the per-organization choices.
  - A subscription the browser dropped: the app subscribes again without a prompt.
  - Neither can be repaired: a notice shows, with **Turn back on**.

  The service worker also handles `pushsubscriptionchange` where browsers fire it.
- **Sign-out stops the device's pushes.** Sign-out removes the device's rows for the account before the session ends, so the next person on the device doesn't get them.

## Reproduce

```bash
pnpm db:migrate:local
PORT=55100 pnpm dev
PORT=55100 E2E_TARGET=local pnpm e2e
E2E_TARGET=local-push-health pnpm e2e:report   # names the report directory only
```

`22-push-health.spec.ts` needs Google Chrome in a visible window (a persistent profile), like `15-push-preferences`, because Chrome turns the Push API off in headless and incognito contexts.

## What ran

104 passed, 0 failed. The 38 skips are by design: site, staging and production-only checks, billing-on checks, and brand lookups without `CONTEXT_DEV_API_KEY`. The dev server was restarted before the run and logged no cross-request I/O errors.

`22-push-health`, new. The top of the file lists how the change could break. "A subscription the browser dropped" was added after the recorded run, so `report.md` lists five of its six tests. The file was then run on its own against the same server: 6 passed.

- **Turning push on remembers the device.** Settings → Notifications → Turn on subscribes both organizations. `localStorage["emitkit:push-endpoint:<userId>"]` holds the real endpoint.
- **A replaced subscription.**
  - Setup: the real endpoint's rows are removed, and a row for the first organization only is created under a made-up old endpoint. The marker is set to the old endpoint.
  - After the app opens and `syncDevice` answers, the real endpoint has exactly the first organization. The second stays off, so the choices survived. The old endpoint has no rows, and the marker is the real endpoint.
- **A device the server dropped.**
  - Setup: the real endpoint's rows are removed out of band, as when the push service answers 410.
  - Opening the app shows "Notifications stopped on this device" (the test saves `push-stopped-notice.png` to its output directory).
  - **Turn back on** hides the notice. The browser now has a *different* endpoint, since it subscribed afresh rather than reusing the dead one. Both organizations are subscribed there, and the marker follows it.
- **A subscription the browser dropped.** The page unsubscribes the browser's registration while permission stays granted. Reopening the app shows no notice: the app subscribed again without a prompt, and both organizations moved to the new endpoint.
- **Everything off on purpose.** Switching both organizations off in Settings clears the marker. Reopening the app shows no notice.
- **Sign-out.**
  - After turning push on and signing out through the account menu, the marker is gone.
  - Signing back in over HTTP shows no organization subscribed at that endpoint.
  - The browser still has the same registration.

`05-push-pwa` and `15-push-preferences` pass unchanged. Both use `useDevicePush`, whose `enable` now takes `{ fresh }`.

## Not covered here

- **The blocked notice** (permission `denied` after push was on). Playwright can grant or reset permissions but can't set `denied` in a persistent context. The branch is small: remembered endpoint plus `Notification.permission === "denied"`. Dismissing the blocked notice forgets the endpoint, so someone who blocked notifications on purpose isn't asked again. Settings has no "turn off" while push is blocked.
- **The service worker's `pushsubscriptionchange` handler.** Scenarios can't make Chrome fire it. It calls the same `syncDevice` the app-open check uses. That check is covered, and it's the only path on Safari, which never fires the event.
- **Silent re-subscribe on Safari.** Chrome subscribes again without a gesture once permission stands (checked above). Whether a Home Screen app on iPhone does the same still needs checking on a device. If it doesn't, the notice shows and **Turn back on** is the gesture.
- **Real delivery after a move.** The moved rows carry the browser's current keys, but pushes to real FCM aren't delivered from `pnpm dev`. `05`'s delivery check is skipped locally too.
