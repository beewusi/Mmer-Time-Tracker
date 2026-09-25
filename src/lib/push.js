// src/lib/push.js
//
// TEMPORARY DEBUG VERSION. Logs every step of enabling desktop notifications
// to find where it fails.

import { supabase } from '../supabase';

const VAPID_PUBLIC_KEY =
  'BKnxd2N9q1uoAkUO2b-sxbcGIngkB0c6OK_Nsn-QRYcMY05EhaDEOTcQZVloXcNd6GC_YvOv1CIrOhxX_3cb59A';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function isPushSupported() {
  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  console.log('[PUSH DEBUG] Browser push supported:', supported);

  return supported;
}

export function getNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('[PUSH DEBUG] Notification API is NOT available.');
    return 'unsupported';
  }

  console.log(
    '[PUSH DEBUG] Current browser notification permission:',
    Notification.permission
  );

  return Notification.permission;
}

async function registerServiceWorker() {
  const serviceWorkerPath =
    `${process.env.PUBLIC_URL}/service-worker.js`;

  console.log(
    '[PUSH DEBUG] Registering service worker:',
    serviceWorkerPath
  );

  try {
    const registration =
      await navigator.serviceWorker.register(serviceWorkerPath);

    console.log(
      '[PUSH DEBUG] Service worker registered successfully:',
      registration
    );

    return registration;
  } catch (error) {
    console.error(
      '[PUSH DEBUG] SERVICE WORKER REGISTRATION FAILED:',
      error
    );

    throw error;
  }
}

export async function isDesktopPushEnabled() {
  console.log('[PUSH DEBUG] Checking whether desktop push is enabled...');

  if (!isPushSupported()) {
    console.log('[PUSH DEBUG] Push is not supported.');
    return false;
  }

  if (Notification.permission !== 'granted') {
    console.log(
      '[PUSH DEBUG] Browser permission is not granted:',
      Notification.permission
    );

    return false;
  }

  try {
    const registration =
      await navigator.serviceWorker.getRegistration(
        `${process.env.PUBLIC_URL}/`
      );

    console.log(
      '[PUSH DEBUG] Existing service worker registration:',
      registration
    );

    if (!registration) {
      console.log(
        '[PUSH DEBUG] No service worker registration found.'
      );

      return false;
    }

    const subscription =
      await registration.pushManager.getSubscription();

    console.log(
      '[PUSH DEBUG] Existing push subscription:',
      subscription
    );

    return !!subscription;
  } catch (error) {
    console.error(
      '[PUSH DEBUG] ERROR checking existing push subscription:',
      error
    );

    return false;
  }
}

