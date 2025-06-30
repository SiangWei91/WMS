// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Depends on: listeners.js (supabaseProductSubscription - to be managed within this file)

// Supabase client is expected to be on window.supabaseClient

let supabaseProductSubscription = null; // For Supabase real-time subscription

// Helper function to map Supabase row to JS object
function supabaseToJsProduct(supabaseProduct) {
    if (!supabaseProduct) return null;
    // Assuming Supabase columns are: product_code, created_at, name, packaging, ChineseName, group, brand
    // And 'id' for IndexedDB should come from 'product_code'
    return {
        id: supabaseProduct.product_code, // Use product_code from Supabase as the ID for IndexedDB
        product_code: supabaseProduct.product_code, // CHANGED
        name: supabaseProduct.name,
        'Chinese Name': supabaseProduct.ChineseName, // Corrected mapping
        packaging: supabaseProduct.packaging,
        group: supabaseProduct.group, // Added mapping
        brand: supabaseProduct.brand, // Added mapping
        createdAt: supabaseProduct.created_at,
        updatedAt: supabaseProduct.updated_at, // Supabase might provide this, or it's handled by DB triggers
        // Include any other fields that need mapping
        ...(supabaseProduct.pendingSync !== undefined && { pendingSync: supabaseProduct.pendingSync }) // Preserve if already a JS object from IDB
    };
}

// Helper function to map JS object to Supabase row for insert/update
function jsToSupabaseProduct(jsProduct) {
    if (!jsProduct) return null;
    // Ensure these JS property names match what's in your jsProduct objects
    const supabaseData = {
        // id is not a Supabase column based on provided list, product_code is
        product_code: jsProduct.product_code, // Map to Supabase 'product_code' // CHANGED
        name: jsProduct.name,
        ChineseName: jsProduct['Chinese Name'], // Map to Supabase 'ChineseName'
        packaging: jsProduct.packaging,
        group: jsProduct.group, // Added mapping
        brand: jsProduct.brand, // Added mapping
        // created_at and updated_at are often handled by Supabase defaults (e.g., now())
        // created_at: jsProduct.createdAt, // Only if you intend to set it from client
        // updated_at: jsProduct.updatedAt // Only if you intend to set it from client
    };
    // Remove undefined fields to avoid issues with Supabase client
    Object.keys(supabaseData).forEach(key => supabaseData[key] === undefined && delete supabaseData[key]);
    return supabaseData;
}


