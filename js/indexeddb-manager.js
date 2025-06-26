const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 1;
let iDb; // Renamed from db to avoid potential clashes

const STORE_NAMES = {
    PRODUCTS: 'products',
    INVENTORY: 'inventory',
    TRANSACTIONS: 'transactions',
    SHIPMENTS: 'shipments',
    OFFLINE_QUEUE: 'offlineQueue'
};

/**
 * Initializes the IndexedDB database.
 * Creates object stores if they don't exist or upgrades the DB if version changes.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        if (iDb) {
            return resolve(iDb);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject('Error opening IndexedDB: ' + event.target.errorCode);
        };

        request.onsuccess = (event) => {
            iDb = event.target.result; // Corrected: use iDb
            console.log('IndexedDB opened successfully.');
            resolve(iDb); // Corrected: use iDb
        };

        request.onupgradeneeded = (event) => {
            const tempDb = event.target.result;
            console.log(`Upgrading IndexedDB from version ${event.oldVersion} to ${event.newVersion}`);

            // Products store
            if (!tempDb.objectStoreNames.contains(STORE_NAMES.PRODUCTS)) {
                const productStore = tempDb.createObjectStore(STORE_NAMES.PRODUCTS, { keyPath: 'id', autoIncrement: false });
                productStore.createIndex('productCode', 'productCode', { unique: true });
                productStore.createIndex('name', 'name', { unique: false });
                console.log(`Object store '${STORE_NAMES.PRODUCTS}' created.`);
            }

            // Inventory store (caching documents from inventory_aggregated, using productCode as key)
            if (tempDb.objectStoreNames.contains(STORE_NAMES.INVENTORY)) {
                tempDb.deleteObjectStore(STORE_NAMES.INVENTORY);
                console.log(`Object store '${STORE_NAMES.INVENTORY}' deleted for schema update.`);
            }
            // Create new store with productCode as keyPath
            const inventoryStore = tempDb.createObjectStore(STORE_NAMES.INVENTORY, { keyPath: 'productCode' });
            // Add any indexes you might need for querying cached aggregated inventory, e.g., totalQuantity
            // For now, no additional indexes beyond the keyPath 'productCode'.
            console.log(`Object store '${STORE_NAMES.INVENTORY}' created/updated with keyPath 'productCode'.`);


            // Transactions store
            if (!tempDb.objectStoreNames.contains(STORE_NAMES.TRANSACTIONS)) {
                const transactionStore = tempDb.createObjectStore(STORE_NAMES.TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
                transactionStore.createIndex('type', 'type', { unique: false }); // e.g., 'inbound', 'outbound'
                transactionStore.createIndex('productId', 'productId', { unique: false });
                transactionStore.createIndex('productCode', 'productCode', { unique: false });
                transactionStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log(`Object store '${STORE_NAMES.TRANSACTIONS}' created.`);
            }
            
            // Shipments store
            if (tempDb.objectStoreNames.contains(STORE_NAMES.SHIPMENTS)) {
                tempDb.deleteObjectStore(STORE_NAMES.SHIPMENTS);
                console.log(`Object store '${STORE_NAMES.SHIPMENTS}' deleted for schema update.`);
            }
            const shipmentStore = tempDb.createObjectStore(STORE_NAMES.SHIPMENTS, { keyPath: 'id' }); // autoIncrement: false is default if not specified
            shipmentStore.createIndex('shipmentDate', 'shipmentDate', { unique: false });
            shipmentStore.createIndex('status', 'status', { unique: false }); // e.g., 'pending', 'shipped', 'delivered'
            console.log(`Object store '${STORE_NAMES.SHIPMENTS}' created/updated with keyPath 'id'.`);
            

            // Offline Queue store
            if (!tempDb.objectStoreNames.contains(STORE_NAMES.OFFLINE_QUEUE)) {
                const queueStore = tempDb.createObjectStore(STORE_NAMES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
                queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                queueStore.createIndex('storeName', 'storeName', { unique: false });
                console.log(`Object store '${STORE_NAMES.OFFLINE_QUEUE}' created.`);
            }
            iDb = tempDb; // Assign the upgraded DB to the global iDb variable
        };
    });
}

/**
 * Adds an item to a specified object store.
 * @param {string} storeName The name of the object store.
 * @param {object} item The item to add.
 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the added item.
 */
async function addItem(storeName, item) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(item);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error adding item to ${storeName}:`, event.target.error);
            reject(`Error adding item to ${storeName}: ${event.target.error}`);
        };
    });
}

/**
 * Gets an item by its key from a specified object store.
 * @param {string} storeName The name of the object store.
 * @param {IDBValidKey} key The key of the item to retrieve.
 * @returns {Promise<object|undefined>} A promise that resolves with the item, or undefined if not found.
 */
async function getItem(storeName, key) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error getting item from ${storeName}:`, event.target.error);
            reject(`Error getting item from ${storeName}: ${event.target.error}`);
        };
    });
}