export async function enableDesktopPush(userId) {
  console.log('========================================');
  console.log('[PUSH DEBUG] ENABLE DESKTOP PUSH STARTED');
  console.log('[PUSH DEBUG] userId:', userId);
  console.log('========================================');

  try {
    // ------------------------------------------------------------
    // STEP 1: Check browser support
    // ------------------------------------------------------------

    console.log('[PUSH DEBUG] STEP 1: Checking browser support...');

    if (!isPushSupported()) {
      throw new Error(
        'This browser does not support desktop notifications.'
      );
    }

    console.log(
      '[PUSH DEBUG] STEP 1 SUCCESS: Browser supports push.'
    );

    // ------------------------------------------------------------
    // STEP 2: Ask for notification permission
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 2: Current permission BEFORE request:',
      Notification.permission
    );

    console.log(
      '[PUSH DEBUG] STEP 2: Calling Notification.requestPermission()...'
    );

    const permission =
      await Notification.requestPermission();

    console.log(
      '[PUSH DEBUG] STEP 2 RESULT: permission =',
      permission
    );

    if (permission !== 'granted') {
      console.warn(
        '[PUSH DEBUG] STEP 2 STOPPED: Permission was not granted.'
      );

      return {
        enabled: false,
        permission
      };
    }

    console.log(
      '[PUSH DEBUG] STEP 2 SUCCESS: Notification permission granted.'
    );

    // ------------------------------------------------------------
    // STEP 3: Register service worker
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 3: Registering service worker...'
    );

    const registration =
      await registerServiceWorker();

    console.log(
      '[PUSH DEBUG] STEP 3 SUCCESS: Service worker registration:',
      registration
    );

    // ------------------------------------------------------------
    // STEP 4: Wait for service worker to become ready
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 4: Waiting for navigator.serviceWorker.ready...'
    );

    const readyRegistration =
      await navigator.serviceWorker.ready;

    console.log(
      '[PUSH DEBUG] STEP 4 SUCCESS: Service worker is ready:',
      readyRegistration
    );

    // ------------------------------------------------------------
    // STEP 5: Check for an existing push subscription
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 5: Checking for existing push subscription...'
    );

    let subscription =
      await registration.pushManager.getSubscription();

    console.log(
      '[PUSH DEBUG] Existing subscription:',
      subscription
    );

    // ------------------------------------------------------------
    // STEP 6: Create push subscription if necessary
    // ------------------------------------------------------------

    if (!subscription) {
      console.log(
        '[PUSH DEBUG] STEP 6: No subscription exists.'
      );

      console.log(
        '[PUSH DEBUG] STEP 6: Creating new push subscription...'
      );

      console.log(
        '[PUSH DEBUG] VAPID public key:',
        VAPID_PUBLIC_KEY
      );

      const applicationServerKey =
        urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

      console.log(
        '[PUSH DEBUG] Converted VAPID key length:',
        applicationServerKey.length
      );

      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });

      console.log(
        '[PUSH DEBUG] STEP 6 SUCCESS: New push subscription created:',
        subscription
      );
    } else {
      console.log(
        '[PUSH DEBUG] STEP 6: Existing subscription will be reused.'
      );
    }

    // ------------------------------------------------------------
    // STEP 7: Convert subscription to JSON
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 7: Converting subscription to JSON...'
    );

    const raw = subscription.toJSON();

    console.log(
      '[PUSH DEBUG] STEP 7 RESULT: raw subscription:',
      raw
    );

    if (!raw.endpoint) {
      throw new Error(
        'Push subscription has no endpoint.'
      );
    }

    if (!raw.keys) {
      throw new Error(
        'Push subscription has no keys.'
      );
    }

    if (!raw.keys.p256dh) {
      throw new Error(
        'Push subscription is missing p256dh.'
      );
    }

    if (!raw.keys.auth) {
      throw new Error(
        'Push subscription is missing auth.'
      );
    }

    // ------------------------------------------------------------
    // STEP 8: Delete existing Supabase row
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 8: Deleting existing Supabase subscription...'
    );

    console.log(
      '[PUSH DEBUG] Endpoint being deleted:',
      raw.endpoint
    );

    const { error: deleteError } =
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', raw.endpoint);

    if (deleteError) {
      console.error(
        '[PUSH DEBUG] STEP 8 FAILED: Supabase DELETE error:',
        deleteError
      );

      throw deleteError;
    }

    console.log(
      '[PUSH DEBUG] STEP 8 SUCCESS: Existing row deleted (if one existed).'
    );

    // ------------------------------------------------------------
    // STEP 9: Insert new Supabase row
    // ------------------------------------------------------------

    console.log(
      '[PUSH DEBUG] STEP 9: About to INSERT into push_subscriptions...'
    );

    const rowToInsert = {
      user_id: userId,
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth
    };

    console.log(
      '[PUSH DEBUG] Row being inserted:',
      rowToInsert
    );

    const { data, error: insertError } =
      await supabase
        .from('push_subscriptions')
        .insert(rowToInsert)
        .select();

    if (insertError) {
      console.error(
        '[PUSH DEBUG] STEP 9 FAILED: Supabase INSERT error:',
        insertError
      );

      console.error(
        '[PUSH DEBUG] INSERT error message:',
        insertError.message
      );

      console.error(
        '[PUSH DEBUG] INSERT error details:',
        insertError.details
      );

      console.error(
        '[PUSH DEBUG] INSERT error hint:',
        insertError.hint
      );

      console.error(
        '[PUSH DEBUG] INSERT error code:',
        insertError.code
      );

      throw insertError;
    }

    console.log(
      '[PUSH DEBUG] STEP 9 SUCCESS: Supabase row inserted:',
      data
    );

    // ------------------------------------------------------------
    // STEP 10: Everything succeeded
    // ------------------------------------------------------------

    console.log('========================================');
    console.log(
      '[PUSH DEBUG] SUCCESS: DESKTOP PUSH ENABLED'
    );
    console.log('========================================');

    return {
      enabled: true,
      permission: 'granted'
    };

  } catch (error) {
    console.error('========================================');
    console.error(
      '[PUSH DEBUG] ENABLE DESKTOP PUSH FAILED'
    );
    console.error('========================================');

    console.error(
      '[PUSH DEBUG] Error object:',
      error
    );

    console.error(
      '[PUSH DEBUG] Error message:',
      error?.message
    );

    console.error(
      '[PUSH DEBUG] Error name:',
      error?.name
    );

    console.error(
      '[PUSH DEBUG] Error code:',
      error?.code
    );

    console.error(
      '[PUSH DEBUG] Error details:',
      error?.details
    );

    console.error(
      '[PUSH DEBUG] Error hint:',
      error?.hint
    );

    // Re-throw so Dashboard.js knows enabling failed.
    throw error;
  }
}

