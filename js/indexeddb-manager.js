const DB_NAME = 'InventoryAppDB';
const DB_VERSION = 3; // Incremented version for product_code refactor
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
            if (tempDb.objectStoreNames.contains(STORE_NAMES.PRODUCTS)) {
                tempDb.deleteObjectStore(STORE_NAMES.PRODUCTS);
                console.log(`Object store '${STORE_NAMES.PRODUCTS}' deleted for schema update (product_code refactor).`);
            }
            const productStore = tempDb.createObjectStore(STORE_NAMES.PRODUCTS, { keyPath: 'id', autoIncrement: false });
            productStore.createIndex('product_code', 'product_code', { unique: true }); // CHANGED
            productStore.createIndex('name', 'name', { unique: false });
            productStore.createIndex('chineseName', 'chineseName', { unique: false });
            console.log(`Object store '${STORE_NAMES.PRODUCTS}' created/updated with 'product_code' index.`);

            // Inventory store (caching documents from inventory_aggregated, using product_code as key)
            if (tempDb.objectStoreNames.contains(STORE_NAMES.INVENTORY)) {
                tempDb.deleteObjectStore(STORE_NAMES.INVENTORY);
                console.log(`Object store '${STORE_NAMES.INVENTORY}' deleted for schema update (product_code refactor).`);
            }
            // Create new store with product_code as keyPath
            const inventoryStore = tempDb.createObjectStore(STORE_NAMES.INVENTORY, { keyPath: 'product_code' }); // CHANGED
            // Add any indexes you might need for querying cached aggregated inventory, e.g., totalQuantity
            // For now, no additional indexes beyond the keyPath 'product_code'. // CHANGED
            console.log(`Object store '${STORE_NAMES.INVENTORY}' created/updated with keyPath 'product_code'.`); // CHANGED


            // Transactions store
            if (tempDb.objectStoreNames.contains(STORE_NAMES.TRANSACTIONS)) {
                tempDb.deleteObjectStore(STORE_NAMES.TRANSACTIONS);
                console.log(`Object store '${STORE_NAMES.TRANSACTIONS}' deleted for schema update (product_code refactor).`);
            }
            const transactionStore = tempDb.createObjectStore(STORE_NAMES.TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
            transactionStore.createIndex('type', 'type', { unique: false }); // e.g., 'inbound', 'outbound'
            transactionStore.createIndex('productId', 'productId', { unique: false }); // Kept as is, assuming different identifier
            transactionStore.createIndex('product_code', 'product_code', { unique: false }); // CHANGED
            transactionStore.createIndex('transactionDate', 'transactionDate', { unique: false });
            console.log(`Object store '${STORE_NAMES.TRANSACTIONS}' created/updated with 'product_code' index.`);
            
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

        request.onsuccess = () => {
            console.log(`Store "${storeName}" cleared successfully from IndexedDB.`);
            resolve();
        };
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


/**
 * Counts all items in a specified object store.
 * @param {string} storeName The name of the object store.
 * @returns {Promise<number>} A promise that resolves with the number of items in the store.
 */
async function countItems(storeName) {
    const currentDb = await initDB();
    return new Promise((resolve, reject) => {
        if (!currentDb.objectStoreNames.contains(storeName)) {
            console.warn(`Store "${storeName}" not found for counting. Returning 0.`);
            return resolve(0);
        }
        const transaction = currentDb.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error(`Error counting items in ${storeName}:`, event.target.error);
            reject(`Error counting items in ${storeName}: ${event.target.error}`);
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
    bulkPutItems,
    countItems, // Added new countItems method
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
    // Check for Supabase client instead of Firestore db
    if (!window.supabaseClient) {
        console.warn("Supabase client instance not available. Sync deferred.");
        return;
    }
    if (!window.indexedDBManager) {
        return;
    }

    console.log("Attempting to sync offline queue to Supabase...");
    const queueStoreName = window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE;
    let pendingOperations;
    try {
        pendingOperations = await window.indexedDBManager.getAllItems(queueStoreName);
    } catch (error) {
        console.error("Sync (Supabase): Error fetching items from offline queue:", error);
        return;
    }

    if (!pendingOperations || pendingOperations.length === 0) {
        console.log("Sync (Supabase): Offline queue is empty.");
        return;
    }

    console.log(`Sync (Supabase): Found ${pendingOperations.length} item(s) in the offline queue.`);

    for (const op of pendingOperations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
        let success = false;
        console.log(`Sync (Supabase): Processing op ID ${op.id} - ${op.operation} on ${op.storeName}`);
        try {
            // Payloads in op.payload are expected to be in JS object format.
            // They need to be mapped to Supabase column names before sending.

            if (op.storeName === STORE_NAMES.PRODUCTS) {
                const jsProductPayload = op.payload; // JS object
                const itemId = op.itemId || (jsProductPayload ? jsProductPayload.id : null) || op.localId; // Prefer itemId (actual DB ID), then payload.id, then localId

                // Map JS object to Supabase object using productAPI's helper if available, or a local one
                const supabaseData = window.productAPI && typeof window.productAPI.jsToSupabaseProduct === 'function' 
                    ? window.productAPI.jsToSupabaseProduct(jsProductPayload) 
                    : jsToSupabaseProductPayload(jsProductPayload); // Fallback to a local mapper

                if (op.operation === 'add') {
                    // Remove localId if it was part of the payload sent to Supabase
                    // product_code is the PK for products table.
                    if (supabaseData.id) delete supabaseData.id; // IDB's local_... id
                    
                    const { data: newSupabaseProduct, error } = await window.supabaseClient
                        .from('products')
                        .insert(supabaseData) // supabaseData should have product_code
                        .select()
                        .single();
                    if (error) throw error;
                    
                    // Update IndexedDB with the confirmed data from Supabase (especially the actual ID if it was local)
                    const syncedJsProduct = window.productAPI && typeof window.productAPI.supabaseToJsProduct === 'function'
                        ? window.productAPI.supabaseToJsProduct(newSupabaseProduct)
                        : supabaseToJsProductPayload(newSupabaseProduct); // Fallback mapper
                    
                    if (op.localId) { // If it was a truly new item created offline
                        await window.indexedDBManager.deleteItem(STORE_NAMES.PRODUCTS, op.localId);
                         // Add with the ID from Supabase (which should be productCode)
                        await window.indexedDBManager.addItem(STORE_NAMES.PRODUCTS, { ...syncedJsProduct, pendingSync: false });
                        console.log(`Sync (Supabase): Product ADD success - local ${op.localId} synced as ${syncedJsProduct.id}`);
                    } else if (itemId) { // Should not happen for add if localId was used
                         await window.indexedDBManager.updateItem(STORE_NAMES.PRODUCTS, { ...syncedJsProduct, pendingSync: false });
                         console.log(`Sync (Supabase): Product ADD (idempotent) success for ${syncedJsProduct.id}`);
                    }
                    success = true;
                } else if (op.operation === 'update' && itemId) {
                    // For update, itemId should be the product_code
                    delete supabaseData.product_code; // Cannot update primary key, and ensure it's not in payload if it's the same as jsProductPayload.product_code
                    delete supabaseData.id; // remove local id if present
                    const { error } = await window.supabaseClient
                        .from('products')
                        .update(supabaseData)
                        .eq('product_code', itemId); // Filter by product_code
                    if (error) throw error;
                    const productInDb = await window.indexedDBManager.getItem(STORE_NAMES.PRODUCTS, itemId);
                    if (productInDb) {
                        await window.indexedDBManager.updateItem(STORE_NAMES.PRODUCTS, {...productInDb, ...jsProductPayload, pendingSync: false });
                    }
                    success = true;
                    console.log(`Sync (Supabase): Product UPDATE success for product_code ${itemId}`);
                } else if (op.operation === 'delete' && itemId) {
                    const { error } = await window.supabaseClient.from('products').delete().eq('product_code', itemId); // Filter by product_code
                    if (error) throw error;
                    // Item already deleted from IDB
                    success = true;
                    console.log(`Sync (Supabase): Product DELETE success for product_code ${itemId}`);
                }

            } else if (op.storeName === STORE_NAMES.TRANSACTIONS) {
                // transactionAPI's inbound/outbound already handle online/offline and mapping
                // The payload here should be the raw data for these functions.
                // We just need to ensure these API functions are called.
                // The API functions themselves will perform the Supabase operation.
                const txData = op.payload; // This is JS object
                if (op.operation === 'inbound' && window.transactionAPI && typeof window.transactionAPI.inboundStock === 'function') {
                    await window.transactionAPI.inboundStock(txData); // This will handle Supabase interaction
                    success = true;
                } else if (op.operation === 'outbound' && window.transactionAPI && typeof window.transactionAPI.outboundStock === 'function') {
                    await window.transactionAPI.outboundStock(txData); // This will handle Supabase interaction
                    success = true;
                }
                 if (success) console.log(`Sync (Supabase): Transaction ${op.operation} for ${txData.product_code} delegated to API.`); // CHANGED


            } else if (op.storeName === STORE_NAMES.SHIPMENTS) {
                // Similar to transactions, use shipmentAPI methods which are now Supabase-aware
                const shipmentJsPayload = op.payload;
                const shipmentId = op.itemId || (shipmentJsPayload ? shipmentJsPayload.id : null) || op.localId;

                if (op.operation === 'add') {
                    // shipmentAPI.addShipment expects JS payload, returns JS payload
                    const newSyncedShipment = await window.shipmentAPI.addShipment(shipmentJsPayload);
                     if (op.localId && newSyncedShipment.id !== op.localId) {
                        // If API created a new ID (from Supabase), update IDB
                        await window.indexedDBManager.deleteItem(STORE_NAMES.SHIPMENTS, op.localId);
                        await window.indexedDBManager.addItem(STORE_NAMES.SHIPMENTS, { ...newSyncedShipment, pendingSync: false });
                    } else {
                        await window.indexedDBManager.updateItem(STORE_NAMES.SHIPMENTS, { ...newSyncedShipment, pendingSync: false });
                    }
                    success = true;
                    console.log(`Sync (Supabase): Shipment ADD success, new/synced ID: ${newSyncedShipment.id}`);
                } else if (op.operation === 'update' && shipmentId) {
                    await window.shipmentAPI.updateShipment(shipmentId, shipmentJsPayload); // API handles IDB update
                    success = true;
                    console.log(`Sync (Supabase): Shipment UPDATE success for ID ${shipmentId}`);
                } else if (op.operation === 'delete' && shipmentId) {
                    await window.shipmentAPI.deleteShipment(shipmentId); // API handles IDB update
                    success = true;
                    console.log(`Sync (Supabase): Shipment DELETE success for ID ${shipmentId}`);
                }
            } else if (op.storeName === 'shipment_excel_file' && op.operation === 'process_excel_shipment') {
                if (window.shipmentProcessor && typeof window.shipmentProcessor.processQueuedShipmentData === 'function') {
                    // This function is already updated to use Supabase directly for its operations
                    const result = await window.shipmentProcessor.processQueuedShipmentData(
                        op.payload.allExtractedData, op.payload.containerNumber, op.payload.storedDate
                    );
                    if (result.success) {
                        success = true;
                        console.log(`Sync (Supabase): Queued Excel shipment processed. ${result.message}`);
                    } else {
                        console.error(`Sync (Supabase): Error processing queued Excel shipment: ${result.message || 'Unknown processor error.'}`);
                    }
                } else {
                    console.error("Sync (Supabase): shipmentProcessor.processQueuedShipmentData unavailable.");
                }
            }


            if (success) {
                await window.indexedDBManager.deleteItem(queueStoreName, op.id);
                console.log(`Sync (Supabase): Successfully synced operation ID ${op.id} and removed from queue.`);
            } else {
                console.warn(`Sync (Supabase): Operation ID ${op.id} could not be processed (unsupported type or error). It remains in queue.`);
            }

        } catch (error) {
            console.error(`Sync (Supabase): Failed to sync operation ID ${op.id} (${op.operation} on ${op.storeName}):`, error);
        }
    }
    console.log("Offline queue sync attempt (Supabase) finished.");
}

// Fallback mappers if not found on productAPI (should ideally not be needed if productAPI is well-defined)
function jsToSupabaseProductPayload(jsProduct) {
    if (!jsProduct) return null;
    return {
        product_code: jsProduct.product_code, name: jsProduct.name, packaging: jsProduct.packaging, // CHANGED
        ChineseName: jsProduct['Chinese Name'], group: jsProduct.group, brand: jsProduct.brand,
        // created_at, updated_at are typically handled by db
    };
}
function supabaseToJsProductPayload(supabaseProduct) {
    if (!supabaseProduct) return null;
    return {
        id: supabaseProduct.product_code, product_code: supabaseProduct.product_code, name: supabaseProduct.name, // CHANGED
        packaging: supabaseProduct.packaging, 'Chinese Name': supabaseProduct.ChineseName,
        group: supabaseProduct.group, brand: supabaseProduct.brand, createdAt: supabaseProduct.created_at,
        updatedAt: supabaseProduct.updated_at,
    };
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
