// Firestore Listeners Module: Handles setting up real-time listeners for Firestore data changes.

import { debounce } from './utils.js'; // Assuming debounce is in utils.js

// pageLoaders will be an object like:
// { loadProducts, loadInventory, loadTransactions, initializeShipmentFeature }
// These are the functions that will be called to refresh page content when data changes.
export function initializeFirestoreListeners(mainContentArea, pageLoaders) {
    if (!mainContentArea) {
        console.error("firestoreListeners.js: mainContentArea is required.");
        return;
    }
    if (!pageLoaders || typeof pageLoaders !== 'object') {
        console.error("firestoreListeners.js: pageLoaders object is required.");
        return;
    }

    // Initialize Product Listener
    if (window.indexedDBManagerReady) {
        window.indexedDBManagerReady.then(() => {
            console.log("IndexedDB is ready, attempting to attach product listener via firestoreListeners.js");
            if (window.productAPI && typeof window.productAPI.listenToProductChanges === 'function') {
                if (typeof pageLoaders.loadProducts !== 'function') {
                    console.warn('pageLoaders.loadProducts is not a function. Product listener updates may not refresh UI.');
                    return; // Or provide a no-op function
                }
                const debouncedLoadProductsCallback = debounce(pageLoaders.loadProducts, 500);

                window.productAPI.listenToProductChanges((updateInfo) => {
                    if (updateInfo.error) {
                        console.error("Error from product listener callback:", updateInfo.error);
                        return;
                    }
                    console.log('Product data changed via listener (firestoreListeners.js):', updateInfo);
                    const activePageLi = document.querySelector('.sidebar nav ul li.active');
                    if (activePageLi && activePageLi.dataset.page === 'products') {
                        console.log('Product page is active, reloading product list via debounced function...');
                        debouncedLoadProductsCallback(mainContentArea);
                    } else {
                        console.log("Product page not active, IndexedDB updated in background.");
                    }
                });
            } else {
                console.warn('productAPI.listenToProductChanges is not available to attach listener (firestoreListeners.js).');
            }
        }).catch(err => {
            console.error("Failed to initialize IndexedDBManager (firestoreListeners.js), product listener not attached:", err);
        });
    } else {
        console.error("indexedDBManagerReady promise not found (firestoreListeners.js). Cannot attach product listener.");
    }

    // Initialize Inventory Listener
    if (window.indexedDBManagerReady) {
        window.indexedDBManagerReady.then(() => {
            console.log("IndexedDB is ready, attempting to attach inventory listener via firestoreListeners.js");
            if (window.inventoryAPI && typeof window.inventoryAPI.listenToInventoryChanges === 'function') {
                if (typeof pageLoaders.loadInventory !== 'function') {
                    console.warn('pageLoaders.loadInventory is not a function. Inventory listener updates may not refresh UI.');
                    return;
                }
                const debouncedLoadInventoryCallback = debounce(pageLoaders.loadInventory, 500);

                window.inventoryAPI.listenToInventoryChanges((updateInfo) => {
                    if (updateInfo.error) {
                        console.error("Error from inventory listener callback:", updateInfo.error);
                        return;
                    }
                    console.log('Inventory data changed via listener (firestoreListeners.js):', updateInfo);
                    const activePageLi = document.querySelector('.sidebar nav ul li.active');
                    if (activePageLi && activePageLi.dataset.page === 'inventory') {
                        console.log('Inventory page is active, reloading inventory list via debounced function...');
                        debouncedLoadInventoryCallback(mainContentArea);
                    } else {
                        console.log("Inventory page not active, IndexedDB updated in background.");
                    }
                });
            } else {
                console.warn('inventoryAPI.listenToInventoryChanges is not available to attach listener (firestoreListeners.js).');
            }
        }).catch(err => {
            console.error("Failed to initialize IndexedDBManager (firestoreListeners.js), inventory listener not attached:", err);
        });
    } else {
        console.error("indexedDBManagerReady promise not found (firestoreListeners.js). Cannot attach inventory listener.");
    }

    // Initialize Transaction Listener
    if (window.indexedDBManagerReady) {
        window.indexedDBManagerReady.then(() => {
            console.log("IndexedDB is ready, attempting to attach transaction listener via firestoreListeners.js");
            if (window.transactionAPI && typeof window.transactionAPI.listenToTransactionChanges === 'function') {
                 if (typeof pageLoaders.loadTransactions !== 'function') {
                    console.warn('pageLoaders.loadTransactions is not a function. Transaction listener updates may not refresh UI.');
                    return;
                }
                const debouncedLoadTransactionsCallback = debounce(pageLoaders.loadTransactions, 500);

                window.transactionAPI.listenToTransactionChanges((updateInfo) => {
                    if (updateInfo.error) {
                        console.error("Error from transaction listener callback:", updateInfo.error);
                        return;
                    }
                    console.log('Transaction data changed via listener (firestoreListeners.js):', updateInfo);
                    const activePageLi = document.querySelector('.sidebar nav ul li.active');
                    if (activePageLi && activePageLi.dataset.page === 'transactions') {
                        console.log('Transaction page is active, reloading transaction list via debounced function...');
                        debouncedLoadTransactionsCallback(mainContentArea);
                    } else {
                        console.log("Transaction page not active, IndexedDB updated in background.");
                    }
                });
            } else {
                console.warn('transactionAPI.listenToTransactionChanges is not available to attach listener (firestoreListeners.js).');
            }
        }).catch(err => {
            console.error("Failed to initialize IndexedDBManager (firestoreListeners.js), transaction listener not attached:", err);
        });
    } else {
        console.error("indexedDBManagerReady promise not found (firestoreListeners.js). Cannot attach transaction listener.");
    }

    // Initialize Shipment Listener
    if (window.indexedDBManagerReady) {
        window.indexedDBManagerReady.then(() => {
            console.log("IndexedDB is ready, attempting to attach shipment listener via firestoreListeners.js");
            if (window.shipmentAPI && typeof window.shipmentAPI.listenToShipmentChanges === 'function') {
                if (typeof pageLoaders.initializeShipmentFeature !== 'function') {
                    console.warn('pageLoaders.initializeShipmentFeature is not a function. Shipment listener updates may not refresh UI.');
                    return;
                }
                // Shipment page re-initialization might be more complex than just reloading data.
                // It might involve re-fetching HTML and re-attaching event listeners.
                // The `initializeShipmentFeature` function itself should handle this.
                const debouncedInitializeShipmentFeatureCallback = debounce(pageLoaders.initializeShipmentFeature, 500);

                window.shipmentAPI.listenToShipmentChanges((updateInfo) => {
                    if (updateInfo.error) {
                        console.error("Error from shipment listener callback:", updateInfo.error);
                        return;
                    }
                    console.log('Shipment data changed via listener (firestoreListeners.js):', updateInfo);
                    const activePageLi = document.querySelector('.sidebar nav ul li.active');
                    if (activePageLi && activePageLi.dataset.page === 'shipment') {
                        console.log('Shipment page is active, re-initializing shipment feature via debounced function...');
                        debouncedInitializeShipmentFeatureCallback(mainContentArea); // initializeShipmentFeature might not need mainContentArea if it selects its own elements
                    } else {
                        console.log("Shipment page not active, IndexedDB updated in background.");
                    }
                });
            } else {
                console.warn('shipmentAPI.listenToShipmentChanges is not available to attach listener (firestoreListeners.js).');
            }
        }).catch(err => {
            console.error("Failed to initialize IndexedDBManager (firestoreListeners.js), shipment listener not attached:", err);
        });
    } else {
        console.error("indexedDBManagerReady promise not found (firestoreListeners.js). Cannot attach shipment listener.");
    }
}
