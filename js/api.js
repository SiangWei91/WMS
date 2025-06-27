// Main API entry point - Refactored for modularity

// The individual API modules (productAPI.js, inventoryAPI.js, etc.),
// along with helpers (helpers.js) and listener declarations (listeners.js),
// should be loaded via <script> tags in the HTML *before* this file,
// or at least before any other script that depends on them.

// Each individual API module (e.g., js/api/productAPI.js) is now responsible
// for attaching its API object to the window (e.g., window.productAPI = ...).

// This file can be used for any overarching API initialization if needed in the future,
// or simply serve as a central point that signifies the API system.

// Original console log to indicate completion of API setup.
console.log("Main api.js: All API modules expected to be loaded and initialized from their respective files (e.g., js/api/productAPI.js).");

// Note: The actual assignment of window.productAPI, window.inventoryAPI, etc.
// now happens within each respective js/api/*.js file.
// This file is kept for structure and potential future top-level API coordination.

// Example: If there was any shared initialization logic that depended on all modules being loaded,
// it could go here. For now, it's not strictly necessary if modules are self-contained
// and HTML loads them correctly.

// Make sure the loading order in HTML is:
// 1. firebase-init.js (for window.db)
// 2. indexeddb-manager.js (for window.indexedDBManager and window.indexedDBManagerReady)
// 3. js/api/listeners.js
// 4. js/api/helpers.js
// 5. js/api/productAPI.js
// 6. js/api/inventoryAPI.js (depends on productAPI)
// 7. js/api/transactionAPI.js
// 8. js/api/shipmentAPI.js
// 9. js/api/jordonAPI.js
// 10. js/api/dashboardAPI.js
// 11. js/api.js (this file)
// 12. Other app files (app.js, products.js, etc.)