/**
 * Gets all items from a specified object store.
 * @param {string} storeName The name of the object store.
 * @returns {Promise<object[]>} A promise that resolves with an array of items.
 */
async function getAllItems(storeName) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error getting all items from ${storeName}:`, event.target.error);
            reject(`Error getting all items from ${storeName}: ${event.target.error}`);
        };
    });
}

/**
 * Updates an existing item in a specified object store.
 * @param {string} storeName The name of the object store.
 * @param {object} item The item to update. It must contain the key.
 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the updated item.
 */
async function updateItem(storeName, item) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item); // put() also adds if item doesn't exist, or updates if it does.

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error updating item in ${storeName}:`, event.target.error);
            reject(`Error updating item in ${storeName}: ${event.target.error}`);
        };
    });
}

/**
 * Deletes an item by its key from a specified object store.
 * @param {string} storeName The name of the object store.
 * @param {IDBValidKey} key The key of the item to delete.
 * @returns {Promise<void>} A promise that resolves when the item is deleted.
 */
async function deleteItem(storeName, key) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error(`Error deleting item from ${storeName}:`, event.target.error);
            reject(`Error deleting item from ${storeName}: ${event.target.error}`);
        };
    });
}

/**
 * Gets items by an index from a specified object store.
 * @param {string} storeName The name of the object store.
 * @param {string} indexName The name of the index to query.
 * @param {IDBValidKey} query The value to query the index for.
 * @returns {Promise<object[]>} A promise that resolves with an array of matching items.
 */
