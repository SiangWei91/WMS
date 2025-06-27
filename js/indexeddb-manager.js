const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 2; // Incremented version to ensure onupgradeneeded runs
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
                productStore.createIndex('chineseName', 'chineseName', { unique: false }); // Corrected keyPath
                console.log(`Object store '${STORE_NAMES.PRODUCTS}' created.`);
            } else {
                // If the store exists, check and add the new index if missing (for upgrades)
                const transaction = event.target.transaction;
                if (transaction) { // Should always be true in onupgradeneeded
                    const productStore = transaction.objectStore(STORE_NAMES.PRODUCTS);
                    if (!productStore.indexNames.contains('chineseName')) {
                        productStore.createIndex('chineseName', 'chineseName', { unique: false }); // Corrected keyPath
                        console.log("Index 'chineseName' created on products store.");
                    }
                }
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
                transactionStore.createIndex('transactionDate', 'transactionDate', { unique: false }); // Corrected index name
                console.log(`Object store '${STORE_NAMES.TRANSACTIONS}' created.`);
            } else {
                // Handle upgrade: if store exists, check/delete old 'timestamp' index and add 'transactionDate'
                const transaction = event.target.transaction;
                if (transaction) {
                    const transactionStore = transaction.objectStore(STORE_NAMES.TRANSACTIONS);
                    if (transactionStore.indexNames.contains('timestamp')) {
                        transactionStore.deleteIndex('timestamp');
                        console.log("Index 'timestamp' deleted from transactions store.");
                    }
                    if (!transactionStore.indexNames.contains('transactionDate')) {
                        transactionStore.createIndex('transactionDate', 'transactionDate', { unique: false });
                        console.log("Index 'transactionDate' created on transactions store.");
                    }
                }
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
 * Adds or updates multiple items in a specified object store in a single transaction.
 * Uses put(), so it will update if the key exists or add if it doesn't.
 * @param {string} storeName The name of the object store.
 * @param {object[]} items The array of items to add or update.
 * @returns {Promise<void>} A promise that resolves when all items have been processed.
 */
async function bulkPutItems(storeName, items) {
    if (!items || items.length === 0) {
        return Promise.resolve();
    }
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = currentDb.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        let itemsProcessed = 0;

        items.forEach(item => {
            const request = store.put(item);
            request.onsuccess = () => {
                itemsProcessed++;
                if (itemsProcessed === items.length) {
                    // All items are processed
                }
            };
            request.onerror = (event) => {
                // Don't abort the whole transaction on a single item error.
                // Log the error and continue.
                console.error(`Error putting item in bulk operation for store ${storeName}:`, item, event.target.error);
                // If one fails, we should ideally roll back or provide feedback.
                // For now, we'll let other successful puts go through unless transaction aborts.
                // To ensure all-or-nothing, the transaction.abort() would be called here,
                // and the promise rejected immediately.
                // However, the current loop structure doesn't lend itself well to aborting
                // after the first error without more complex tracking.
                // Let's keep it simple and log, relying on transaction's default behavior for now.
            };
        });

        transaction.oncomplete = () => {
            console.log(`Bulk operation: Successfully processed ${items.length} items for store ${storeName}.`);
            resolve();
        };
        transaction.onerror = (event) => {
            console.error(`Error in bulk put transaction for store ${storeName}:`, event.target.error);
            reject(`Bulk put transaction error for ${storeName}: ${event.target.error}`);
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
    bulkPutItems, // Added bulkPutItems
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
        // console.warn("IndexedDBManager not available. Sync deferred."); // Already logged by ensureDbManager if called
        return;
    }

    console.log("Attempting to sync offline queue...");
    const queueStoreName = window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE;
    let pendingOperations;
    try {
        pendingOperations = await window.indexedDBManager.getAllItems(queueStoreName);
    } catch (error) {
        console.error("Sync: Error fetching items from offline queue:", error);
        return;
    }

    if (!pendingOperations || pendingOperations.length === 0) {
        console.log("Sync: Offline queue is empty.");
        return;
    }

    console.log(`Sync: Found ${pendingOperations.length} item(s) in the offline queue.`);

    for (const op of pendingOperations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
        let success = false;
        console.log(`Sync: Processing op ID ${op.id} - ${op.operation} on ${op.storeName}`);
        try {
            if (op.storeName === window.indexedDBManager.STORE_NAMES.PRODUCTS) {
                const productPayload = op.payload;
                const itemId = op.itemId || (productPayload ? productPayload.id : null);

                if (op.operation === 'add') {
                    const firestoreData = { ...productPayload };
                    delete firestoreData.id; delete firestoreData.pendingSync;
                    if (firestoreData.createdAt) firestoreData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    if (firestoreData.updatedAt) delete firestoreData.updatedAt;
                    
                    const docRef = await window.db.collection('products').add(firestoreData);
                    const originalLocalItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productPayload.id);
                    if (originalLocalItem) {
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productPayload.id);
                        originalLocalItem.id = docRef.id; originalLocalItem.pendingSync = false;
                        await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, originalLocalItem);
                    } else {
                         const newItemWithFirestoreId = { ...firestoreData, id: docRef.id, createdAt: new Date().toISOString()};
                         await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, newItemWithFirestoreId);
                    }
                    success = true;
                    console.log(`Sync: Product ADD success - local ${productPayload.id} to FS ID ${docRef.id}`);
                } else if (op.operation === 'update' && itemId) {
                    const firestoreUpdateData = { ...productPayload };
                    delete firestoreUpdateData.id; delete firestoreUpdateData.pendingSync;
                    firestoreUpdateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    await window.db.collection('products').doc(itemId).update(firestoreUpdateData);
                    const productInDb = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, itemId);
                    if (productInDb) {
                        productInDb.pendingSync = false;
                        await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productInDb);
                    }
                    success = true;
                    console.log(`Sync: Product UPDATE success for ID ${itemId}`);
                } else if (op.operation === 'delete' && itemId) {
                    await window.db.collection('products').doc(itemId).delete();
                    success = true;
                    console.log(`Sync: Product DELETE success for ID ${itemId}`);
                }
            } else if (op.storeName === 'transactions' && (op.operation === 'inbound' || op.operation === 'outbound')) {
                const firestorePayload = { ...op.payload };
                delete firestorePayload.id; delete firestorePayload.pendingSync; delete firestorePayload.transactionDate;
                if (op.operation === 'inbound') await window.transactionAPI.inboundStock(firestorePayload);
                else if (op.operation === 'outbound') await window.transactionAPI.outboundStock(firestorePayload);
                success = true;
                console.log(`Sync: ${op.operation.toUpperCase()} transaction success for product ${op.payload.productCode}`);
            } else if (op.storeName === window.indexedDBManager.STORE_NAMES.SHIPMENTS) {
                const shipmentPayload = op.payload;
                const shipmentId = op.itemId || (shipmentPayload ? shipmentPayload.id : null);
                if (op.operation === 'add') {
                    const firestorePayload = { ...shipmentPayload };
                    delete firestorePayload.id; delete firestorePayload.pendingSync; delete firestorePayload.createdAt;
                    const newShipment = await window.shipmentAPI.addShipment(firestorePayload); // Relies on API to handle IDB update correctly
                    if (shipmentPayload.id && shipmentPayload.id.startsWith('local_shipment_')) {
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentPayload.id);
                    }
                    success = true;
                    console.log(`Sync: Shipment ADD success, new ID: ${newShipment.id}`);
                } else if (op.operation === 'update' && shipmentId) {
                    const firestorePayload = { ...shipmentPayload };
                    delete firestorePayload.id; delete firestorePayload.pendingSync;
                    await window.shipmentAPI.updateShipment(shipmentId, firestorePayload);
                    success = true;
                    console.log(`Sync: Shipment UPDATE success for ID ${shipmentId}`);
                } else if (op.operation === 'delete' && shipmentId) {
                    await window.shipmentAPI.deleteShipment(shipmentId);
                    success = true;
                    console.log(`Sync: Shipment DELETE success for ID ${shipmentId}`);
                }
            } else if (op.storeName === 'shipment_excel_file' && op.operation === 'process_excel_shipment') {
                if (window.shipmentProcessor && typeof window.shipmentProcessor.processQueuedShipmentData === 'function') {
                    const result = await window.shipmentProcessor.processQueuedShipmentData(
                        op.payload.allExtractedData, op.payload.containerNumber, op.payload.storedDate
                    );
                    if (result.success) {
                        success = true;
                        console.log(`Sync: Queued Excel shipment processed. ${result.message}`);
                    } else {
                        console.error(`Sync: Error processing queued Excel shipment: ${result.message || 'Unknown processor error.'}`);
                    }
                } else {
                    console.error("Sync: shipmentProcessor.processQueuedShipmentData unavailable.");
                }
            }

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
