// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBlCIulAiTlGk7wv0_bv-rfj500LWZ4pas',
  authDomain: 'inventory-management-sys-b3678.firebaseapp.com',
  projectId: 'inventory-management-sys-b3678',
  storageBucket: 'inventory-management-sys-b3678.firebasestorage.app',
  messagingSenderId: '235984176008',
  appId: '1:235984176008:web:84671d8dc3292689e5b03d',
};

// Initialize Firebase
// These are ESM imports, but we're using global `firebase` from CDN for now.
// import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
// import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const app = firebase.initializeApp(firebaseConfig); // Using global firebase from CDN
// const db = firebase.firestore(); // Firestore instance for inventory/transactions is no longer needed here.
                                  // Other Firebase services like Auth are still initialized by the app instance.

// window.db = db; // Firestore instance for inventory/transactions is no longer exposed globally from here.
                  // If other parts of the app still use Firestore directly via window.db for other collections,
                  // this would need careful conditional initialization.

console.log('Firebase app initialized (Auth may still be in use). Firestore for inventory/transactions is being replaced by Supabase.');
