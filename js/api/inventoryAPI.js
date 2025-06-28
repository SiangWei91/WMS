// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Depends on: listeners.js (inventoryListenerUnsubscribe)
// Depends on: productAPI.js (window.productAPI.getProducts for enrichment)
import { incrementReadCount } from '../firebaseReadCounter.js';

const WAREHOUSE_CACHE_DURATION_MS = 10 * 60 * 1000; 
let warehouseCache = { data: null, timestamp: 0 };

const inventoryAPI_module = { // Renamed to avoid conflict if script loaded multiple times before window assignment
    async getInventory() {
        try {
            await ensureDbManager(); 
            let aggregatedInventory = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.INVENTORY);

            if (!aggregatedInventory || aggregatedInventory.length === 0) {
                console.log("InventoryAPI: IndexedDB is empty for inventory, fetching from Firestore inventory_aggregated...");
                if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                
                const firestoreAggSnapshot = await window.db.collection('inventory_aggregated').get();
                incrementReadCount(firestoreAggSnapshot.docs.length || 1); // Count reads
                const firestoreInventoryItems = firestoreAggSnapshot.docs.map(doc => {
                    const data = doc.data();
                    if (!data.productCode) data.productCode = doc.id; 
                    if (data.lastUpdated && data.lastUpdated.toDate) {
                        data.lastUpdated = data.lastUpdated.toDate().toISOString();
                    }
                    return data;
                });
                await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.INVENTORY);
                if (firestoreInventoryItems.length > 0) {
                    await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.INVENTORY, firestoreInventoryItems);
                    console.log(`InventoryAPI: Bulk stored ${firestoreInventoryItems.length} items from Firestore inventory_aggregated.`);
                } else {
                    console.log("InventoryAPI: No items fetched from Firestore inventory_aggregated to store.");
                }
                aggregatedInventory = firestoreInventoryItems;
                console.log(`InventoryAPI: Fetched and cached ${aggregatedInventory.length} items from Firestore inventory_aggregated.`);
            } else {
                console.log(`InventoryAPI: Loaded ${aggregatedInventory.length} items from IndexedDB inventory.`);
            }
            
            let productMap = new Map();
            // Ensure productAPI is available on window before calling
            if (window.productAPI && typeof window.productAPI.getProducts === 'function') {
                try {
                    const productResponse = await window.productAPI.getProducts({ limit: 10000, page: 1 }); 
                    if (productResponse.data && productResponse.data.length > 0) {
                        productResponse.data.forEach(product => {
                            if (product.productCode) {
                                productMap.set(product.productCode, {
                                    name: product.name || 'Unknown Product',
                                    packaging: product.packaging || ''
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.error("InventoryAPI: Error fetching products for enrichment", e);
                }
            } else {
                console.warn("InventoryAPI: window.productAPI not available for enrichment. Product names and packaging might be missing.");
            }
            
            const enrichedInventory = aggregatedInventory.map(item => {
                const productDetails = productMap.get(item.productCode) || { name: 'Unknown Product', packaging: '' };
                return {
                    ...item, 
                    productName: productDetails.name,
                    packaging: productDetails.packaging,
                };
            });

            const now = Date.now();
            let allWarehouses;
            if (warehouseCache.data && (now - warehouseCache.timestamp < WAREHOUSE_CACHE_DURATION_MS)) {
                allWarehouses = warehouseCache.data;
            } else {
                if (!window.db) throw new Error("Firestore 'db' instance is not available for warehouses.");
                const warehousesSnapshot = await window.db.collection('warehouses').get();
                 incrementReadCount(warehousesSnapshot.docs.length || 1); // Count reads
                allWarehouses = warehousesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                warehouseCache.data = allWarehouses;
                warehouseCache.timestamp = now;
            }
            return { aggregatedInventory: enrichedInventory, warehouses: allWarehouses };
        } catch (error) {
            console.error("Error in inventoryAPI.getInventory:", error);
            return { aggregatedInventory: [], warehouses: [] };
        }
    },

    listenToInventoryChanges(callback) {
        if (inventoryListenerUnsubscribe) {
            console.log("Detaching existing inventory listener before attaching a new one.");
            inventoryListenerUnsubscribe();
        }
        ensureDbManager().then(() => {
            if (!window.db) {
                console.error("Firestore 'db' instance is not available. Cannot listen to inventory changes.");
                if (typeof callback === 'function') callback({ error: "Firestore not available." });
                return;
            }
            inventoryListenerUnsubscribe = window.db.collection('inventory_aggregated')
                .onSnapshot(async (querySnapshot) => {
                    incrementReadCount(querySnapshot.docs.length || 1); // Count reads for snapshot delivery
                    await ensureDbManager(); 
                    const changes = querySnapshot.docChanges();
                    let itemsToUpdate = [];
                    let itemIdsToDelete = [];

                    if (changes.length > 0) {
                        console.log(`Inventory listener: Processing ${changes.length} change(s) from Firestore inventory_aggregated.`);
                    }
                    for (const change of changes) {
                        let invItemData = { productCode: change.doc.id, ...change.doc.data() };
                        if (invItemData.lastUpdated && invItemData.lastUpdated.toDate) {
                            invItemData.lastUpdated = invItemData.lastUpdated.toDate().toISOString();
                        }
                        if (!invItemData.productCode) invItemData.productCode = change.doc.id;

                        if (change.type === "added" || change.type === "modified") {
                            const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, invItemData.productCode);
                            if (!existingItem || !areObjectsShallowEqual(existingItem, invItemData, ['lastUpdated'])) {
                                itemsToUpdate.push(invItemData);
                            }
                        }
                        if (change.type === "removed") {
                            itemIdsToDelete.push(invItemData.productCode);
                        }
                    }

                    if (itemsToUpdate.length > 0) {
                        await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.INVENTORY, itemsToUpdate);
                        console.log(`Inventory listener: Bulk updated/added ${itemsToUpdate.length} items in IndexedDB.`);
                    }
                    for (const idToDelete of itemIdsToDelete) {
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.INVENTORY, idToDelete);
                    }
                     if (itemIdsToDelete.length > 0) {
                        console.log(`Inventory listener: Deleted ${itemIdsToDelete.length} items from IndexedDB.`);
                    }

                    if ((itemsToUpdate.length > 0 || itemIdsToDelete.length > 0) && callback && typeof callback === 'function') {
                        callback({ type: 'inventory_updated', count: itemsToUpdate.length + itemIdsToDelete.length });
                    }
                }, (error) => {
                    console.error("Error in inventory listener: ", error);
                    if (typeof callback === 'function') callback({ error: error.message });
                });
            console.log("Real-time listener attached for inventory_aggregated.");
        }).catch(error => {
            console.error("Failed to initialize IndexedDBManager, cannot attach inventory listener:", error);
            if (typeof callback === 'function') callback({ error: "IndexedDBManager initialization failed for inventory listener." });
        });
        return () => { 
            if (inventoryListenerUnsubscribe) {
                inventoryListenerUnsubscribe();
                inventoryListenerUnsubscribe = null;
                console.log("Real-time listener for inventory detached by returned function.");
            }
        };
    },

    detachInventoryListener() {
        if (inventoryListenerUnsubscribe) {
            inventoryListenerUnsubscribe();
            inventoryListenerUnsubscribe = null;
            console.log("Real-time listener for inventory detached.");
        }
    },

    async getBatchDetailsForProduct(productCode, warehouseId) {
        if (!window.db) {
            console.error("Firestore 'db' instance is not available.");
            throw new Error("Firestore is not initialized.");
        }
        if (!productCode || !warehouseId) {
            console.error("getBatchDetailsForProduct: productCode and warehouseId are required.");
            throw new Error("Product code and warehouse ID are required.");
        }

        try {
            console.log(`[inventoryAPI.getBatchDetailsForProduct] Fetching batch details for productCode: ${productCode}, warehouseId: ${warehouseId}`);
            const snapshot = await window.db.collection('inventory') // Using 'inventory' as the collection name
                .where('productCode', '==', productCode)
                .where('warehouseId', '==', warehouseId)
                .where('quantity', '>', 0) // Only include batches with available stock
                .get();
            incrementReadCount(snapshot.docs.length || 1); // Count reads

            if (snapshot.empty) {
                console.log(`[inventoryAPI.getBatchDetailsForProduct] No matching batch details found for productCode: ${productCode}, warehouseId: ${warehouseId}`);
                return [];
            }

            const batchDetails = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id, // Firestore document ID, might be useful
                    batchNo: data.batchNo,
                    quantity: data.quantity,
                    // Include other fields if they might be relevant for display or logic in the modal
                    // e.g., container: data.container, expiryDate: data.expiryDate (if exists)
                    ...(data._3plDetails && { _3plDetails: data._3plDetails }), // if _3plDetails exists
                    ...(data.container && { container: data.container }),
                    ...(data.dateStored && { dateStored: data.dateStored }), // Example: if you have an expiry date or date stored
                };
            });
            console.log(`[inventoryAPI.getBatchDetailsForProduct] Found ${batchDetails.length} batch(es):`, batchDetails);
            return batchDetails;
        } catch (error) {
            console.error(`[inventoryAPI.getBatchDetailsForProduct] Error fetching batch details for productCode ${productCode}, warehouseId ${warehouseId}:`, error);
            throw error; // Re-throw the error to be caught by the caller
        }
    }
};

window.inventoryAPI = inventoryAPI_module;
