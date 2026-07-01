/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || "",
  authDomain: self.FIREBASE_AUTH_DOMAIN || "",
  projectId: self.FIREBASE_PROJECT_ID || "joga-ai-f7622",
  storageBucket: self.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: self.FIREBASE_APP_ID || "",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Joga AI";
  const options = {
    body: payload.notification?.body || "",
    icon: "/favicon.ico",
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});