const productAPI_supabase = {
    async fetchAllProductsFromSupabaseAndStoreInIndexedDB() {
        try {
            await ensureDbManager();
            if (!window.supabaseClient) throw new Error("Supabase client instance is not available.");

            const { data, error } = await window.supabaseClient
                .from('products')
                .select('*')
                .order('product_code', { ascending: true }); // Use Supabase column name 'product_code' // CHANGED

            if (error) throw error;

            const products = data.map(supabaseToJsProduct);
            console.log(`Fetched ${products.length} products from Supabase.`);

            // Log products with invalid IDs and filter them out
            const validProducts = [];
            let invalidProductsFound = 0;
            products.forEach((p, index) => { // Added index for better logging
                // Check if id is present and is a valid key (not null, undefined, or empty string)
                if (p && typeof p.id !== 'undefined' && p.id !== null && String(p.id).trim() !== "") {
                    validProducts.push(p);
                } else {
                    invalidProductsFound++;
                    // p is the problematic mapped object. data[index] is the original Supabase row object.
                    console.warn('Product with invalid or missing ID (derived from product_code) excluded from IndexedDB. Mapped object:', p, 'Original Supabase data row:', data[index]); // CHANGED
                }
            });

            if (invalidProductsFound > 0) {
                console.error(`Excluded ${invalidProductsFound} products from IndexedDB due to missing or invalid IDs. See warnings above. Please check data integrity in Supabase.`); // Note: ID here refers to the 'id' field in JS objects, derived from product_code
            }

            await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.PRODUCTS);
            console.log("Cleared existing products from IndexedDB.");

            if (validProducts.length > 0) {
                await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.PRODUCTS, validProducts);
                console.log(`Bulk stored/updated ${validProducts.length} products in IndexedDB.`);
            } else {
                console.log("No valid products fetched from Supabase to store in IndexedDB.");
            }
            return products;
        } catch (error) {
            console.error("Error fetching all products from Supabase and storing in IndexedDB:", error);
            throw error;
        }
    },

    async getProducts(params = {}) {
        const { 
            searchTerm = '', 
            limit = 10, 
            page = 1,
        } = params;

        try {
            await ensureDbManager();
            const idb = await window.indexedDBManager.initDB(); 

            if (!idb.objectStoreNames.contains(window.indexedDBManager.STORE_NAMES.PRODUCTS)) {
                 console.log("Products store not found in IndexedDB, fetching from Supabase...");
                 await this.fetchAllProductsFromSupabaseAndStoreInIndexedDB();
            }
            
            const transaction = idb.transaction(window.indexedDBManager.STORE_NAMES.PRODUCTS, 'readonly');
            const store = transaction.objectStore(window.indexedDBManager.STORE_NAMES.PRODUCTS);
            
            const results = [];
            const offset = (page - 1) * limit;
            let cursorAdvancement = offset;
            let hasMoreData = false; 
            let totalItems = 0;
            
            await new Promise((resolveCount, rejectCount) => {
                const countRequest = store.openCursor(); // No specific index needed for full scan count
                countRequest.onsuccess = event => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const product = cursor.value; // Already in JS format from IndexedDB
                        if (searchTerm.trim() !== '') {
                            const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
                            let match = false;
                            if (product.product_code && product.product_code.toLowerCase().includes(lowerCaseSearchTerm)) match = true; // CHANGED
                            if (!match && product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                            if (!match && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                            if (match) {
                                totalItems++;
                            }
                        } else {
                            totalItems++;
                        }
                        cursor.continue();
                    } else {
                        resolveCount();
                    }
                };
                countRequest.onerror = event => rejectCount(event.target.error);
            });
            
            // Fetch paginated results using 'product_code' index from IndexedDB
            const index = store.index('product_code'); // This is JS property name 'product_code' // CHANGED
            const paginatedRequest = index.openCursor(null, 'next'); 

            await new Promise((resolveCursor, rejectCursor) => {
                paginatedRequest.onsuccess = event => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const product = cursor.value; // JS format
                        let isMatch = true;
                        if (searchTerm.trim() !== '') {
                            const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
                            isMatch = false;
                            if (product.product_code && product.product_code.toLowerCase().includes(lowerCaseSearchTerm)) isMatch = true; // CHANGED
                            if (!isMatch && product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) isMatch = true;
                            if (!isMatch && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) isMatch = true;
                        }

                        if (isMatch) {
                            if (cursorAdvancement > 0) {
                                cursorAdvancement--;
                            } else if (results.length < limit) {
                                results.push(product);
                            } else {
                                hasMoreData = true; 
                            }
                        }
                        cursor.continue();
                    } else {
                        resolveCursor(); 
                    }
                };
                paginatedRequest.onerror = event => rejectCursor(event.target.error);
            });
            
            if (totalItems === 0 && results.length === 0) {
                const idbIsEmpty = await (async () => {
                    const countReq = store.count();
                    return new Promise(res => {
                        countReq.onsuccess = () => res(countReq.result === 0);
                        countReq.onerror = () => res(true); 
                    });
                })();
                if (idbIsEmpty) {
                    console.log("IndexedDB is empty for products, fetching from Supabase and retrying getProducts...");
                    await this.fetchAllProductsFromSupabaseAndStoreInIndexedDB();
                    return this.getProducts(params); 
                }
            }

            return {
                data: results, // Already sorted by product_code due to IndexedDB index cursor // CHANGED
                pagination: {
                    currentPage: page,
                    itemsPerPage: limit,
                    totalItems: totalItems, 
                    totalPages: Math.ceil(totalItems / limit),
                    hasNextPage: hasMoreData 
                }
            };

        } catch (error) {
            console.error("Error in getProducts (IndexedDB/Supabase):", error);
            return { data: [], pagination: { currentPage: page, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false } };
        }
    },

    async addProduct(productDataJS) { // productDataJS is in JS format
        try {
            await ensureDbManager();
            const supabaseData = jsToSupabaseProduct(productDataJS);

            if (navigator.onLine && window.supabaseClient) {
                const { data: newSupabaseProduct, error } = await window.supabaseClient
                    .from('products')
                    .insert([supabaseData])
                    .select()
                    .single();

                if (error) throw error;
                
                const productForIndexedDB = supabaseToJsProduct(newSupabaseProduct);
                productForIndexedDB.pendingSync = false;
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productForIndexedDB);
                console.log("Product added to Supabase and IndexedDB (online):", productForIndexedDB);
                return productForIndexedDB;
            } else {
                const localId = `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;
                const offlineProductData = { 
                    ...productDataJS, // Keep original JS structure for IDB
                    id: localId, 
                    createdAt: new Date().toISOString(), // Set client-side for offline
                    updatedAt: new Date().toISOString(),
                    pendingSync: true 
                };
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, offlineProductData);
                // Queue the original JS data, syncOfflineQueue will map it before sending
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS, // Table name for Supabase
                    operation: 'add',
                    payload: productDataJS, // Original JS object to be mapped by sync function
                    localId: localId, 
                    timestamp: new Date().toISOString()
                });
                console.log("Product added to IndexedDB (offline) and queued for sync:", offlineProductData);
                return offlineProductData; 
            }
        } catch (error) {
            console.error("Error adding product:", error);
            throw error;
        }
    },

    async getProductById(productId) { // productId is expected to be the actual DB id
        try {
            await ensureDbManager(); 
            let product = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
            if (product && !product.pendingSync) {
                console.log("Product fetched from IndexedDB by ID:", productId);
                return product; // Already in JS format
            }

            if (!window.supabaseClient) throw new Error("Supabase client is not available for fallback.");
            
            console.log("Product not in IndexedDB or pending sync, fetching from Supabase by ID:", productId);
            const { data: supabaseProductRow, error } = await window.supabaseClient
                .from('products')
                .select('*')
                .eq('product_code', productId) // CHANGED: productId here is the product_code value
                .single();

            if (error) {
                if (error.code === 'PGRST116') { 
                     console.log(`No product found in Supabase with product_code: ${productId}`); // CHANGED
                     return null;
                }
                throw error;
            }

            if (supabaseProductRow) {
                const jsProduct = supabaseToJsProduct(supabaseProductRow); // This will map to js object with product_code
                jsProduct.pendingSync = false;
                // Ensure jsProduct.id (which is product_code) is used for IDB update
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, jsProduct); 
                return jsProduct;
            }
            return null;
        } catch (error) {
            console.error("Error fetching product by ID:", error);
            throw error;
        }
    },

    async updateProduct(productId, productDataJS) { // productDataJS is in JS format
        try {
            await ensureDbManager();
            
            // Prepare data for IndexedDB (JS format)
            const updatedProductForIndexedDB = { 
                ...productDataJS, 
                id: productId, 
                updatedAt: new Date().toISOString() // Client-side timestamp for IDB
            };

            const existingProductFromIDB = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
            if (existingProductFromIDB) {
                 updatedProductForIndexedDB.createdAt = existingProductFromIDB.createdAt; // Preserve creation date
                 const keysToIgnore = ['updatedAt', 'pendingSync', 'createdAt']; // JS field names
                 if (areObjectsShallowEqual(existingProductFromIDB, updatedProductForIndexedDB, keysToIgnore)) {
                    console.log("Product update skipped, no significant data change for IDB:", productId);
                    return { ...existingProductFromIDB, ...updatedProductForIndexedDB, pendingSync: existingProductFromIDB.pendingSync }; 
                 }
            }

            if (navigator.onLine && window.supabaseClient) {
                const payloadForSupabase = jsToSupabaseProduct(productDataJS);
                // Do not send id, created_at, or updated_at in the update payload itself
                // Supabase handles updated_at, id is used in .eq()
                delete payloadForSupabase.id; // Assuming 'id' is not a column to be updated in Supabase 'products' table.
                delete payloadForSupabase.created_at; // Usually handled by DB
                delete payloadForSupabase.updated_at; // Usually handled by DB

                console.log("Attempting to update product in Supabase. Product ID for .eq():", productId);
                console.log("Payload for Supabase update:", JSON.stringify(payloadForSupabase, null, 2));

                const { data: updatedSupabaseProductRow, error } = await window.supabaseClient
                    .from('products')
                    .update(payloadForSupabase)
                    .eq('product_code', productId) // CHANGED: productId here is the product_code value. Column is 'product_code'.
                    .select()
                    .single();

                if (error) throw error;

                const syncedProduct = supabaseToJsProduct(updatedSupabaseProductRow); // This maps to js object with product_code
                syncedProduct.pendingSync = false;
                // Ensure syncedProduct.id (which is product_code) is used for IDB update
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, syncedProduct); 
                console.log("Product updated in Supabase and IndexedDB (online):", syncedProduct);
                return syncedProduct;
            } else {
                updatedProductForIndexedDB.pendingSync = true;
                if(existingProductFromIDB && !updatedProductForIndexedDB.createdAt) { 
                    updatedProductForIndexedDB.createdAt = existingProductFromIDB.createdAt;
                }
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, updatedProductForIndexedDB);
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                    operation: 'update',
                    payload: productDataJS, // Original JS object
                    itemId: productId, 
                    timestamp: new Date().toISOString()
                });
                console.log("Product updated in IndexedDB (offline) and queued for sync:", updatedProductForIndexedDB);
                return updatedProductForIndexedDB;
            }
        } catch (error) {
            console.error("Error updating product. Supabase error code:", error.code, "message:", error.message, "details:", error.details, "hint:", error.hint);
            console.error("Update productId:", productId);
            // console.error("Update payload for Supabase:", jsToSupabaseProduct(productDataJS)); // Log payload if needed, be mindful of sensitive data
            throw error;
        }
    },

    async deleteProduct(productId) {
        try {
            await ensureDbManager(); 

            if (navigator.onLine && window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('products')
                    .delete()
                    .eq('product_code', productId); // CHANGED: productId here is the product_code value

                if (error) throw error;

                // productId is the product_code, which is also the 'id' key for IndexedDB objects
                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                console.log("Product deleted from Supabase and IndexedDB (online), product_code:", productId); // CHANGED
                return { id: productId, deleted: true };
            } else {
                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                    operation: 'delete',
                    itemId: productId, 
                    timestamp: new Date().toISOString()
                });
                console.log("Product deleted from IndexedDB (offline) and queued for sync:", productId);
                return { id: productId, deleted: true, pendingSync: true };
            }
        } catch (error) {
            console.error("Error deleting product:", error);
            throw error;
        }
    },

    async getProductByCode(product_code_js) { // product_code_js is the JS value // CHANGED
        try {
            await ensureDbManager(); 
            const trimmedCode = product_code_js.trim(); // CHANGED
            // Try IndexedDB first (uses JS field name 'product_code')
            const productsFromDB = await window.indexedDBManager.getItemsByIndex(
                window.indexedDBManager.STORE_NAMES.PRODUCTS, 
                'product_code', // CHANGED (index name)
                trimmedCode
            );
            // productsFromDB contains JS objects (now with product_code property)
            if (productsFromDB && productsFromDB.length > 0 && !productsFromDB[0].pendingSync) {
                console.log("Product fetched from IndexedDB by code:", trimmedCode);
                return productsFromDB[0];
            }

            if (!window.supabaseClient) throw new Error("Supabase client is not available for fallback.");
            
            console.log("Product not in IndexedDB or pending sync, fetching from Supabase by code:", trimmedCode);
            const { data: supabaseProductRow, error } = await window.supabaseClient
                .from('products')
                .select('*')
                .eq('product_code', trimmedCode) // CHANGED: Use Supabase column name 'product_code'
                .maybeSingle(); 

            if (error) throw error;
            
            if (supabaseProductRow) {
                const jsProduct = supabaseToJsProduct(supabaseProductRow); // Maps to JS object with product_code
                jsProduct.pendingSync = false;
                // jsProduct.id is the product_code, which is the key for IDB
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, jsProduct); 
                return jsProduct;
            } else {
                 console.warn(`Product with code ${trimmedCode} not found in Supabase.`);
                return null;
            }
        } catch (error) {
            console.error(`Error fetching product by code ${product_code_js}:`, error); // CHANGED
            throw error;
        }
    },

    async searchProductsByName(searchText) {
        if (!searchText || searchText.trim() === "") return [];
        const lowerCaseSearchTerm = searchText.trim().toLowerCase();
        try {
            await ensureDbManager(); 
            const allProducts = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.PRODUCTS);
            const filteredProducts = allProducts.filter(product => { // product is already JS object
                let match = false;
                if (product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                if (!match && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                return match;
            });
            return filteredProducts.slice(0, 10); 
        } catch (error) {
            console.error(`Error searching products by name (IndexedDB) for "${searchText}": `, error);
            throw error;
        }
    },

    listenToProductChanges(callback) {
        if (supabaseProductSubscription) {
            console.log("Detaching existing Supabase product subscription before attaching a new one.");
            supabaseProductSubscription.unsubscribe();
            supabaseProductSubscription = null;
        }

        ensureDbManager().then(() => {
            if (!window.supabaseClient) {
                console.error("Supabase client is not available. Cannot listen to product changes.");
                if (typeof callback === 'function') callback({ error: "Supabase not available." });
                return;
            }

            supabaseProductSubscription = window.supabaseClient
                .channel('public:products') 
                .on(
                    'postgres_changes', 
                    { event: '*', schema: 'public', table: 'products' }, 
                    async (payload) => {
                        console.log('Supabase product change received:', payload);
                        await ensureDbManager();
                        let jsProductData;
                        let changeType = payload.eventType; 

                        if (changeType === 'INSERT' || changeType === 'UPDATE') {
                            jsProductData = supabaseToJsProduct(payload.new);
                            if (!jsProductData || !jsProductData.id) {
                                console.warn("Product change payload missing ID or invalid, cannot process for IDB:", payload);
                                return;
                            }
                            
                            const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, jsProductData.id);
                            jsProductData.pendingSync = false; // Mark as synced
                            
                            // Compare based on JS object structure
                            if (!existingItem || !areObjectsShallowEqual(existingItem, jsProductData, ['updatedAt', 'pendingSync', 'createdAt'])) {
                                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, jsProductData);
                                console.log(`Product listener: ${changeType === 'INSERT' ? 'Added/Updated' : 'Updated'} product ${jsProductData.id} in IndexedDB.`);
                                if (callback && typeof callback === 'function') {
                                    callback({ type: 'products_updated', count: 1, changedProduct: jsProductData });
                                }
                            }
                        } else if (changeType === 'DELETE') {
                            // payload.old contains the deleted row (Supabase format)
                            const oldSupabaseProduct = payload.old;
                             if (!oldSupabaseProduct || !oldSupabaseProduct.id) { // Check Supabase ID
                                console.warn("Product delete payload missing ID, cannot process for IDB:", payload);
                                return;
                            }
                            await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, oldSupabaseProduct.id);
                            console.log(`Product listener: Deleted product ${oldSupabaseProduct.id} from IndexedDB.`);
                            if (callback && typeof callback === 'function') {
                                callback({ type: 'products_updated', count: 1, deletedId: oldSupabaseProduct.id });
                            }
                        }
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to Supabase product changes!');
                    }
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        console.error('Supabase product subscription error/closed:', status, err);
                        if (typeof callback === 'function') callback({ error: `Subscription failed: ${status}` });
                    }
                });
            
            console.log("Real-time listener attached for Supabase products.");

        }).catch(error => {
            console.error("Failed to initialize IndexedDBManager or Supabase client, cannot attach product listener:", error);
            if (typeof callback === 'function') callback({ error: "Initialization failed for listener." });
        });

        return () => { 
            if (supabaseProductSubscription) {
                supabaseProductSubscription.unsubscribe();
                supabaseProductSubscription = null;
                console.log("Real-time listener for Supabase products detached by returned function.");
            }
        };
    },

    detachProductListener() {
        if (supabaseProductSubscription) {
            supabaseProductSubscription.unsubscribe();
            supabaseProductSubscription = null;
            console.log("Real-time listener for Supabase products detached.");
        }
    },

    async syncOfflineQueue() {
        await ensureDbManager();
        if (!navigator.onLine || !window.supabaseClient) {
            console.log("Offline or Supabase client not available. Skipping sync.");
            return;
        }

        const queue = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE);
        if (queue.length === 0) {
            // console.log("Offline queue is empty."); // Too noisy for regular checks
            return;
        }

        console.log(`Processing ${queue.length} items from offline queue.`);
        for (const item of queue) {
            try {
                let resultSupabase, resultJS;
                // item.payload is in JS format, map to Supabase format
                const payloadForSupabase = jsToSupabaseProduct(item.payload); 
                
                // Remove fields Supabase auto-handles or are not part of the core data for insert/update
                delete payloadForSupabase.id; 
                delete payloadForSupabase.created_at;
                delete payloadForSupabase.updated_at;


                if (item.operation === 'add') {
                    const { data, error } = await window.supabaseClient
                        .from(item.storeName) // 'products'
                        .insert([payloadForSupabase])
                        .select()
                        .single();
                    if (error) throw error;
                    resultSupabase = data;
                    resultJS = supabaseToJsProduct(resultSupabase);
                    resultJS.pendingSync = false;

                    if (item.localId && resultJS.id) {
                        const localItemData = await window.indexedDBManager.getItem(item.storeName, item.localId);
                        if (localItemData) {
                            await window.indexedDBManager.deleteItem(item.storeName, item.localId); 
                            await window.indexedDBManager.addItem(item.storeName, { ...localItemData, ...resultJS }); // Keep other local fields, update with synced data
                        } else { // Should not happen if localId was valid
                             await window.indexedDBManager.addItem(item.storeName, resultJS);
                        }
                    } else if(resultJS.id) { 
                         await window.indexedDBManager.updateItem(item.storeName, resultJS); // Should be an add if no localId
                    }
                    console.log('Synced add operation for local ID:', item.localId, 'new Supabase ID:', resultJS.id);

                } else if (item.operation === 'update') {
                    const { data, error } = await window.supabaseClient
                        .from(item.storeName)
                        .update(payloadForSupabase)
                        .eq('id', item.itemId) // item.itemId is the actual DB id
                        .select()
                        .single();
                    if (error) throw error;
                    resultSupabase = data;
                    resultJS = supabaseToJsProduct(resultSupabase);
                    resultJS.pendingSync = false;
                    await window.indexedDBManager.updateItem(item.storeName, resultJS);
                    console.log('Synced update operation for ID:', item.itemId);

                } else if (item.operation === 'delete') {
                    const { error } = await window.supabaseClient
                        .from(item.storeName)
                        .delete()
                        .eq('id', item.itemId); // item.itemId is the actual DB id
                    if (error) throw error;
                    console.log('Synced delete operation for ID:', item.itemId);
                    // Item already deleted from IndexedDB
                }
                
                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, item.id); 
                console.log('Successfully synced and removed item from queue:', item.id);

            } catch (error) {
                console.error(`Failed to sync item ${item.id} (operation: ${item.operation}, itemId: ${item.itemId || item.localId}):`, error);
            }
        }
        console.log("Offline queue processing finished.");
        if (queue.length > 0 && typeof window.refreshCurrentPageData === 'function') {
            window.refreshCurrentPageData();
        }
    }
};

window.productAPI = productAPI_supabase;

function trySync() {
    if (window.supabaseClient && navigator.onLine) {
        productAPI_supabase.syncOfflineQueue();
    }
}

// Initial sync attempt, and retry periodically or on online event
trySync(); 
window.addEventListener('online', trySync);
// setInterval(trySync, 60000); // Optional: sync every minute if online

if (typeof ensureDbManager === 'undefined' || typeof areObjectsShallowEqual === 'undefined') {
    console.warn('productAPI.js: ensureDbManager or areObjectsShallowEqual not found. Ensure helpers.js is loaded and functions are available.');
}
