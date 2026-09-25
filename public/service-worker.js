// public/service-worker.js
//
// Runs in the background even with the tab closed, which is what lets push
// notifications show. Handles two things: a push arriving and a notification
// click.

self.addEventListener('push', function (event) {
  // Title and body come from reminder-sweep in the payload, so nothing is
  // hardcoded here.
  let payload = { title: 'Mmerℇ', body: 'You have a new reminder.' };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (err) {
    // Bad JSON: show a generic notification anyway.
  }

  const title = payload.title || 'Mmerℇ';
  const options = {
    body: payload.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    // Tag by reminder type so a repeat replaces the old one instead of
    // stacking.
    tag: payload.tag || 'mmer3-reminder'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Click: focus an open Mmerℇ tab if there is one, otherwise open the app.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