export async function disableDesktopPush(userId) {
  console.log('========================================');
  console.log('[PUSH DEBUG] DISABLE DESKTOP PUSH STARTED');
  console.log('[PUSH DEBUG] userId:', userId);
  console.log('========================================');

  if (!isPushSupported()) {
    console.log(
      '[PUSH DEBUG] Push not supported. Nothing to disable.'
    );
    return;
  }

  try {
    console.log(
      '[PUSH DEBUG] Looking for service worker registration...'
    );

    const registration =
      await navigator.serviceWorker.getRegistration(
        `${process.env.PUBLIC_URL}/`
      );

    console.log(
      '[PUSH DEBUG] Service worker registration:',
      registration
    );

    if (registration) {
      console.log(
        '[PUSH DEBUG] Looking for browser push subscription...'
      );

      const subscription =
        await registration.pushManager.getSubscription();

      console.log(
        '[PUSH DEBUG] Browser subscription:',
        subscription
      );

      if (subscription) {
        console.log(
          '[PUSH DEBUG] Deleting subscription from Supabase...'
        );

        const { error: deleteError } =
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', subscription.endpoint)
            .eq('user_id', userId);

        if (deleteError) {
          console.error(
            '[PUSH DEBUG] Supabase DELETE failed:',
            deleteError
          );

          throw deleteError;
        }

        console.log(
          '[PUSH DEBUG] Supabase row deleted successfully.'
        );

        console.log(
          '[PUSH DEBUG] Unsubscribing browser subscription...'
        );

        const unsubscribed =
          await subscription.unsubscribe();

        console.log(
          '[PUSH DEBUG] Browser unsubscribe result:',
          unsubscribed
        );

        console.log('========================================');
        console.log(
          '[PUSH DEBUG] DISABLE DESKTOP PUSH SUCCESSFUL'
        );
        console.log('========================================');

        return;
      }
    }

    console.log(
      '[PUSH DEBUG] No matching subscription found to disable.'
    );

  } catch (error) {
    console.error('========================================');
    console.error(
      '[PUSH DEBUG] DISABLE DESKTOP PUSH FAILED'
    );
    console.error('========================================');

    console.error(
      '[PUSH DEBUG] Error:',
      error
    );

    throw error;
  }
}
