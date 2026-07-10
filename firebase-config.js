/* ============================================================
   FIREBASE CONFIG
   ------------------------------------------------------------
   1. Ve a https://console.firebase.google.com
   2. Crea un proyecto nuevo (ej: "portal-jaime")
   3. Agrega una app "Web" dentro del proyecto
   4. Copia el objeto de configuración que te da Firebase y
      pégalo aquí abajo, reemplazando los valores de ejemplo.
   5. Activa en el proyecto: Authentication (Email/Password),
      Firestore Database, y Storage. Ver README.md para el
      paso a paso completo.
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB4drq2Ic0vCpr9wxkCWiXU6M-ZraN9JKE",
  authDomain: "datos-jaime.firebaseapp.com",
  projectId: "datos-jaime",
  storageBucket: "datos-jaime.firebasestorage.app",
  messagingSenderId: "600834845829",
  appId: "1:600834845829:web:126947c77450e986c2cdec"
};

/* ============================================================
   ROLES
   ------------------------------------------------------------
   Correos que tienen acceso. Créalos en Firebase Authentication
   (Authentication → Users → Add user) con la contraseña que
   quieras para cada uno.
   ============================================================ */
const AGENCY_EMAILS = ["alexvar2025fut@gmail.com"];   // correo de la agencia
const CLIENT_EMAILS = ["jaimeinfo96@gmail.com"];       // correo de Jaime

const CLIENT_NAME = "Jaime Barbosa";
const AGENCY_NAME = "AUNADS AGENCIA";

/* No tocar de aquí para abajo — expone las variables de arriba a app.js */
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.AGENCY_EMAILS = AGENCY_EMAILS;
window.CLIENT_EMAILS = CLIENT_EMAILS;
window.CLIENT_NAME = CLIENT_NAME;
window.AGENCY_NAME = AGENCY_NAME;
