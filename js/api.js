// No more session cache for products, will use IndexedDB.

        let productsListenerUnsubscribe = null; // To keep track of the Firestore listener
        let inventoryListenerUnsubscribe = null; // For inventoryAPI
        let transactionListenerUnsubscribe = null; // For transactionAPI
        let shipmentListenerUnsubscribe = null; // For shipmentAPI

        // Helper function for shallow comparison of two objects
        function areObjectsShallowEqual(objA, objB, keysToIgnore = []) {
            if (objA === objB) return true;
            if (!objA || !objB || typeof objA !== 'object' || typeof objB !== 'object') {
                return false;
            }

            const keysA = Object.keys(objA);
            const keysB = Object.keys(objB);

            // Filter out ignored keys
            const relevantKeysA = keysA.filter(key => !keysToIgnore.includes(key));
            const relevantKeysB = keysB.filter(key => !keysToIgnore.includes(key));

            if (relevantKeysA.length !== relevantKeysB.length) return false;

            for (const key of relevantKeysA) {
                if (!objB.hasOwnProperty(key) || objA[key] !== objB[key]) {
                    return false;
                }
            }
            return true;
        }

        // Helper function to ensure IndexedDB is ready before proceeding
        async function ensureDbManager() {
            if (!window.indexedDBManagerReady) {
                console.error("indexedDBManagerReady promise is not available.");
                throw new Error("IndexedDBManager readiness promise not found.");
            }
            await window.indexedDBManagerReady; // Wait for the DB to be initialized
            if (!window.indexedDBManager) {
                // This should ideally not happen if indexedDBManagerReady resolved successfully
                console.error("indexedDBManager is still not available after promise resolution.");
                throw new Error("IndexedDBManager failed to initialize.");
            }
        }

        const productAPI_indexedDB = {
            async fetchAllProductsFromFirestoreAndStoreInIndexedDB() {
                try {
                    await ensureDbManager(); // Wait for DB manager
                    if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                    // No need to check window.indexedDBManager here as ensureDbManager does it.

                    const querySnapshot = await window.db.collection('products').orderBy('productCode', 'asc').get();
                    const products = querySnapshot.docs.map(doc => {
                        const data = doc.data();
                        if (data.createdAt && data.createdAt.toDate) {
                            data.createdAt = data.createdAt.toDate().toISOString();
                        }
                        if (data.updatedAt && data.updatedAt.toDate) {
                            data.updatedAt = data.updatedAt.toDate().toISOString();
                        }
                        return { id: doc.id, ...data };
                    });
                    console.log(`Fetched ${products.length} products from Firestore.`);

                    await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.PRODUCTS);
                    console.log("Cleared existing products from IndexedDB.");

                    // Use bulkPutItems instead of individual addItem calls
                    if (products.length > 0) {
                        await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.PRODUCTS, products);
                        console.log(`Bulk stored/updated ${products.length} products in IndexedDB.`);
                    } else {
                        console.log("No products fetched from Firestore to store.");
                    }
                    return products;
                } catch (error) {
                    console.error("Error fetching all products from Firestore and storing in IndexedDB:", error);
                    throw error;
                }
            },

            async getProducts(params = {}) {
                const { 
                    searchTerm = '', 
                    limit = 10, 
                    page = 1,
                    // sortField = 'productCode', // Future: allow sorting by different fields
                    // sortOrder = 'asc'      // Future: 'asc' or 'desc'
                } = params;

                try {
                    await ensureDbManager();
                    const db = await window.indexedDBManager.initDB(); // Get DB instance

                    if (!db.objectStoreNames.contains(window.indexedDBManager.STORE_NAMES.PRODUCTS)) {
                         console.log("Products store not found, fetching from Firestore...");
                         await this.fetchAllProductsFromFirestoreAndStoreInIndexedDB(); // This will populate and then we can retry or return
                    }
                    
                    const transaction = db.transaction(window.indexedDBManager.STORE_NAMES.PRODUCTS, 'readonly');
                    const store = transaction.objectStore(window.indexedDBManager.STORE_NAMES.PRODUCTS);
                    
                    const results = [];
                    let processedCount = 0;
                    const offset = (page - 1) * limit;
                    let cursorAdvancement = offset;
                    let hasMoreData = false; // To determine if there's a next page

                    // For total count, we still need to iterate or use count()
                    // store.count() is simpler but doesn't work with ranges or filtering well.
                    // For filtered counts, iterating is more reliable.
                    let totalItems = 0;
                    
                    // First, get total count based on search term for accurate pagination
                    // This part can be slow if searchTerm is broad and not using an index effectively.
                    await new Promise((resolveCount, rejectCount) => {
                        const countRequest = store.openCursor();
                        countRequest.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                if (searchTerm.trim() !== '') {
                                    const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
                                    const product = cursor.value;
                                    let match = false;
                                    if (product.productCode && product.productCode.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
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


                    // Now, fetch the paginated and filtered/sorted data
                    // Note: Efficient text search with 'includes' is hard with IndexedDB standard indexes.
                    // For productCode exact match, we could use an index. For broader searches, we iterate.
                    // Sorting is also applied client-side after fetching the page if not using an index for sorting.
                    
                    let paginatedRequest;
                    // Using productCode index for default sort order.
                    // If a specific searchTerm targets productCode, this could be more optimized.
                    const index = store.index('productCode'); 
                    paginatedRequest = index.openCursor(null, 'next'); // 'next' for ascending by productCode

                    await new Promise((resolveCursor, rejectCursor) => {
                        paginatedRequest.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                if (cursorAdvancement > 0) {
                                    cursorAdvancement--;
                                    cursor.continue();
                                    return;
                                }

                                if (results.length < limit) {
                                    const product = cursor.value;
                                    if (searchTerm.trim() !== '') {
                                        const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
                                        let match = false;
                                        if (product.productCode && product.productCode.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                                        if (!match && product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                                        if (!match && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                                        
                                        if (match) {
                                            results.push(product);
                                        }
                                    } else {
                                        results.push(product);
                                    }
                                    cursor.continue();
                                } else {
                                    // We have 'limit' items, check if there's at least one more for hasNextPage
                                    hasMoreData = true; 
                                    resolveCursor(); 
                                }
                            } else {
                                // Cursor exhausted
                                resolveCursor();
                            }
                        };
                        paginatedRequest.onerror = event => rejectCursor(event.target.error);
                    });
                    
                    // Client-side sort if not handled by index (especially after broad search)
                     results.sort((a, b) => {
                        if (a.productCode < b.productCode) return -1;
                        if (a.productCode > b.productCode) return 1;
                        const nameA = a.name || '';
                        const nameB = b.name || '';
                        if (nameA < nameB) return -1;
                        if (nameA > nameB) return 1;
                        return 0;
                    });


                    // If results are less than limit, it means cursor was exhausted OR
                    // searchTerm filtered out many items within the advanced cursor part.
                    // The hasMoreData flag is more reliable if cursor was explicitly stopped after reaching limit.
                    // If results.length < limit after trying to fill it, then there's no next page unless hasMoreData was set.
                    const hasNextPage = results.length === limit && hasMoreData; 
                                        
                    // If totalItems is 0 and we fetched some items, it means initial IDB was empty.
                    // Re-fetch from Firestore and then try again. This is a fallback.
                    if (totalItems === 0 && results.length === 0) {
                        const idbIsEmpty = await (async () => {
                            const countReq = store.count();
                            return new Promise(res => {
                                countReq.onsuccess = () => res(countReq.result === 0);
                                countReq.onerror = () => res(true); // Assume empty on error
                            });
                        })();
                        if (idbIsEmpty) {
                            console.log("IndexedDB is empty for products, fetching from Firestore and retrying getProducts...");
                            await this.fetchAllProductsFromFirestoreAndStoreInIndexedDB();
                            // Call getProducts again. This could lead to a loop if Firestore is also empty.
                            // A better approach might be to return empty and let UI decide on a full refresh.
                            // For now, simple retry.
                            return this.getProducts(params); 
                        }
                    }


                    return {
                        data: results,
                        pagination: {
                            currentPage: page,
                            itemsPerPage: limit,
                            totalItems: totalItems, 
                            totalPages: Math.ceil(totalItems / limit),
                            hasNextPage: hasNextPage
                        }
                    };

                } catch (error) {
                    console.error("Error in getProducts (IndexedDB):", error);
                    // Fallback to empty if any error occurs during complex cursor logic
                    return { data: [], pagination: { currentPage: page, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false } };
                }
            },

            async addProduct(productData) {
                try {
                    await ensureDbManager(); // Wait for DB manager

                    const localProductData = { 
                        ...productData, 
                        id: `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`, 
                        createdAt: new Date().toISOString(),
                        pendingSync: false 
                    };

                    if (navigator.onLine && window.db) {
                        const productsCollectionRef = window.db.collection('products');
                        const firestoreData = { ...productData, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
                        const docRef = await productsCollectionRef.add(firestoreData);
                        
                        localProductData.id = docRef.id; 
                        localProductData.pendingSync = false; 
                        await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, localProductData);
                        console.log("Product added to Firestore and IndexedDB (online):", localProductData);
                        return localProductData;
                    } else {
                        localProductData.pendingSync = true;
                        await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, localProductData);
                        await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                            storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                            operation: 'add',
                            payload: localProductData, 
                            timestamp: new Date().toISOString()
                        });
                        console.log("Product added to IndexedDB (offline) and queued for sync:", localProductData);
                        return localProductData; 
                    }
                } catch (error) {
                    console.error("Error adding product:", error);
                    throw error;
                }
            },

            async getProductById(productId) {
                try {
                    await ensureDbManager(); 
                    let product = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                    if (product) {
                        console.log("Product fetched from IndexedDB by ID:", productId);
                        if (product.createdAt && typeof product.createdAt.toDate === 'function') product.createdAt = product.createdAt.toDate().toISOString();
                        if (product.updatedAt && typeof product.updatedAt.toDate === 'function') product.updatedAt = product.updatedAt.toDate().toISOString();
                        return product;
                    }

                    if (!window.db) throw new Error("Firestore 'db' instance is not available for fallback.");
                    console.log("Product not in IndexedDB, fetching from Firestore by ID:", productId);
                    const productDocRef = window.db.collection('products').doc(productId);
                    const docSnap = await productDocRef.get();
                    if (docSnap.exists) {
                        let firestoreProduct = { id: docSnap.id, ...docSnap.data() };
                        if (firestoreProduct.createdAt && firestoreProduct.createdAt.toDate) {
                            firestoreProduct.createdAt = firestoreProduct.createdAt.toDate().toISOString();
                        }
                        if (firestoreProduct.updatedAt && firestoreProduct.updatedAt.toDate) {
                            firestoreProduct.updatedAt = firestoreProduct.updatedAt.toDate().toISOString();
                        }
                        await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, firestoreProduct);
                        return firestoreProduct;
                    } else {
                        console.log("No such product document in Firestore!");
                        return null;
                    }
                } catch (error) {
                    console.error("Error fetching product by ID:", error);
                    throw error;
                }
            },

            async updateProduct(productId, productData) {
                try {
                    await ensureDbManager(); 
                    
                    const updatedProductForIndexedDB = { ...productData, id: productId, updatedAt: new Date().toISOString() };
                    const existingProductFromIDB = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                    
                    if (existingProductFromIDB && existingProductFromIDB.createdAt && !updatedProductForIndexedDB.createdAt) {
                        updatedProductForIndexedDB.createdAt = existingProductFromIDB.createdAt;
                    }

                    // Check if data actually changed before writing to IndexedDB
                    const keysToIgnore = ['updatedAt', 'pendingSync', 'createdAt']; // createdAt is handled above
                    if (existingProductFromIDB && areObjectsShallowEqual(existingProductFromIDB, updatedProductForIndexedDB, keysToIgnore)) {
                        console.log("Product update skipped for IDB, no significant data change:", productId);
                        // If online, Firestore might still be updated if its timestamp or other server-side logic differs
                        if (navigator.onLine && window.db) {
                             const productDocRef = window.db.collection('products').doc(productId);
                             const firestorePayload = { ...productData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                             delete firestorePayload.id; 
                             delete firestorePayload.pendingSync;
                             await productDocRef.update(firestorePayload);
                             console.log("Product updated in Firestore (no change for IDB):", updatedProductForIndexedDB);
                        }
                        return { ...existingProductFromIDB, ...updatedProductForIndexedDB }; // Return merged data, effectively the new state
                    }

                    updatedProductForIndexedDB.pendingSync = !navigator.onLine;

                    if (navigator.onLine && window.db) {
                        const productDocRef = window.db.collection('products').doc(productId);
                        const firestorePayload = { ...productData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                        delete firestorePayload.id; 
                        delete firestorePayload.pendingSync;

                        await productDocRef.update(firestorePayload);
                        updatedProductForIndexedDB.pendingSync = false; 
                        await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, updatedProductForIndexedDB);
                        console.log("Product updated in Firestore and IndexedDB (online):", updatedProductForIndexedDB);
                        return updatedProductForIndexedDB;
                    } else {
                        await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, updatedProductForIndexedDB);
                        await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                            storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                            operation: 'update',
                            payload: updatedProductForIndexedDB, 
                            itemId: productId, 
                            timestamp: new Date().toISOString()
                        });
                        console.log("Product updated in IndexedDB (offline) and queued for sync:", updatedProductForIndexedDB);
                        return updatedProductForIndexedDB;
                    }
                } catch (error) {
                    console.error("Error updating product:", error);
                    throw error;
                }
            },

            async deleteProduct(productId) {
                try {
                    await ensureDbManager(); 

                    if (navigator.onLine && window.db) {
                        const productDocRef = window.db.collection('products').doc(productId);
                        await productDocRef.delete();
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                        console.log("Product deleted from Firestore and IndexedDB (online):", productId);
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

            async getProductByCode(productCode) {
                try {
                    await ensureDbManager(); 
                    const trimmedCode = productCode.trim();
                    const productsFromDB = await window.indexedDBManager.getItemsByIndex(
                        window.indexedDBManager.STORE_NAMES.PRODUCTS, 
                        'productCode', 
                        trimmedCode
                    );
                    if (productsFromDB && productsFromDB.length > 0) {
                        console.log("Product fetched from IndexedDB by code:", trimmedCode);
                        return productsFromDB[0];
                    }
                    
                    if (!window.db) throw new Error("Firestore 'db' instance is not available for fallback.");
                    console.log("Product not in IndexedDB, fetching from Firestore by code:", trimmedCode);
                    const productQuery = window.db.collection('products').where('productCode', '==', trimmedCode).limit(1);
                    const snapshot = await productQuery.get();
                    if (snapshot.empty) {
                        console.warn(`Product with code ${trimmedCode} not found in Firestore.`);
                        return null;
                    }
                    const productDoc = snapshot.docs[0];
                    let firestoreProduct = { id: productDoc.id, ...productDoc.data() };
                    if (firestoreProduct.createdAt && firestoreProduct.createdAt.toDate) {
                        firestoreProduct.createdAt = firestoreProduct.createdAt.toDate().toISOString();
                    }
                    if (firestoreProduct.updatedAt && firestoreProduct.updatedAt.toDate) {
                        firestoreProduct.updatedAt = firestoreProduct.updatedAt.toDate().toISOString();
                    }
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, firestoreProduct);
                    return firestoreProduct;
                } catch (error) {
                    console.error(`Error fetching product by code ${productCode}:`, error);
                    throw error;
                }
            },

            async searchProductsByName(searchText) {
                if (!searchText || searchText.trim() === "") return [];
                const lowerCaseSearchTerm = searchText.trim().toLowerCase();
                try {
                    await ensureDbManager(); 
                    const allProducts = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.PRODUCTS);
                    const filteredProducts = allProducts.filter(product => {
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
                if (productsListenerUnsubscribe) {
                    console.log("Detaching existing product listener before attaching a new one.");
                    productsListenerUnsubscribe();
                }
                ensureDbManager().then(() => {
                    if (!window.db) {
                        console.error("Firestore 'db' instance is not available. Cannot listen to product changes.");
                        if (typeof callback === 'function') callback({ error: "Firestore not available." });
                        return;
                    }
                    productsListenerUnsubscribe = window.db.collection('products')
                        .onSnapshot(async (querySnapshot) => {
                            await ensureDbManager(); 
                            const changes = querySnapshot.docChanges();
                            let itemsToUpdate = [];
                            let itemIdsToDelete = [];

                            if (changes.length > 0) {
                                console.log(`Product listener: Processing ${changes.length} change(s) from Firestore.`);
                            }
                            for (const change of changes) {
                                let productData = { id: change.doc.id, ...change.doc.data() };
                                if (productData.createdAt && productData.createdAt.toDate) {
                                    productData.createdAt = productData.createdAt.toDate().toISOString();
                                }
                                if (productData.updatedAt && productData.updatedAt.toDate) {
                                    productData.updatedAt = productData.updatedAt.toDate().toISOString();
                                }
                                if (change.type === "added" || change.type === "modified") {
                                    const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productData.id);
                                    if (!existingItem || !areObjectsShallowEqual(existingItem, productData, ['updatedAt'])) {
                                        itemsToUpdate.push(productData);
                                    } else {
                                        console.log("Product listener: Update skipped for IDB, no significant change:", productData.id);
                                    }
                                }
                                if (change.type === "removed") {
                                    itemIdsToDelete.push(productData.id);
                                }
                            }

                            if (itemsToUpdate.length > 0) {
                                await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.PRODUCTS, itemsToUpdate);
                                console.log(`Product listener: Bulk updated/added ${itemsToUpdate.length} items in IndexedDB.`);
                            }
                            for (const idToDelete of itemIdsToDelete) {
                                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, idToDelete);
                            }
                            if (itemIdsToDelete.length > 0) {
                                console.log(`Product listener: Deleted ${itemIdsToDelete.length} items from IndexedDB.`);
                            }

                            if ((itemsToUpdate.length > 0 || itemIdsToDelete.length > 0) && callback && typeof callback === 'function') {
                                callback({ type: 'products_updated', count: itemsToUpdate.length + itemIdsToDelete.length });
                            }
                        }, (error) => {
                            console.error("Error in product listener: ", error);
                            if (typeof callback === 'function') callback({ error: error.message });
                        });
                    console.log("Real-time listener attached for products.");
                }).catch(error => {
                    console.error("Failed to initialize IndexedDBManager, cannot attach product listener:", error);
                    if (typeof callback === 'function') callback({ error: "IndexedDBManager initialization failed." });
                });
                return () => { 
                    if (productsListenerUnsubscribe) {
                        productsListenerUnsubscribe();
                        productsListenerUnsubscribe = null;
                        console.log("Real-time listener for products detached by returned function.");
                    }
                };
            },

            detachProductListener() {
                if (productsListenerUnsubscribe) {
                    productsListenerUnsubscribe();
                    productsListenerUnsubscribe = null;
                    console.log("Real-time listener for products detached.");
                }
            }
            // listenToInventoryChanges and detachInventoryListener were here, now moved to inventoryAPI
        };
        window.productAPI = productAPI_indexedDB;


        const WAREHOUSE_CACHE_DURATION_MS = 10 * 60 * 1000; 
        let warehouseCache = { data: null, timestamp: 0 };
        // inventoryListenerUnsubscribe is now declared globally at the top

        window.inventoryAPI = {
            async getInventory() {
                try {
                    await ensureDbManager(); 
                    let aggregatedInventory = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.INVENTORY);

                    if (!aggregatedInventory || aggregatedInventory.length === 0) {
                        console.log("InventoryAPI: IndexedDB is empty for inventory, fetching from Firestore inventory_aggregated...");
                        if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                        
                        const firestoreAggSnapshot = await window.db.collection('inventory_aggregated').get();
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
                                    // For inventory, lastUpdated will always change, so compare other relevant fields if necessary
                                    // or assume that if Firestore sends an update, it's valid to update IDB.
                                    // For simplicity here, we'll update if it's different based on shallow compare, ignoring lastUpdated for the check.
                                    if (!existingItem || !areObjectsShallowEqual(existingItem, invItemData, ['lastUpdated'])) {
                                        itemsToUpdate.push(invItemData);
                                    } else {
                                         console.log("Inventory listener: Update skipped for IDB, no significant change:", invItemData.productCode);
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
            }
        };

        // transactionListenerUnsubscribe is now declared globally at the top
        window.transactionAPI = {
            async getTransactions(params = {}) {
                await ensureDbManager();
                const { productCode, type, startDate, endDate, limit = 10, currentPage = 1 } = params;
                // lastVisibleDocId is removed as IDB cursor pagination is typically offset-based or requires careful key handling.

                try {
                    const db = await window.indexedDBManager.initDB();
                    const transactionStoreName = window.indexedDBManager.STORE_NAMES.TRANSACTIONS;

                    if (!db.objectStoreNames.contains(transactionStoreName)) {
                        console.log("Transactions store not found, fetching from Firestore...");
                        // Initial population if store doesn't exist.
                        if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                        const firestoreSnapshot = await window.db.collection('transactions').orderBy('transactionDate', 'desc').get();
                        const firestoreTransactions = firestoreSnapshot.docs.map(doc => {
                            const txData = doc.data();
                            if (txData.transactionDate && txData.transactionDate.toDate) {
                                txData.transactionDate = txData.transactionDate.toDate().toISOString();
                            }
                            return { id: doc.id, ...txData };
                        });
                        if (firestoreTransactions.length > 0) {
                             await window.indexedDBManager.bulkPutItems(transactionStoreName, firestoreTransactions);
                        }
                    }

                    const tx = db.transaction(transactionStoreName, 'readonly');
                    const store = tx.objectStore(transactionStoreName);
                    const index = store.index('transactionDate'); // Use transactionDate for sorting and date range queries

                    let range = null;
                    if (startDate && endDate) {
                        range = IDBKeyRange.bound(new Date(startDate).toISOString(), new Date(endDate).toISOString());
                    } else if (startDate) {
                        range = IDBKeyRange.lowerBound(new Date(startDate).toISOString());
                    } else if (endDate) {
                        range = IDBKeyRange.upperBound(new Date(endDate).toISOString());
                    }

                    const results = [];
                    let totalItems = 0;
                    const offset = (currentPage - 1) * limit;
                    let cursorAdvancement = offset;
                    let hasMoreDataForNextPage = false;

                    // Count total items matching filters
                    await new Promise((resolveCount, rejectCount) => {
                        // Open cursor with direction 'prev' because Firestore query was 'desc'
                        const countCursorRequest = index.openCursor(range, 'prev'); 
                        countCursorRequest.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const item = cursor.value;
                                let match = true;
                                if (productCode && item.productCode !== productCode) match = false;
                                if (type && item.type !== type) match = false;
                                
                                if (match) {
                                    totalItems++;
                                }
                                cursor.continue();
                            } else {
                                resolveCount();
                            }
                        };
                        countCursorRequest.onerror = event => rejectCount(event.target.error);
                    });
                    
                    // Fetch paginated items
                    await new Promise((resolveCursor, rejectCursor) => {
                        const cursorRequest = index.openCursor(range, 'prev'); // 'prev' for descending order by transactionDate
                        cursorRequest.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const item = cursor.value;
                                let match = true;
                                if (productCode && item.productCode !== productCode) match = false;
                                if (type && item.type !== type) match = false;

                                if (match) {
                                    if (cursorAdvancement > 0) {
                                        cursorAdvancement--;
                                    } else if (results.length < limit) {
                                        results.push(item);
                                    } else {
                                        hasMoreDataForNextPage = true; // Found one more item beyond the limit
                                        resolveCursor(); // Stop collecting
                                        return; 
                                    }
                                }
                                cursor.continue();
                            } else {
                                resolveCursor(); // Cursor exhausted
                            }
                        };
                        cursorRequest.onerror = event => rejectCursor(event.target.error);
                    });
                    
                    // The sorting by productCode if present in original logic needs to be client-side if transactions are not primarily sorted by it.
                    // Original: return productCode ? dateA - dateB : dateB - dateA;
                    // Current IDB sort is by transactionDate desc. If productCode is specified, original logic implies asc date sort.
                    // This specific sort switch based on productCode is complex with a single IDB index.
                    // For now, results are sorted by transactionDate descending.
                    // If productCode is present and a different sort order (e.g., ascending transactionDate) is needed,
                    // this would require a more complex query or client-side re-sorting of the page.
                    // Sticking to transactionDate desc for now.

                    return {
                        data: results,
                        pagination: {
                            currentPage: currentPage,
                            itemsPerPage: limit,
                            totalItems: totalItems,
                            totalPages: Math.ceil(totalItems / limit),
                            hasNextPage: hasMoreDataForNextPage,
                            lastVisibleDocId: null // Not easily applicable with pure offset/IDBKeyRange pagination
                        }
                    };

                } catch (error) {
                    console.error("Error in transactionAPI.getTransactions (IndexedDB):", error);
                    return { data: [], pagination: { currentPage: currentPage, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false, lastVisibleDocId: null } };
                }
            },
            async inboundStock(data) {
                await ensureDbManager();
                const quantity = Number(data.quantity);
                const transactionData = {
                    type: "inbound", 
                    productId: data.productId, 
                    productCode: data.productCode, 
                    productName: data.productName,
                    warehouseId: data.warehouseId, 
                    batchNo: data.batchNo || null, 
                    quantity: quantity,
                    operatorId: data.operatorId, 
                    description: data.description || `Stock in to ${data.warehouseId}.`
                };
                if (navigator.onLine && window.db) {
                    transactionData.transactionDate = firebase.firestore.FieldValue.serverTimestamp();
                    const batch = window.db.batch();
                    const transactionRef = window.db.collection('transactions').doc();
                    batch.set(transactionRef, transactionData);
                    await batch.commit();
                    console.log("Inbound transaction sent to Firestore:", transactionRef.id);
                    return { transactionId: transactionRef.id, status: "success" };
                } else {
                    transactionData.transactionDate = new Date().toISOString();
                    transactionData.pendingSync = true;
                    transactionData.id = `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;
                    let aggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, data.productCode);
                    if (!aggItem) {
                        aggItem = {
                            productCode: data.productCode,
                            totalQuantity: 0,
                            quantitiesByWarehouseId: {},
                            lastUpdated: new Date().toISOString()
                        };
                    }
                    aggItem.totalQuantity = (aggItem.totalQuantity || 0) + quantity;
                    aggItem.quantitiesByWarehouseId[data.warehouseId] = (aggItem.quantitiesByWarehouseId[data.warehouseId] || 0) + quantity;
                    aggItem.lastUpdated = new Date().toISOString();
                    aggItem.pendingSync = true; 
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, aggItem);
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: 'transactions', 
                        operation: 'inbound',    
                        payload: transactionData,
                        timestamp: new Date().toISOString()
                    });
                    console.log("Inbound transaction queued offline. Optimistic update to IDB inventory cache done.", transactionData.id);
                    return { transactionId: transactionData.id, status: "queued_offline" };
                }
            },

            async outboundStock(data) {
                await ensureDbManager();
                const quantity = Number(data.quantity);
                const transactionData = {
                    type: "outbound", 
                    productId: data.productId, 
                    productCode: data.productCode, 
                    productName: data.productName,
                    warehouseId: data.warehouseId, 
                    batchNo: data.batchNo || null, 
                    quantity: quantity,
                    operatorId: data.operatorId,
                    description: data.description || `Stock out from ${data.warehouseId}.`
                };
                if (navigator.onLine && window.db) {
                    transactionData.transactionDate = firebase.firestore.FieldValue.serverTimestamp();
                    const transactionRef = window.db.collection('transactions').doc();
                    await transactionRef.set(transactionData); 
                    console.log("Outbound transaction sent to Firestore:", transactionRef.id);
                    return { transactionId: transactionRef.id, status: "success" };
                } else {
                    transactionData.transactionDate = new Date().toISOString();
                    transactionData.pendingSync = true;
                    transactionData.id = `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;
                    let aggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, data.productCode);
                    if (!aggItem) {
                        console.warn(`Outbound offline: Aggregated item for ${data.productCode} not found in IDB. Stock might go negative or be inaccurate.`);
                        aggItem = { productCode: data.productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
                    }
                    const currentWarehouseQty = aggItem.quantitiesByWarehouseId[data.warehouseId] || 0;
                    if (currentWarehouseQty < quantity) {
                        console.warn(`Offline outbound for ${data.productCode} in ${data.warehouseId}: Requested ${quantity}, available in cache ${currentWarehouseQty}. Stock may go negative.`);
                    }
                    aggItem.totalQuantity = (aggItem.totalQuantity || 0) - quantity;
                    aggItem.quantitiesByWarehouseId[data.warehouseId] = currentWarehouseQty - quantity;
                    aggItem.lastUpdated = new Date().toISOString();
                    aggItem.pendingSync = true;
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, aggItem);
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: 'transactions',
                        operation: 'outbound',
                        payload: transactionData,
                        timestamp: new Date().toISOString()
                    });
                    console.log("Outbound transaction queued offline. Optimistic update to IDB inventory cache done.", transactionData.id);
                    return { transactionId: transactionData.id, status: "queued_offline" };
                }
            },

            async outboundStockByInventoryId(data) { 
                if (!navigator.onLine) {
                    alert("This specific outbound operation is currently not supported offline.");
                    throw new Error("Operation not supported offline.");
                }
                if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                const inventoryDocRef = window.db.collection('inventory').doc(data.inventoryId);
                const db = firebase.firestore(); 
                return db.runTransaction(async (transaction) => {
                    const inventoryDoc = await transaction.get(inventoryDocRef);
                    if (!inventoryDoc.exists) throw new Error(`Inventory item with ID ${data.inventoryId} not found.`);
                    const currentItemData = inventoryDoc.data();
                    const currentQuantity = currentItemData.quantity;
                    const quantityToDecrement = Number(data.quantityToDecrement);
                    if (isNaN(quantityToDecrement) || quantityToDecrement < 0) throw new Error("Quantity to decrement must be a non-negative number.");
                    if (currentQuantity < quantityToDecrement) throw new Error(`Insufficient stock for ${data.inventoryId}. Available: ${currentQuantity}, Requested: ${quantityToDecrement}.`);
                    let palletsToDecrementNum = 0, currentPallets = 0, newPalletCount = 0;
                    if (currentItemData.warehouseId === 'jordon') {
                        currentPallets = (currentItemData._3plDetails && currentItemData._3plDetails.pallet !== undefined) ? Number(currentItemData._3plDetails.pallet) : 0;
                        palletsToDecrementNum = (data.palletsToDecrement !== undefined && !isNaN(Number(data.palletsToDecrement))) ? Number(data.palletsToDecrement) : 0;
                        if (palletsToDecrementNum < 0) throw new Error(`Invalid pallet quantity to decrement. Must be non-negative.`);
                        if (palletsToDecrementNum > currentPallets) throw new Error(`Insufficient pallet stock. Available: ${currentPallets}, Requested: ${palletsToDecrementNum}.`);
                        newPalletCount = currentPallets - palletsToDecrementNum;
                    }
                    const transactionLogRef = db.collection('transactions').doc();
                    const logData = {
                        type: "outbound", inventoryId: data.inventoryId,
                        productId: data.productId || currentItemData.productId, 
                        productCode: currentItemData.productCode || data.productCode,
                        productName: currentItemData.productName || data.productName,
                        warehouseId: currentItemData.warehouseId, batchNo: currentItemData.batchNo || null,
                        quantity: quantityToDecrement, operatorId: data.operatorId,
                        transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
                        description: data.description || `Stock out for transfer. Inventory ID: ${data.inventoryId}`
                    };
                    if (currentItemData.warehouseId === 'jordon') logData.palletsDecremented = palletsToDecrementNum;
                    transaction.set(transactionLogRef, logData);
                    const newQuantity = currentQuantity - quantityToDecrement;
                    const updatePayload = { quantity: newQuantity, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() };
                    if (currentItemData.warehouseId === 'jordon') {
                        updatePayload['_3plDetails.pallet'] = newPalletCount;
                        if (newQuantity === 0 && newPalletCount !== 0) updatePayload['_3plDetails.pallet'] = 0;
                    }
                    transaction.update(inventoryDocRef, updatePayload);
                    return { transactionId: transactionLogRef.id, status: "success", inventoryId: data.inventoryId };
                });
            },

            listenToTransactionChanges(callback) {
                if (transactionListenerUnsubscribe) {
                    console.log("Detaching existing transaction listener.");
                    transactionListenerUnsubscribe();
                }
                ensureDbManager().then(() => {
                    if (!window.db) {
                        console.error("Firestore 'db' not available for transaction listener.");
                        if(typeof callback === 'function') callback({error: "Firestore not available."});
                        return;
                    }
                    transactionListenerUnsubscribe = window.db.collection('transactions')
                        .orderBy('transactionDate', 'desc') 
                        .onSnapshot(async (querySnapshot) => {
                            await ensureDbManager(); 
                            const changes = querySnapshot.docChanges();
                            let itemsToUpdate = [];
                            let itemIdsToDelete = [];
                            let changedCount = 0;

                            if (changes.length > 0) {
                                console.log(`Transaction listener: Processing ${changes.length} change(s) from Firestore.`);
                            }
                            for (const change of changes) {
                                let txData = { id: change.doc.id, ...change.doc.data() };
                                if (txData.transactionDate && txData.transactionDate.toDate) {
                                    txData.transactionDate = txData.transactionDate.toDate().toISOString();
                                }
                                if (change.type === "added" || change.type === "modified") {
                                    const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, txData.id);
                                    if (!existingItem || !areObjectsShallowEqual(existingItem, txData, ['transactionDate'])) { // transactionDate might be server timestamp
                                        itemsToUpdate.push(txData);
                                    } else {
                                        console.log("Transaction listener: Update skipped for IDB, no significant change:", txData.id);
                                    }
                                    changedCount++; // Count changes even if skipped for IDB for callback accuracy
                                }
                                if (change.type === "removed") {
                                    itemIdsToDelete.push(txData.id);
                                    changedCount++; 
                                }
                            }

                            if (itemsToUpdate.length > 0) {
                                await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, itemsToUpdate);
                                 console.log(`Transaction listener: Bulk updated/added ${itemsToUpdate.length} items in IndexedDB.`);
                            }
                            for (const idToDelete of itemIdsToDelete) {
                                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, idToDelete);
                            }
                            if (itemIdsToDelete.length > 0) {
                                console.log(`Transaction listener: Deleted ${itemIdsToDelete.length} items from IndexedDB.`);
                            }

                            if (changedCount > 0 && typeof callback === 'function') { // Use changedCount for callback
                                callback({ type: 'transactions_updated', count: changedCount });
                            }
                        }, (error) => {
                            console.error("Error in transaction listener: ", error);
                            if(typeof callback === 'function') callback({error: error.message});
                        });
                    console.log("Real-time listener attached for transactions.");
                }).catch(error => {
                    console.error("Failed to init DB for transaction listener:", error);
                    if(typeof callback === 'function') callback({error: "IndexedDB init failed for transaction listener."});
                });
                return () => {
                    if (transactionListenerUnsubscribe) {
                        transactionListenerUnsubscribe();
                        transactionListenerUnsubscribe = null;
                        console.log("Transaction listener detached by returned function.");
                    }
                };
            },

            detachTransactionListener() {
                if (transactionListenerUnsubscribe) {
                    transactionListenerUnsubscribe();
                    transactionListenerUnsubscribe = null;
                    console.log("Real-time listener for transactions detached.");
                }
            },

            async performInternalTransfer(transferData) {
                await ensureDbManager();
                const { 
                    productId, productCode, productName, 
                    sourceWarehouseId, destinationWarehouseId, 
                    quantity, operatorId 
                } = transferData;
                const numericQuantity = Number(quantity);
                const commonTxData = {
                    productId: productId || null, 
                    productCode,
                    productName,
                    quantity: numericQuantity,
                    operatorId,
                    batchNo: `TRANSFER-${sourceWarehouseId}-TO-${destinationWarehouseId}`, 
                };
                const outboundTx = {
                    ...commonTxData,
                    type: "outbound",
                    warehouseId: sourceWarehouseId,
                    description: `Internal transfer to ${destinationWarehouseId}`
                };
                const inboundTx = {
                    ...commonTxData,
                    type: "inbound",
                    warehouseId: destinationWarehouseId,
                    description: `Internal transfer from ${sourceWarehouseId}`
                };
                if (navigator.onLine && window.db) {
                    console.log("Performing internal transfer online:", transferData);
                    const batch = window.db.batch();
                    const outboundTxRef = window.db.collection('transactions').doc();
                    batch.set(outboundTxRef, { ...outboundTx, transactionDate: firebase.firestore.FieldValue.serverTimestamp() });
                    const inboundTxRef = window.db.collection('transactions').doc();
                    batch.set(inboundTxRef, { ...inboundTx, transactionDate: firebase.firestore.FieldValue.serverTimestamp() });
                    await batch.commit();
                    console.log(`Internal transfer processed online. Outbound Tx ID: ${outboundTxRef.id}, Inbound Tx ID: ${inboundTxRef.id}`);
                    return { status: "success", outboundTxId: outboundTxRef.id, inboundTxId: inboundTxRef.id };
                } else {
                    console.log("Performing internal transfer offline, queueing transactions:", transferData);
                    let sourceAggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, productCode);
                    if (!sourceAggItem) sourceAggItem = { productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
                    sourceAggItem.totalQuantity = (sourceAggItem.totalQuantity || 0) - numericQuantity;
                    sourceAggItem.quantitiesByWarehouseId[sourceWarehouseId] = (sourceAggItem.quantitiesByWarehouseId[sourceWarehouseId] || 0) - numericQuantity;
                    sourceAggItem.lastUpdated = new Date().toISOString();
                    sourceAggItem.pendingSync = true; 
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, sourceAggItem);
                    let destAggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, productCode);
                    if (!destAggItem) destAggItem = { productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
                    if(destAggItem.productCode === sourceAggItem.productCode) destAggItem = JSON.parse(JSON.stringify(sourceAggItem));
                    destAggItem.quantitiesByWarehouseId[destinationWarehouseId] = (destAggItem.quantitiesByWarehouseId[destinationWarehouseId] || 0) + numericQuantity;
                    destAggItem.lastUpdated = new Date().toISOString();
                    destAggItem.pendingSync = true;
                    // Total quantity for the product should remain the same after transfer between warehouses.
                    // The above logic correctly adjusts individual warehouse quantities.
                    // The totalQuantity for the item in IDB should reflect the sum of all warehouse quantities.
                    // Let's ensure totalQuantity is correct after local modifications
                    let newTotal = 0;
                    // Iterate over potentially modified quantitiesByWarehouseId from destAggItem
                    for(const whId in destAggItem.quantitiesByWarehouseId){
                        newTotal += (destAggItem.quantitiesByWarehouseId[whId] || 0);
                    }
                    destAggItem.totalQuantity = newTotal; // Set the correct total
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, destAggItem);

                    const localOutboundTx = {
                        ...outboundTx,
                        id: `local_tx_${new Date().getTime()}_out_${Math.random().toString(36).substr(2, 5)}`,
                        transactionDate: new Date().toISOString(),
                        pendingSync: true
                    };
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: 'transactions', operation: 'outbound', payload: localOutboundTx, timestamp: new Date().toISOString()
                    });
                    const localInboundTx = {
                        ...inboundTx,
                        id: `local_tx_${new Date().getTime()}_in_${Math.random().toString(36).substr(2, 5)}`,
                        transactionDate: new Date().toISOString(),
                        pendingSync: true
                    };
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: 'transactions', operation: 'inbound', payload: localInboundTx, timestamp: new Date().toISOString()
                    });
                    console.log("Internal transfer transactions queued offline.");
                    return { status: "queued_offline", outboundTxId: localOutboundTx.id, inboundTxId: localInboundTx.id };
                }
            }
        };

        window.dashboardAPI = {
            async getStats() {
                if (!window.db) {
                    console.error("Firestore 'db' instance is not available for dashboard stats.");
                    return { totalProducts: 'N/A', totalInventory: 'N/A', todayTransactions: 'N/A' };
                }
                let totalProducts = 0, totalInventory = 0, todayTransactions = 0;
                try {
                    const productStatsDoc = await window.db.doc('system_stats/productStats').get();
                    if (productStatsDoc.exists) totalProducts = productStatsDoc.data().count || 0;
                    else console.warn("Product stats document not found.");
                } catch (e) { console.error("Error fetching product stats:", e); }
                try {
                    const inventoryStatsDoc = await window.db.doc('system_stats/inventoryStats').get();
                    if (inventoryStatsDoc.exists) totalInventory = inventoryStatsDoc.data().totalQuantity || 0;
                    else console.warn("Inventory stats document not found.");
                } catch (e) { console.error("Error fetching inventory stats:", e); }
                try {
                    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
                    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
                    const transSnap = await window.db.collection('transactions').where('transactionDate','>=',todayStart).where('transactionDate','<=',todayEnd).get();
                    todayTransactions = transSnap.size;
                } catch (e) { console.error("Error fetching today's transactions:", e); }
                return { totalProducts, totalInventory, todayTransactions };
            }
        };

        window.jordonAPI = {
            async addJordonStockItems(itemsArray) {
                if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                if (!itemsArray || itemsArray.length === 0) throw new Error("No items provided.");
                const batch = window.db.batch();
                const itemsCollectionRef = window.db.collection("jordonInventoryItems");
                itemsArray.forEach(item => {
                    const newItemRef = itemsCollectionRef.doc();
                    batch.set(newItemRef, { ...item, totalCartons: Number(item.totalCartons) || 0, physicalPallets: Number(item.physicalPallets) || 0, stockInTimestamp: firebase.firestore.FieldValue.serverTimestamp() });
                });
                try {
                    await batch.commit();
                    return { success: true, count: itemsArray.length };
                } catch (error) {
                    console.error("Error adding Jordon stock items in batch: ", error);
                    throw error;
                }
            },
            async getJordonInventoryItems(params = {}) { // Added params
                if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                
                const { limit = 100, startAfterDocSnapshot = null } = params; // Default limit, optional startAfter

                const itemsCollectionRef = window.db.collection("jordonInventoryItems");
                let query = itemsCollectionRef.orderBy("stockInTimestamp", "desc").orderBy("lotNumber", "asc");

                if (startAfterDocSnapshot) {
                    query = query.startAfter(startAfterDocSnapshot);
                }
                query = query.limit(limit);

                try {
                    const querySnapshot = await query.get();
                    const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    const lastVisibleDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;
                    
                    // Attempt to get total count for pagination meta (can be costly for very large collections)
                    // Consider removing if performance is an issue or if an estimated count is acceptable.
                    // For now, let's assume it's acceptable for Jordon inventory size.
                    // A more scalable way for total counts is often to maintain them separately via cloud functions.
                    let totalItems = 0;
                    try {
                        const countSnapshot = await window.db.collection("jordonInventoryItems").get(); // This is still a full read for count
                        totalItems = countSnapshot.size;
                    } catch (countError) {
                        console.warn("Could not fetch total count for Jordon inventory items:", countError);
                        // If count fails, pagination can still work but totalPages might be unknown
                    }

                    return {
                        data: items,
                        lastVisibleDoc: lastVisibleDoc, // This is the Firestore DocumentSnapshot
                        hasNextPage: items.length === limit, // Basic check, more robust if total known
                        totalItems: totalItems // This is the potentially costly part
                    };
                } catch (error) {
                    console.error("Error fetching Jordon stock items: ", error);
                    throw error; // Re-throw or return error structure
                }
            }
        };

        // shipmentListenerUnsubscribe is now declared globally at the top
        window.shipmentAPI = {
            async getShipments(params = {}) {
                await ensureDbManager();
                const { status, startDate, endDate, limit = 20, currentPage = 1 } = params; 
                try {
                    const db = await window.indexedDBManager.initDB();
                    const shipmentStoreName = window.indexedDBManager.STORE_NAMES.SHIPMENTS;

                    if (!db.objectStoreNames.contains(shipmentStoreName)) {
                        console.log("Shipments store not found, fetching from Firestore...");
                         if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                        const firestoreSnapshot = await window.db.collection('shipments').orderBy('shipmentDate', 'desc').get();
                        const firestoreShipments = firestoreSnapshot.docs.map(doc => {
                            const shipmentData = doc.data();
                            if (shipmentData.shipmentDate && shipmentData.shipmentDate.toDate) {
                                shipmentData.shipmentDate = shipmentData.shipmentDate.toDate().toISOString();
                            }
                            if (shipmentData.createdAt && shipmentData.createdAt.toDate) {
                                shipmentData.createdAt = shipmentData.createdAt.toDate().toISOString();
                            }
                            return { id: doc.id, ...shipmentData };
                        });
                        if (firestoreShipments.length > 0) {
                           await window.indexedDBManager.bulkPutItems(shipmentStoreName, firestoreShipments);
                        }
                    }

                    const tx = db.transaction(shipmentStoreName, 'readonly');
                    const store = tx.objectStore(shipmentStoreName);
                    // Primary sort is by shipmentDate descending. Status and other date filters are applied during iteration.
                    const index = store.index('shipmentDate'); 
                    
                    let range = null;
                    // Note: For date range queries on 'shipmentDate' which is sorted 'desc',
                    // the IDBKeyRange bounds should be set carefully.
                    // If using 'prev' direction: lower bound is effectively upper date, upper bound is lower date.
                    // Let's assume dates are ISO strings.
                    if (startDate && endDate) {
                        range = IDBKeyRange.bound(new Date(startDate).toISOString(), new Date(endDate).toISOString());
                    } else if (startDate) {
                        range = IDBKeyRange.lowerBound(new Date(startDate).toISOString());
                    } else if (endDate) {
                        range = IDBKeyRange.upperBound(new Date(endDate).toISOString());
                    }

                    const results = [];
                    let totalItems = 0;
                    const offset = (currentPage - 1) * limit;
                    let cursorAdvancement = offset;
                    let hasMoreDataForNextPage = false;

                    // Count total items matching filters
                    await new Promise((resolveCount, rejectCount) => {
                        const countCursorRequest = index.openCursor(range, 'prev'); // Sorting by shipmentDate DESC
                        countCursorRequest.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const item = cursor.value;
                                let match = true;
                                if (status && item.status !== status) match = false;
                                // Date range is handled by IDBKeyRange if index is on shipmentDate
                                
                                if (match) {
                                    totalItems++;
                                }
                                cursor.continue();
                            } else {
                                resolveCount();
                            }
                        };
                        countCursorRequest.onerror = event => rejectCount(event.target.error);
                    });

                    // Fetch paginated items
                    await new Promise((resolveCursor, rejectCursor) => {
                        const cursorRequest = index.openCursor(range, 'prev'); // Sorting by shipmentDate DESC
                        cursorRequest.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const item = cursor.value;
                                let match = true;
                                if (status && item.status !== status) match = false;

                                if (match) {
                                    if (cursorAdvancement > 0) {
                                        cursorAdvancement--;
                                    } else if (results.length < limit) {
                                        results.push(item);
                                    } else {
                                        hasMoreDataForNextPage = true;
                                        resolveCursor(); // Stop collecting
                                        return;
                                    }
                                }
                                cursor.continue();
                            } else {
                                resolveCursor(); // Cursor exhausted
                            }
                        };
                        cursorRequest.onerror = event => rejectCursor(event.target.error);
                    });

                    return {
                        data: results,
                        pagination: {
                            currentPage: currentPage,
                            itemsPerPage: limit,
                            totalItems: totalItems,
                            totalPages: Math.ceil(totalItems / limit),
                            hasNextPage: hasMoreDataForNextPage
                        }
                    };
                } catch (error) {
                    console.error("Error in shipmentAPI.getShipments (IndexedDB):", error);
                    return { data: [], pagination: { currentPage: currentPage, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false } };
                }
            },

            async addShipment(shipmentData) {
                await ensureDbManager();
                const localShipmentData = {
                    ...shipmentData,
                    id: `local_shipment_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: new Date().toISOString(),
                    pendingSync: false
                };
                if (navigator.onLine && window.db) {
                    const firestoreData = { ...shipmentData, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
                    const docRef = await window.db.collection('shipments').add(firestoreData);
                    localShipmentData.id = docRef.id;
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, localShipmentData);
                    console.log("Shipment added to Firestore and IndexedDB (online):", localShipmentData);
                    return localShipmentData;
                } else {
                    localShipmentData.pendingSync = true;
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, localShipmentData);
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: window.indexedDBManager.STORE_NAMES.SHIPMENTS,
                        operation: 'add',
                        payload: localShipmentData,
                        timestamp: new Date().toISOString()
                    });
                    console.log("Shipment added to IndexedDB (offline) and queued:", localShipmentData);
                    return localShipmentData;
                }
            },

            async updateShipment(shipmentId, shipmentData) {
                await ensureDbManager();
                const updatedShipmentForIDB = { ...shipmentData, id: shipmentId, updatedAt: new Date().toISOString() };
                const existingShipmentFromIDB = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentId);

                if (existingShipmentFromIDB && existingShipmentFromIDB.createdAt && !updatedShipmentForIDB.createdAt) {
                    updatedShipmentForIDB.createdAt = existingShipmentFromIDB.createdAt;
                }

                const keysToIgnore = ['updatedAt', 'pendingSync', 'createdAt', 'shipmentDate']; // shipmentDate can be tricky if one is Date obj and other is ISO string
                // A more robust date comparison might be needed if formats differ. Assuming ISO strings for IDB.
                if (existingShipmentFromIDB && areObjectsShallowEqual(existingShipmentFromIDB, updatedShipmentForIDB, keysToIgnore)) {
                    // Also compare shipmentDate specifically if it exists, as it might be string vs string
                    if (!existingShipmentFromIDB.shipmentDate || !updatedShipmentForIDB.shipmentDate || existingShipmentFromIDB.shipmentDate === updatedShipmentForIDB.shipmentDate) {
                        console.log("Shipment update skipped for IDB, no significant data change:", shipmentId);
                        if (navigator.onLine && window.db) {
                            const firestorePayload = { ...shipmentData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                            delete firestorePayload.id; 
                            await window.db.collection('shipments').doc(shipmentId).update(firestorePayload);
                            console.log("Shipment updated in Firestore (no change for IDB):", updatedShipmentForIDB);
                        }
                        return { ...existingShipmentFromIDB, ...updatedShipmentForIDB };
                    }
                }
                
                updatedShipmentForIDB.pendingSync = !navigator.onLine;

                if (navigator.onLine && window.db) {
                    const firestorePayload = { ...shipmentData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                    delete firestorePayload.id; 
                    await window.db.collection('shipments').doc(shipmentId).update(firestorePayload);
                    updatedShipmentForIDB.pendingSync = false;
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, updatedShipmentForIDB);
                    console.log("Shipment updated in Firestore and IndexedDB (online):", updatedShipmentForIDB);
                    return updatedShipmentForIDB;
                } else {
                    // updatedShipmentForIDB.pendingSync = true; // already set
                    // const existing = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentId); // already fetched
                    // if (existingShipmentFromIDB && existingShipmentFromIDB.createdAt) { // already handled
                    //     updatedShipmentForIDB.createdAt = existingShipmentFromIDB.createdAt;
                    // }
                    await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, updatedShipmentForIDB);
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: window.indexedDBManager.STORE_NAMES.SHIPMENTS,
                        operation: 'update',
                        itemId: shipmentId,
                        payload: updatedShipmentForIDB,
                        timestamp: new Date().toISOString()
                    });
                    console.log("Shipment updated in IndexedDB (offline) and queued:", updatedShipmentForIDB);
                    return updatedShipmentForIDB;
                }
            },
            async deleteShipment(shipmentId) { 
                await ensureDbManager();
                if (navigator.onLine && window.db) {
                    await window.db.collection('shipments').doc(shipmentId).delete();
                    await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentId);
                    console.log("Shipment deleted online:", shipmentId);
                    return { id: shipmentId, deleted: true };
                } else {
                    await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentId);
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                        storeName: window.indexedDBManager.STORE_NAMES.SHIPMENTS,
                        operation: 'delete',
                        itemId: shipmentId,
                        timestamp: new Date().toISOString()
                    });
                    console.log("Shipment deleted offline and queued:", shipmentId);
                    return { id: shipmentId, deleted: true, pendingSync: true };
                }
            },

            listenToShipmentChanges(callback) {
                if (shipmentListenerUnsubscribe) {
                    console.log("Detaching existing shipment listener.");
                    shipmentListenerUnsubscribe();
                }
                ensureDbManager().then(() => {
                    if (!window.db) {
                        console.error("Firestore 'db' not available for shipment listener.");
                        if(typeof callback === 'function') callback({error: "Firestore not available."});
                        return;
                    }
                    shipmentListenerUnsubscribe = window.db.collection('shipments')
                        .orderBy('createdAt', 'desc') 
                        .onSnapshot(async (querySnapshot) => {
                            await ensureDbManager(); 
                            const changes = querySnapshot.docChanges();
                            let itemsToUpdate = [];
                            let itemIdsToDelete = [];
                            let changedCount = 0;

                            if (changes.length > 0) {
                                console.log(`Shipment listener: Processing ${changes.length} change(s) from Firestore.`);
                            }
                            for (const change of changes) {
                                let shipmentData = { id: change.doc.id, ...change.doc.data() };
                                if (shipmentData.createdAt && shipmentData.createdAt.toDate) {
                                    shipmentData.createdAt = shipmentData.createdAt.toDate().toISOString();
                                }
                                if (shipmentData.shipmentDate && shipmentData.shipmentDate.toDate) {
                                    shipmentData.shipmentDate = shipmentData.shipmentDate.toDate().toISOString();
                                }
                                if (change.type === "added" || change.type === "modified") {
                                    const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentData.id);
                                    if (!existingItem || !areObjectsShallowEqual(existingItem, shipmentData, ['updatedAt', 'createdAt'])) {
                                        itemsToUpdate.push(shipmentData);
                                    } else {
                                        console.log("Shipment listener: Update skipped for IDB, no significant change:", shipmentData.id);
                                    }
                                    changedCount++;
                                }
                                if (change.type === "removed") {
                                    itemIdsToDelete.push(shipmentData.id);
                                    changedCount++;
                                }
                            }

                            if (itemsToUpdate.length > 0) {
                                await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.SHIPMENTS, itemsToUpdate);
                                console.log(`Shipment listener: Bulk updated/added ${itemsToUpdate.length} items in IndexedDB.`);
                            }
                            for (const idToDelete of itemIdsToDelete) {
                                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, idToDelete);
                            }
                            if(itemIdsToDelete.length > 0){
                                console.log(`Shipment listener: Deleted ${itemIdsToDelete.length} items from IndexedDB.`);
                            }

                            if (changedCount > 0 && typeof callback === 'function') {
                                callback({ type: 'shipments_updated', count: changedCount });
                            }
                        }, (error) => {
                            console.error("Error in shipment listener: ", error);
                            if(typeof callback === 'function') callback({error: error.message});
                        });
                    console.log("Real-time listener attached for shipments.");
                }).catch(error => {
                    console.error("Failed to init DB for shipment listener:", error);
                    if(typeof callback === 'function') callback({error: "IndexedDB init failed for shipment listener."});
                });
                return () => {
                    if (shipmentListenerUnsubscribe) {
                        shipmentListenerUnsubscribe();
                        shipmentListenerUnsubscribe = null;
                        console.log("Shipment listener detached by returned function.");
                    }
                };
            },

            detachShipmentListener() {
                if (shipmentListenerUnsubscribe) {
                    shipmentListenerUnsubscribe();
                    shipmentListenerUnsubscribe = null;
                    console.log("Real-time listener for shipments detached.");
                }
            }
        };

        console.log("productAPI, inventoryAPI, transactionAPI, dashboardAPI, jordonAPI, and shipmentAPI initialized.");
