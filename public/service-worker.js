// public/service-worker.js
//
// This file runs separately from my React app — the browser keeps it
// alive in the background even after I close the Mmerℇ tab, which is
// the whole point: it's what lets a push notification still show up
// with nothing open.
//
// I'm keeping this file deliberately small. It only does two things:
// react to a push arriving, and react to someone clicking the
// notification it showed.

self.addEventListener('push', function (event) {
  // My server (reminder-sweep) sends the notification's title and body
  // as JSON in the push payload, so I don't have to hardcode any
  // message text here — this file stays the same no matter which of my
  // five reminder types triggered it.
  let payload = { title: 'Mmerℇ', body: 'You have a new reminder.' };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (err) {
    // If the payload isn't valid JSON for some reason, I'd still rather
    // show a generic notification than show nothing at all.
  }

  const title = payload.title || 'Mmerℇ';
  const options = {
    body: payload.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    // Tagging with the reminder type means if two of the same type
    // somehow arrived close together, the second one replaces the
    // first on screen rather than stacking duplicates.
    tag: payload.tag || 'mmer3-reminder'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Clicking the notification should bring me back to the app — if a
  // Mmerℇ tab is already open somewhere, focus that one instead of
  // opening a duplicate.
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
