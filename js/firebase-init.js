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
const db = firebase.firestore(); // Using global firebase.firestore from CDN, compat version

// Make db available, e.g., by attaching to window if not using modules,
// or prepare for export if you switch to modules later.
// window.db = db; // Commented out as product operations are moving to Supabase.
                  // If other Firestore collections are used, this might need to be handled differently.

console.log('Firebase initialized. Firestore instance created but window.db is not globally assigned by default anymore for product migration.');
