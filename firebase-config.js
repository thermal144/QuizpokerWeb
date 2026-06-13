// Firebase-Konfiguration
// 1. In Firebase eine Web-App anlegen
// 2. Den config-Block hier einfügen
// 3. firebaseEnabled auf true setzen
window.QUIZPOKER_FIREBASE = {
  firebaseEnabled: false,
  config: {
    apiKey: "DEIN_API_KEY",
    authDomain: "DEIN_PROJEKT.firebaseapp.com",
    projectId: "DEIN_PROJEKT",
    storageBucket: "DEIN_PROJEKT.appspot.com",
    messagingSenderId: "DEINE_SENDER_ID",
    appId: "DEINE_APP_ID"
  }
};