async function getItemsByIndex(storeName, indexName, query) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(query); // Or .get(query) for a single expected result

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error getting items by index ${indexName} from ${storeName}:`, event.target.error);
            reject(`Error getting items by index ${indexName} from ${storeName}: ${event.target.error}`);
        };
    });
}

/**
 * Clears all items from a specified object store.
 * @param {string} storeName The name of the object store.
 * @returns {Promise<void>} A promise that resolves when the store is cleared.
 */
async function clearStore(storeName) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error(`Error clearing store ${storeName}:`, event.target.error);
            reject(`Error clearing store ${storeName}: ${event.target.error}`);
        };
    });
}


// Expose the functions and STORE_NAMES to be used by other modules
window.indexedDBManager = {
    initDB,
    addItem,
    getItem,
    getAllItems,
    updateItem,
    deleteItem,
    getItemsByIndex,
    clearStore,
    STORE_NAMES
};

let dbInitializationPromise = null;

function initializeDBOnce() {
    if (!dbInitializationPromise) {
        dbInitializationPromise = initDB().catch(err => {
            console.error("Failed to initialize IndexedDB on load:", err);
            // Reset promise so it can be tried again, or handle error more gracefully
            dbInitializationPromise = null; 
            throw err; // Re-throw to indicate failure to callers
        });
    }
    return dbInitializationPromise;
}

// Expose the promise for other modules to await
window.indexedDBManagerReady = initializeDBOnce();


// Initialize the DB when the script loads - now handled by initializeDBOnce and exposed promise
// initDB().catch(err => console.error("Failed to initialize IndexedDB on load:", err));


// --- Offline Queue Sync Mechanism ---
async function syncOfflineQueue() {
    if (!navigator.onLine) {
        console.log("Offline. Sync deferred.");
        return;
    }
    if (!window.db) {
        console.warn("Firestore 'db' instance not available. Sync deferred.");
        return;
    }
    if (!window.indexedDBManager) {
        console.warn("IndexedDBManager not available. Sync deferred.");
        return;
    }

    console.log("Attempting to sync offline queue...");
    const queueStoreName = window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE;
    let pendingOperations;
    try {
        pendingOperations = await window.indexedDBManager.getAllItems(queueStoreName);
    } catch (error) {
        console.error("Error fetching items from offline queue:", error);
        return;
    }

    if (!pendingOperations || pendingOperations.length === 0) {
        console.log("Offline queue is empty. Nothing to sync.");
        return;
    }

    console.log(`Found ${pendingOperations.length} items in the offline queue.`);

    for (const op of pendingOperations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) { // Process in order
        try {
            let success = false;
            if (op.storeName === window.indexedDBManager.STORE_NAMES.PRODUCTS) {
                const productPayload = op.payload;
                const itemId = op.itemId || (productPayload ? productPayload.id : null);

                if (op.operation === 'add') {
                    // For 'add', the payload contains a temporary local ID.
                    // We need to add to Firestore, get the new Firestore ID,
                    // then update the original item in IndexedDB products store with the Firestore ID,
                    // and remove the 'pendingSync' flag.
                    console.log("Syncing ADD operation for product:", productPayload);
                    const firestoreData = { ...productPayload };
                    delete firestoreData.id; // Remove local temp ID
                    delete firestoreData.pendingSync; // Don't store this in Firestore
                    // Ensure createdAt is a server timestamp if it was set locally
                    if (firestoreData.createdAt) firestoreData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    if (firestoreData.updatedAt) delete firestoreData.updatedAt; // Firestore handles this on creation


                    const docRef = await window.db.collection('products').add(firestoreData);
                    
                    // Update the item in IndexedDB 'products' store with the new Firestore ID
                    const originalLocalItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productPayload.id);
                    if (originalLocalItem) {
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productPayload.id); // Delete old item with local ID
                        originalLocalItem.id = docRef.id; // Update with Firestore ID
                        originalLocalItem.pendingSync = false;
                        // Server timestamp will be slightly different, listener should handle consistency if needed.
                        // Or fetch the doc from Firestore and update IDB again. For now, this is simpler.
                        await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, originalLocalItem);
                         console.log(`Synced ADD: Local product ${productPayload.id} updated to Firestore ID ${docRef.id}`);
                    } else {
                        // If original item is gone, just ensure the new one is there (listener might have added it)
                         const newItemWithFirestoreId = { ...firestoreData, id: docRef.id, createdAt: new Date().toISOString()}; // Reconstruct for IDB
                         await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, newItemWithFirestoreId);
                         console.log(`Synced ADD: Product ${docRef.id} ensured in IndexedDB.`);
                    }
                    success = true;

                } else if (op.operation === 'update' && itemId) {
                    console.log("Syncing UPDATE operation for product ID:", itemId, "Payload:", productPayload);
                    const firestoreUpdateData = { ...productPayload };
                    delete firestoreUpdateData.id; // Don't include ID in update payload
                    delete firestoreUpdateData.pendingSync;
                     // Ensure updatedAt is a server timestamp
                    firestoreUpdateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    if(firestoreUpdateData.createdAt && typeof firestoreUpdateData.createdAt === 'string'){
                        // Assuming createdAt was an ISO string from IDB, Firestore expects Timestamp or to remove it if not changing
                        // For simplicity, if it's there, let it be, or convert. Or remove if it shouldn't be updated.
                        // Let's assume it's fine or handled by Firestore's merge behavior.
                    }

                    await window.db.collection('products').doc(itemId).update(firestoreUpdateData);
                    
                    // Update pendingSync flag in IndexedDB 'products' store
                    const productInDb = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, itemId);
                    if (productInDb) {
                        productInDb.pendingSync = false;
                        // Firestore's server timestamp for updatedAt will be different.
                        // The listener should ideally catch this and update IDB.
                        // Or, fetch from Firestore after update to get the exact server state.
                        // For now, just mark as synced.
                        await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productInDb);
                    }
                    success = true;
                    console.log("Synced UPDATE for product ID:", itemId);

                } else if (op.operation === 'delete' && itemId) {
                    console.log("Syncing DELETE operation for product ID:", itemId);
                    await window.db.collection('products').doc(itemId).delete();
                    // Item is already deleted from IndexedDB 'products' store.
                    success = true;
                    console.log("Synced DELETE for product ID:", itemId);
                }
            } else if (op.storeName === 'transactions' && (op.operation === 'inbound' || op.operation === 'outbound')) {
                // Sync inbound/outbound transactions
                // These call the main transactionAPI functions which write to Firestore 'transactions'
                // The Cloud Function then updates 'inventory_aggregated', and the listener updates IDB.
                // So, we just need to ensure the transactionAPI call succeeds.
                console.log(`Syncing ${op.operation} transaction:`, op.payload);
                if (op.operation === 'inbound' && window.transactionAPI && typeof window.transactionAPI.inboundStock === 'function') {
                    // The payload already contains all necessary data for inboundStock.
                    // We need to remove the temporary client-side 'id' and 'pendingSync' before sending to API if they exist.
                    const firestorePayload = { ...op.payload };
                    delete firestorePayload.id;
                    delete firestorePayload.pendingSync;
                    delete firestorePayload.transactionDate; // Let server set it.

                    await window.transactionAPI.inboundStock(firestorePayload); // Call the original API method
                    success = true;
                    console.log(`Synced INBOUND transaction for productCode: ${op.payload.productCode}`);
                } else if (op.operation === 'outbound' && window.transactionAPI && typeof window.transactionAPI.outboundStock === 'function') {
                    const firestorePayload = { ...op.payload };
                    delete firestorePayload.id;
                    delete firestorePayload.pendingSync;
                    delete firestorePayload.transactionDate;

                    await window.transactionAPI.outboundStock(firestorePayload); // Call the original API method
                    success = true;
                    console.log(`Synced OUTBOUND transaction for productCode: ${op.payload.productCode}`);
                } else {
                    console.warn(`No suitable transactionAPI function found for operation: ${op.operation}`);
                }
            } else if (op.storeName === window.indexedDBManager.STORE_NAMES.SHIPMENTS) {
                // Sync shipment operations
                console.log(`Syncing SHIPMENT operation: ${op.operation}`, op.payload || op.itemId);
                const shipmentPayload = op.payload;
                const shipmentId = op.itemId || (shipmentPayload ? shipmentPayload.id : null);

                if (op.operation === 'add' && window.shipmentAPI && typeof window.shipmentAPI.addShipment === 'function') {
                    const firestorePayload = { ...shipmentPayload };
                    delete firestorePayload.id; // Temp local ID
                    delete firestorePayload.pendingSync;
                    delete firestorePayload.createdAt; // Let server set it

                    // The addShipment in API will handle adding to Firestore and then updating IDB with actual ID.
                    // The listener will then pick up the final state.
                    // Crucially, need to handle the local IDB item replacement with Firestore ID.
                    // The current `addShipment` in API does this if online.
                    // For sync, we are essentially re-doing the "online" part of addShipment.
                    
                    // We need to ensure the local temp item is removed and replaced by the one with Firestore ID.
                    // The listener for shipments should handle adding the item with the Firestore ID.
                    // The main challenge is if the listener adds it before this sync operation fully replaces the temp ID item.
                    // A robust way: call addShipment, then explicitly remove the temp local item from IDB.
                    // The listener should use updateItem (upsert) so it correctly places the server version.

                    const newShipment = await window.shipmentAPI.addShipment(firestorePayload); // This will add to FS, then to IDB with FS ID.
                    // If the original offline add used a temp ID, that temp ID item should be cleaned up from IDB shipments store.
                    // The `addShipment` in API currently adds the `localShipmentData` to IDB first.
                    // When syncing, we are re-adding. The listener should ideally handle the final state.
                    // To be safe, after successful sync of an 'add', ensure the temp local ID version is gone.
                    if (shipmentPayload.id && shipmentPayload.id.startsWith('local_shipment_')) {
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentPayload.id);
                         console.log(`Removed temporary local shipment ${shipmentPayload.id} after sync.`);
                    }
                     // The listener should add/update the item with the Firestore ID.
                    success = true;
                    console.log(`Synced ADD shipment, new ID: ${newShipment.id}`);

                } else if (op.operation === 'update' && shipmentId && window.shipmentAPI && typeof window.shipmentAPI.updateShipment === 'function') {
                    const firestorePayload = { ...shipmentPayload };
                    delete firestorePayload.id;
                    delete firestorePayload.pendingSync;
                    // `updatedAt` will be set by server in API
                    
                    await window.shipmentAPI.updateShipment(shipmentId, firestorePayload);
                     // updateShipment in API updates IDB after FS. Listener also updates.
                    success = true;
                    console.log(`Synced UPDATE for shipment ID: ${shipmentId}`);

                } else if (op.operation === 'delete' && shipmentId && window.shipmentAPI && typeof window.shipmentAPI.deleteShipment === 'function') {
                    await window.shipmentAPI.deleteShipment(shipmentId); // API handles FS and IDB delete
                    success = true;
                    console.log(`Synced DELETE for shipment ID: ${shipmentId}`);
                } else {
                     console.warn(`No suitable shipmentAPI function found for shipment operation: ${op.operation}`);
                }
            }
            // Add similar blocks for other storeNames or operations later

            if (success) {
                await window.indexedDBManager.deleteItem(queueStoreName, op.id);
                console.log(`Successfully synced operation ID ${op.id} and removed from queue.`);
            } else {
                console.warn(`Operation ID ${op.id} could not be processed (unsupported type or missing data). It remains in queue.`);
            }

        } catch (error) {
            console.error(`Failed to sync operation ID ${op.id} (${op.operation} on ${op.storeName}):`, error);
            // Optionally, implement a retry counter or move to a "failed_sync_ops" store after N retries.
            // For now, it stays in the queue and will be retried next time.
        }
    }
    console.log("Offline queue sync attempt finished.");
}

// Listen for online/offline status changes
window.addEventListener('online', syncOfflineQueue);
// window.addEventListener('offline', () => console.log("App is now offline.")); // Optional: UI update

// Attempt sync when app loads, after a delay to ensure DBs are ready
setTimeout(() => {
    // Now uses the exposed promise
    window.indexedDBManagerReady.then(() => {
        console.log("IndexedDB is ready, proceeding with initial syncOfflineQueue call.");
        syncOfflineQueue();
    }).catch(err => console.error("DB init failed, cannot perform initial sync:", err));
}, 5000); // Delay initial sync slightly
