/* Firebase Cloud Messaging — background (gerado no build) */
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');
firebase.initializeApp({"apiKey":"AIzaSyCmHj734xJ6Fv4mgjDHwADwOTrnKq8ug6M","authDomain":"joga-ai-f7622.firebaseapp.com","projectId":"joga-ai-f7622","storageBucket":"joga-ai-f7622.firebasestorage.app","messagingSenderId":"878466679111","appId":"1:878466679111:web:d057e948af6f5d4f7c0c62"});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? payload.data?.title ?? "Joga AI";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  const link = payload.data?.link ?? "/";
  self.registration.showNotification(title, {
    body,
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    data: { link },
    tag: payload.data?.notifId,
  });
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/";
  event.waitUntil(clients.openWindow(link));
});