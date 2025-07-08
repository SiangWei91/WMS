// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Supabase: Uses window.supabaseClient
// Depends on: productAPI.js (window.productAPI.getProducts for enrichment)
// import { incrementReadCount } from '../firebaseReadCounter.js'; // Firebase specific, remove or adapt

const WAREHOUSE_CACHE_DURATION_MS = 10 * 60 * 1000;
let warehouseCache = { data: null, timestamp: 0 };
let inventoryListenerUnsubscribe = null; // Will hold the Supabase subscription object

const inventoryAPI_module = {
    async getInventory() {
        try {
            await ensureDbManager();
            let aggregatedInventory = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.INVENTORY);

            if (!aggregatedInventory || aggregatedInventory.length === 0) {
                console.log("InventoryAPI: IndexedDB is empty for inventory, fetching from Supabase inventory_aggregated...");
                if (!window.supabaseClient) throw new Error("Supabase client is not available.");

                const { data: supabaseInventoryItems, error } = await window.supabaseClient
                    .from('inventory_aggregated')
                    .select('*');

                if (error) {
                    console.error("InventoryAPI: Error fetching from Supabase inventory_aggregated:", error);
                    throw error;
                }

                // Supabase returns data directly, no need to map docs like Firestore
                // Dates from Supabase are already ISO strings if TIMESTAMPTZ
                // Ensure product_code is present, Supabase primary key is likely 'product_code' // CHANGED
                const itemsToCache = supabaseInventoryItems.map(item => ({
                    ...item,
                    product_code: item.product_code // Ensure field name consistency for IndexedDB (keyPath is product_code) // CHANGED
                }));


                await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.INVENTORY);
                if (itemsToCache.length > 0) {
                    await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.INVENTORY, itemsToCache);
                    console.log(`InventoryAPI: Bulk stored ${itemsToCache.length} items from Supabase inventory_aggregated.`);
                } else {
                    console.log("InventoryAPI: No items fetched from Supabase inventory_aggregated to store.");
                }
                aggregatedInventory = itemsToCache;
                console.log(`InventoryAPI: Fetched and cached ${aggregatedInventory.length} items from Supabase inventory_aggregated.`);
            } else {
                console.log(`InventoryAPI: Loaded ${aggregatedInventory.length} items from IndexedDB inventory.`);
            }

            let productMap = new Map();
            if (window.productAPI && typeof window.productAPI.getProducts === 'function') {
                try {
                    const productResponse = await window.productAPI.getProducts({ limit: 10000, page: 1 }); // productAPI now returns objects with product_code
                    if (productResponse.data && productResponse.data.length > 0) {
                        productResponse.data.forEach(product => {
                            // Assuming product.product_code is the correct field from productAPI (which it is after refactor) // CHANGED
                            if (product.product_code) { // CHANGED
                                productMap.set(product.product_code, { // CHANGED
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
                // Ensure item.product_code is used for lookup, which should be consistent now // CHANGED
                // aggregatedInventory items now have 'product_code' from the initial mapping or IDB
                const productDetails = productMap.get(item.product_code) || { name: 'Unknown Product', packaging: '' }; // CHANGED
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
                if (!window.supabaseClient) throw new Error("Supabase client is not available for warehouses.");
                const { data: warehousesData, error: warehousesError } = await window.supabaseClient
                    .from('warehouses')
                    .select('*');

                if (warehousesError) {
                    console.error("InventoryAPI: Error fetching warehouses from Supabase:", warehousesError);
                    throw warehousesError;
                }
                // Supabase returns 'id' as defined in the schema
                allWarehouses = warehousesData;
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
        if (inventoryListenerUnsubscribe && typeof inventoryListenerUnsubscribe.unsubscribe === 'function') {
            console.log("Detaching existing Supabase inventory subscription before attaching a new one.");
            inventoryListenerUnsubscribe.unsubscribe();
            inventoryListenerUnsubscribe = null;
        }

        ensureDbManager().then(() => {
            if (!window.supabaseClient) {
                console.error("Supabase client is not available. Cannot listen to inventory changes.");
                if (typeof callback === 'function') callback({ error: "Supabase client not available." });
                return;
            }

            inventoryListenerUnsubscribe = window.supabaseClient
                .channel('public:inventory_aggregated')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_aggregated' }, async (payload) => {
                    console.log('Supabase inventory_aggregated change received:', payload);
                    await ensureDbManager();
                    let itemsToUpdate = [];
                    let itemIdsToDelete = [];

                    const { eventType, new: newRecord, old: oldRecord, table } = payload;
                    // Ensure product_code field name consistency // CHANGED
                    const recordToProcess = eventType === 'DELETE' ? oldRecord : newRecord;
                    if (!recordToProcess) {
                        console.warn("Inventory listener: No record data in payload for table", table, payload);
                        return;
                    }
                     // Map Supabase columns to what IndexedDB expects, esp. primary key for inventory_aggregated
                    const invItemData = { ...recordToProcess, product_code: recordToProcess.product_code }; // CHANGED (key is now product_code)


                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        // invItemData.product_code is the key for IDB 'inventory' store (keyPath: 'product_code')
                        const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, invItemData.product_code); // CHANGED
                        // last_updated is a TIMESTAMPTZ, should be comparable as ISO strings
                        if (!existingItem || !areObjectsShallowEqual(existingItem, invItemData, ['last_updated'])) {
                            itemsToUpdate.push(invItemData);
                        }
                    } else if (eventType === 'DELETE') {
                        // For DELETE, oldRecord contains the data of the row that was deleted.
                        // The primary key is oldRecord.product_code, which is mapped to invItemData.product_code
                        itemIdsToDelete.push(invItemData.product_code); // CHANGED
                    }

                    if (itemsToUpdate.length > 0) {
                        await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.INVENTORY, itemsToUpdate);
                        console.log(`Inventory listener: Bulk updated/added ${itemsToUpdate.length} items in IndexedDB from Supabase.`);
                    }
                    if (itemIdsToDelete.length > 0) {
                        await window.indexedDBManager.deleteItems(window.indexedDBManager.STORE_NAMES.INVENTORY, itemIdsToDelete); // Assuming deleteItems can take an array
                        console.log(`Inventory listener: Deleted ${itemIdsToDelete.length} items from IndexedDB based on Supabase delete.`);
                    }


                    if ((itemsToUpdate.length > 0 || itemIdsToDelete.length > 0) && callback && typeof callback === 'function') {
                        callback({ type: 'inventory_updated', count: itemsToUpdate.length + itemIdsToDelete.length });
                    }
                })
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to Supabase inventory_aggregated changes.');
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
                        console.error('Supabase inventory_aggregated subscription error:', status, err);
                        if (typeof callback === 'function') callback({ error: `Supabase subscription failed: ${status}` });
                    }
                });

            console.log("Real-time listener (Supabase subscription) attached for inventory_aggregated.");
        }).catch(error => {
            console.error("Failed to initialize IndexedDBManager, cannot attach Supabase inventory listener:", error);
            if (typeof callback === 'function') callback({ error: "IndexedDBManager initialization failed for inventory listener." });
        });

        return () => {
            if (inventoryListenerUnsubscribe && typeof inventoryListenerUnsubscribe.unsubscribe === 'function') {
                inventoryListenerUnsubscribe.unsubscribe();
                inventoryListenerUnsubscribe = null;
                console.log("Real-time listener for inventory (Supabase subscription) detached by returned function.");
            }
        };
    },

    detachInventoryListener() {
        if (inventoryListenerUnsubscribe && typeof inventoryListenerUnsubscribe.unsubscribe === 'function') {
            inventoryListenerUnsubscribe.unsubscribe();
            inventoryListenerUnsubscribe = null;
            console.log("Real-time listener for inventory (Supabase subscription) detached.");
        }
    },

    async getBatchDetailsForProduct(product_code, warehouseId) { // CHANGED parameter name
        if (!window.supabaseClient) {
            console.error("Supabase client is not available.");
            throw new Error("Supabase client is not initialized.");
        }
        if (!product_code || !warehouseId) { // CHANGED
            console.error("getBatchDetailsForProduct: product_code and warehouseId are required."); // CHANGED
            throw new Error("Product code and warehouse ID are required.");
        }

        try {
            console.log(`[inventoryAPI.getBatchDetailsForProduct] Fetching batch details from Supabase for product_code: ${product_code}, warehouseId: ${warehouseId}`); // CHANGED
            const { data: batchDetails, error } = await window.supabaseClient
                .from('inventory') // Target 'inventory' table
                .select('*')
                .eq('product_code', product_code) // Use 'product_code' column, variable is now also product_code
                .eq('warehouse_id', warehouseId) // Use 'warehouse_id' column
                .gt('quantity', 0); // quantity > 0

            if (error) {
                console.error(`[inventoryAPI.getBatchDetailsForProduct] Error fetching batch details from Supabase for product_code ${product_code}, warehouseId ${warehouseId}:`, error); // CHANGED
                throw error;
            }

            if (!batchDetails || batchDetails.length === 0) {
                console.log(`[inventoryAPI.getBatchDetailsForProduct] No matching batch details found in Supabase for product_code: ${product_code}, warehouseId: ${warehouseId}`); // CHANGED
                return [];
            }

            // Supabase data is already in the desired array of objects format.
            // Field names should match the schema: id, batch_no, quantity, container, date_stored, _3pl_details
            console.log(`[inventoryAPI.getBatchDetailsForProduct] Found ${batchDetails.length} batch(es) from Supabase:`, batchDetails);
            return batchDetails.map(item => ({
                id: item.id,
                batchNo: item.batch_no, // map batch_no to batchNo
                quantity: item.quantity,
                _3plDetails: item._3pl_details, // Supabase stores JSONB as objects
                container: item.container,
                dateStored: item.date_stored
            }));
        } catch (error) {
            // Catch errors from the try block or re-thrown by Supabase client
            console.error(`[inventoryAPI.getBatchDetailsForProduct] Error fetching batch details for product_code ${product_code}, warehouseId ${warehouseId}:`, error); // CHANGED
            throw error; // Re-throw the error to be caught by the caller
        }
    }
};

window.inventoryAPI = inventoryAPI_module;
