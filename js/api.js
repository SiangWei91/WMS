// No more session cache for products, will use IndexedDB.

let productsListenerUnsubscribe = null; // To keep track of the Firestore listener

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

            for (const product of products) {
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, product);
            }
            console.log("Stored/Updated fetched products in IndexedDB.");
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
            page = 1
        } = params;

        try {
            await ensureDbManager(); // Wait for DB manager
            
            let allProducts = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.PRODUCTS);

            if (!allProducts || allProducts.length === 0) {
                console.log("IndexedDB is empty for products, fetching from Firestore...");
                allProducts = await this.fetchAllProductsFromFirestoreAndStoreInIndexedDB();
            }
            
            let processedProducts = [...allProducts];

            if (searchTerm.trim() !== '') {
                const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
                processedProducts = processedProducts.filter(product => {
                    let match = false;
                    if (product.productCode && product.productCode.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                    if (!match && product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                    if (!match && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) match = true;
                    return match;
                });
            }

            processedProducts.sort((a, b) => {
                if (a.productCode < b.productCode) return -1;
                if (a.productCode > b.productCode) return 1;
                const nameA = a.name || '';
                const nameB = b.name || '';
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });

            const offset = (page - 1) * limit;
            const paginatedProducts = processedProducts.slice(offset, offset + limit);
            const hasNextPage = (offset + limit) < processedProducts.length;
            const totalProducts = processedProducts.length;
            const totalPages = Math.ceil(totalProducts / limit);

            return {
                data: paginatedProducts,
                pagination: {
                    currentPage: page,
                    itemsPerPage: limit,
                    totalItems: totalProducts,
                    totalPages: totalPages,
                    hasNextPage: hasNextPage,
                }
            };
        } catch (error) {
            console.error("Error in getProducts (IndexedDB):", error);
            return { data: [], pagination: { currentPage: 1, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false } };
        }
    },

    async addProduct(productData) {
        try {
            await ensureDbManager(); // Wait for DB manager

            // Optimistically add to IndexedDB first with a temporary ID or placeholder
            // For simplicity, we'll generate a client-side ID for now for offline case.
            // Firestore will generate its own ID when online. This needs careful handling on sync.
            // Let's assume for now that online operations get Firestore ID, offline get temp.
            // A better approach for offline-first might be to always use UUIDs.

            const localProductData = { 
                ...productData, 
                id: `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`, // Temp local ID
                createdAt: new Date().toISOString(),
                pendingSync: false // Flag to indicate if it needs sync
            };

            if (navigator.onLine && window.db) {
                const productsCollectionRef = window.db.collection('products');
                const firestoreData = { ...productData, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
                const docRef = await productsCollectionRef.add(firestoreData);
                
                // Update local data with Firestore ID and remove pendingSync if it was set
                localProductData.id = docRef.id; 
                localProductData.pendingSync = false; // Should already be false if online
                // createdAt from server will be slightly different, listener will update if necessary.
                // For now, local ISOString is fine for immediate IDB.
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, localProductData);
                console.log("Product added to Firestore and IndexedDB (online):", localProductData);
                return localProductData;
            } else {
                // Offline: Add to IndexedDB and queue for Firestore sync
                localProductData.pendingSync = true;
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, localProductData);
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                    operation: 'add',
                    payload: localProductData, // Store the version with temp ID
                    timestamp: new Date().toISOString()
                });
                console.log("Product added to IndexedDB (offline) and queued for sync:", localProductData);
                return localProductData; // Return local data with temp ID
            }
        } catch (error) {
            console.error("Error adding product:", error);
            // If error occurred during online attempt, could queue it as well if appropriate
            // For now, just rethrow or handle as critical failure.
            throw error;
        }
    },

    async getProductById(productId) {
        try {
            await ensureDbManager(); // Wait for DB manager
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
            await ensureDbManager(); // Wait for DB manager
            
            const updatedProductForIndexedDB = { ...productData, id: productId, updatedAt: new Date().toISOString() };
            // Preserve createdAt from existing IndexedDB record if not in productData
            const existingProduct = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
            if (existingProduct && existingProduct.createdAt && !updatedProductForIndexedDB.createdAt) {
                updatedProductForIndexedDB.createdAt = existingProduct.createdAt;
            }
            // Add pendingSync flag for offline scenario
            updatedProductForIndexedDB.pendingSync = !navigator.onLine;


            if (navigator.onLine && window.db) {
                const productDocRef = window.db.collection('products').doc(productId);
                // Ensure not to send 'id' or 'pendingSync' in the Firestore update payload itself if they are not part of the actual schema
                const firestorePayload = { ...productData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                delete firestorePayload.id; 
                delete firestorePayload.pendingSync;

                await productDocRef.update(firestorePayload);
                updatedProductForIndexedDB.pendingSync = false; // Sync successful
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, updatedProductForIndexedDB);
                console.log("Product updated in Firestore and IndexedDB (online):", updatedProductForIndexedDB);
                return updatedProductForIndexedDB;
            } else {
                // Offline: Update IndexedDB and queue for Firestore sync
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, updatedProductForIndexedDB);
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                    operation: 'update',
                    payload: updatedProductForIndexedDB, // Send the full updated object
                    itemId: productId, // Keep track of the ID for the update
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
            await ensureDbManager(); // Wait for DB manager

            if (navigator.onLine && window.db) {
                const productDocRef = window.db.collection('products').doc(productId);
                await productDocRef.delete();
                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                console.log("Product deleted from Firestore and IndexedDB (online):", productId);
                return { id: productId, deleted: true };
            } else {
                // Offline: Delete from IndexedDB and queue for Firestore sync
                // First, mark as deleted in IndexedDB or move to a 'deleted' state if soft delete is preferred
                // For hard delete, just remove and queue.
                await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productId);
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: window.indexedDBManager.STORE_NAMES.PRODUCTS,
                    operation: 'delete',
                    itemId: productId, // Just need the ID for deletion
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
            await ensureDbManager(); // Wait for DB manager
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
            await ensureDbManager(); // Wait for DB manager
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

        // Ensure DB manager is ready before attaching listener
        ensureDbManager().then(() => {
            if (!window.db) {
                console.error("Firestore 'db' instance is not available. Cannot listen to product changes.");
                if (typeof callback === 'function') callback({ error: "Firestore not available." });
                return;
            }
            // indexedDBManager is confirmed by ensureDbManager

            productsListenerUnsubscribe = window.db.collection('products')
                .onSnapshot(async (querySnapshot) => {
                    await ensureDbManager(); 
                    const changes = querySnapshot.docChanges();
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
                            // console.log(`Product ${change.type} via listener: ${productData.id}`); // Keep if one example is desired
                            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productData);
                        }
                        if (change.type === "removed") {
                            // console.log(`Product removed via listener: ${productData.id}`);
                            await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productData.id);
                        }
                    }
                    if (changes.length > 0 && callback && typeof callback === 'function') {
                        callback({ type: 'products_updated', count: changes.length });
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
        
        return () => { // Return an unsubscribe function immediately
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
                            // console.log(`Inventory item ${change.type} via listener: ${invItemData.productCode}`);
                            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, invItemData);
                        }
                        if (change.type === "removed") {
                            // console.log(`Inventory item removed via listener: ${invItemData.productCode}`);
                            await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.INVENTORY, invItemData.productCode);
                        }
                    }
                    if (changes.length > 0 && callback && typeof callback === 'function') {
                        callback({ type: 'inventory_updated', count: changes.length });
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

window.productAPI = productAPI_indexedDB;

const WAREHOUSE_CACHE_DURATION_MS = 10 * 60 * 1000; 
let warehouseCache = { data: null, timestamp: 0 };
let inventoryListenerUnsubscribe = null;

window.inventoryAPI = {
    async getInventory() {
        try {
            await ensureDbManager(); // Ensure IndexedDB manager is ready
            let aggregatedInventory = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.INVENTORY);

            if (!aggregatedInventory || aggregatedInventory.length === 0) {
                console.log("InventoryAPI: IndexedDB is empty for inventory, fetching from Firestore inventory_aggregated...");
                if (!window.db) throw new Error("Firestore 'db' instance is not available.");
                
                const firestoreAggSnapshot = await window.db.collection('inventory_aggregated').get();
                const firestoreInventoryItems = firestoreAggSnapshot.docs.map(doc => {
                    const data = doc.data();
                    // Ensure productCode is set, as it's the keyPath
                    if (!data.productCode) data.productCode = doc.id; 
                    // Convert Firestore timestamps if any (e.g., lastUpdated)
                    if (data.lastUpdated && data.lastUpdated.toDate) {
                        data.lastUpdated = data.lastUpdated.toDate().toISOString();
                    }
                    return data;
                });

                // Clear store before populating to ensure consistency, or use updateItem carefully
                await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.INVENTORY);
                for (const item of firestoreInventoryItems) {
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.INVENTORY, item);
                }
                aggregatedInventory = firestoreInventoryItems;
                console.log(`InventoryAPI: Fetched and cached ${aggregatedInventory.length} items from Firestore inventory_aggregated.`);
            } else {
                console.log(`InventoryAPI: Loaded ${aggregatedInventory.length} items from IndexedDB inventory.`);
            }
            
            // Enrich with product details (name, packaging) from productAPI (which uses its own IDB cache)
            // This part remains similar, but now `aggregatedInventory` comes from IDB.
            let productMap = new Map();
            if (window.productAPI && typeof window.productAPI.getProducts === 'function') {
                try {
                    // Fetch all products to build the map - consider performance for very large product sets
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
                    ...item, // contains productCode, totalQuantity, quantitiesByWarehouseId, lastUpdated (from IDB)
                    productName: productDetails.name,
                    packaging: productDetails.packaging,
                };
            });


            // Warehouse Caching (remains session-based for now)
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
            // Return empty structure on error to prevent UI breakage
            return { aggregatedInventory: [], warehouses: [] };
        }
    }
};

let transactionListenerUnsubscribe = null;

window.transactionAPI = {
    async getTransactions(params = {}) {
        await ensureDbManager();
        const { productCode, type, startDate, endDate, limit = 10, lastVisibleDocId, currentPage = 1 } = params;

        try {
            // Attempt to fetch from IndexedDB first
            // For simplicity, we'll fetch all and filter/paginate client-side.
            // More complex queries might require more specific IDB indexes or a different strategy.
            let allTransactions = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.TRANSACTIONS);

            if (!allTransactions || allTransactions.length === 0) {
                console.log("TransactionAPI: IndexedDB is empty for transactions, fetching from Firestore...");
                if (!window.db) throw new Error("Firestore 'db' instance is not available.");

                // Simplified fetch all from Firestore for initial cache population
                // Real app might need more sophisticated pagination/delta fetches from Firestore
                const firestoreSnapshot = await window.db.collection('transactions').orderBy('transactionDate', 'desc').get();
                const firestoreTransactions = firestoreSnapshot.docs.map(doc => {
                    const txData = doc.data();
                    // Convert Firestore timestamps
                    if (txData.transactionDate && txData.transactionDate.toDate) {
                        txData.transactionDate = txData.transactionDate.toDate().toISOString();
                    }
                    return { id: doc.id, ...txData };
                });

                await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.TRANSACTIONS);
                for (const tx of firestoreTransactions) {
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, tx);
                }
                allTransactions = firestoreTransactions;
                console.log(`TransactionAPI: Fetched and cached ${allTransactions.length} transactions.`);
            } else {
                console.log(`TransactionAPI: Loaded ${allTransactions.length} transactions from IndexedDB.`);
            }

            // Client-side filtering (if params are provided)
            let filteredTransactions = [...allTransactions];
            if (productCode) {
                filteredTransactions = filteredTransactions.filter(tx => tx.productCode === productCode);
            }
            if (type) {
                filteredTransactions = filteredTransactions.filter(tx => tx.type === type);
            }
            if (startDate) { // Assuming startDate is an ISO string or Date object
                filteredTransactions = filteredTransactions.filter(tx => tx.transactionDate && new Date(tx.transactionDate) >= new Date(startDate));
            }
            if (endDate) { // Assuming endDate is an ISO string or Date object
                filteredTransactions = filteredTransactions.filter(tx => tx.transactionDate && new Date(tx.transactionDate) <= new Date(endDate));
            }

            // Client-side sorting (most recent first, unless productCode is specified, then oldest first for that product)
            filteredTransactions.sort((a, b) => {
                const dateA = new Date(a.transactionDate);
                const dateB = new Date(b.transactionDate);
                return productCode ? dateA - dateB : dateB - dateA;
            });
            
            // Client-side pagination (simplified, not using lastVisibleDocId from IDB directly here)
            // This simple pagination won't perfectly match Firestore's cursor pagination if data is very large or frequently changing during pagination.
            // For a true cache-first approach with large datasets, more complex IDB pagination is needed.
            const totalItems = filteredTransactions.length;
            const totalPages = Math.ceil(totalItems / limit);
            const offset = (currentPage - 1) * limit;
            const paginatedTransactions = filteredTransactions.slice(offset, offset + limit);
            const hasNextPage = (offset + limit) < totalItems;
            
            // lastVisibleDocId is tricky with client-side pagination from a full IDB cache.
            // For now, we'll rely on page numbers.
            let clientLastVisibleDocId = null;
            if (paginatedTransactions.length > 0) {
                 clientLastVisibleDocId = paginatedTransactions[paginatedTransactions.length -1].id;
            }


            return { 
                data: paginatedTransactions, 
                pagination: { 
                    lastVisibleDocId: clientLastVisibleDocId, // This is less reliable than Firestore's cursors
                    hasNextPage: hasNextPage, 
                    currentPage: currentPage, 
                    itemsPerPage: limit,
                    totalItems: totalItems,
                    totalPages: totalPages
                } 
            };

        } catch (error) {
            console.error("Error in transactionAPI.getTransactions:", error);
            return { data: [], pagination: { lastVisibleDocId: null, hasNextPage: false, currentPage: 1, itemsPerPage: limit, totalItems:0, totalPages:0 } };
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
            // transactionDate will be set by Firestore or locally for offline
            description: data.description || `Stock in to ${data.warehouseId}.`
        };

        if (navigator.onLine && window.db) {
            transactionData.transactionDate = firebase.firestore.FieldValue.serverTimestamp();
            const batch = window.db.batch();
            const transactionRef = window.db.collection('transactions').doc();
            batch.set(transactionRef, transactionData);

            // The Cloud Function 'updateInventoryAggregation' will handle updating 'inventory_aggregated'.
            // The client listener for 'inventory_aggregated' will update IndexedDB.
            // No direct update to granular 'inventory' collection from client for 'inbound' as per current structure.
            // If granular 'inventory' collection IS updated by client, that logic would go here.
            // For now, relying on transaction + CF to update aggregate.

            await batch.commit();
            console.log("Inbound transaction sent to Firestore:", transactionRef.id);
            return { transactionId: transactionRef.id, status: "success" };
        } else {
            // Offline: Optimistically update local aggregated inventory and queue transaction
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
            aggItem.pendingSync = true; // Mark aggregate as potentially stale until sync confirms

            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, aggItem);
            
            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'transactions', // Target collection for the operation
                operation: 'inbound',    // Custom operation type for clarity in queue processing
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
            // Assuming 'outboundStock' in Firestore might check granular inventory first
            // For simplicity, we're just logging the transaction here.
            // The Cloud Function 'updateInventoryAggregation' handles the aggregate update.
            const transactionRef = window.db.collection('transactions').doc();
            await transactionRef.set(transactionData); // Using set instead of batch for simplicity here

            console.log("Outbound transaction sent to Firestore:", transactionRef.id);
            return { transactionId: transactionRef.id, status: "success" };
        } else {
            // Offline: Optimistically update local aggregated inventory and queue transaction
            transactionData.transactionDate = new Date().toISOString();
            transactionData.pendingSync = true;
            transactionData.id = `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;

            let aggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, data.productCode);
            if (!aggItem) {
                 console.warn(`Outbound offline: Aggregated item for ${data.productCode} not found in IDB. Stock might go negative or be inaccurate.`);
                 aggItem = { productCode: data.productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
            }
            
            // Check for sufficient stock before optimistic update (optional but good practice)
            const currentWarehouseQty = aggItem.quantitiesByWarehouseId[data.warehouseId] || 0;
            if (currentWarehouseQty < quantity) {
                 // alert or console.warn, but proceed with optimistic update for now
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

    async outboundStockByInventoryId(data) { // This function seems to operate on granular `inventory` not `inventory_aggregated`
        // For offline, this would be complex:
        // 1. Need granular inventory in IndexedDB.
        // 2. Optimistically update that granular item.
        // 3. Optimistically update the *aggregated* item in IndexedDB.
        // 4. Queue the `outboundStockByInventoryId` operation.
        // This is more involved than the current scope for aggregated cache.
        // For now, let's assume this operation is online-only or disable if offline.
        if (!navigator.onLine) {
            alert("This specific outbound operation is currently not supported offline.");
            throw new Error("Operation not supported offline.");
        }
        if (!window.db) throw new Error("Firestore 'db' instance is not available.");
        const inventoryDocRef = window.db.collection('inventory').doc(data.inventoryId);
        const db = firebase.firestore(); // Direct usage for transaction

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
                .orderBy('transactionDate', 'desc') // Listen to new transactions primarily
                .onSnapshot(async (querySnapshot) => {
                    await ensureDbManager(); 
                    const changes = querySnapshot.docChanges();
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
                            // console.log(`Transaction ${change.type} via listener: ${txData.id}`);
                            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, txData);
                            changedCount++;
                        }
                        if (change.type === "removed") {
                            // console.log(`Transaction removed via listener: ${txData.id}`);
                            await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, txData.id);
                            changedCount++; 
                        }
                    }
                    if (changedCount > 0 && typeof callback === 'function') {
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
    async getJordonInventoryItems() {
        if (!window.db) throw new Error("Firestore 'db' instance is not available.");
        const itemsCollectionRef = window.db.collection("jordonInventoryItems");
        try {
            const querySnapshot = await itemsCollectionRef.orderBy("stockInTimestamp", "desc").orderBy("lotNumber", "asc").get();
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching Jordon stock items: ", error);
            throw error;
        }
    }
};

let shipmentListenerUnsubscribe = null;

window.shipmentAPI = {
    async getShipments(params = {}) {
        await ensureDbManager();
        const { status, startDate, endDate, limit = 20, currentPage = 1 } = params; // Default limit

        try {
            let allShipments = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.SHIPMENTS);

            if (!allShipments || allShipments.length === 0) {
                console.log("ShipmentAPI: IndexedDB is empty for shipments, fetching from Firestore...");
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
                    // Add other timestamp conversions if necessary
                    return { id: doc.id, ...shipmentData };
                });

                await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.SHIPMENTS);
                for (const shipment of firestoreShipments) {
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipment);
                }
                allShipments = firestoreShipments;
                console.log(`ShipmentAPI: Fetched and cached ${allShipments.length} shipments.`);
            } else {
                console.log(`ShipmentAPI: Loaded ${allShipments.length} shipments from IndexedDB.`);
            }

            let filteredShipments = [...allShipments];
            if (status) {
                filteredShipments = filteredShipments.filter(s => s.status === status);
            }
            if (startDate) {
                filteredShipments = filteredShipments.filter(s => s.shipmentDate && new Date(s.shipmentDate) >= new Date(startDate));
            }
            if (endDate) {
                filteredShipments = filteredShipments.filter(s => s.shipmentDate && new Date(s.shipmentDate) <= new Date(endDate));
            }

            filteredShipments.sort((a, b) => new Date(b.shipmentDate) - new Date(a.shipmentDate)); // Most recent first

            const totalItems = filteredShipments.length;
            const totalPages = Math.ceil(totalItems / limit);
            const offset = (currentPage - 1) * limit;
            const paginatedShipments = filteredShipments.slice(offset, offset + limit);
            const hasNextPage = (offset + limit) < totalItems;

            return {
                data: paginatedShipments,
                pagination: {
                    hasNextPage,
                    currentPage,
                    itemsPerPage: limit,
                    totalItems,
                    totalPages
                }
            };
        } catch (error) {
            console.error("Error in shipmentAPI.getShipments:", error);
            return { data: [], pagination: { hasNextPage: false, currentPage: 1, itemsPerPage: limit, totalItems:0, totalPages:0 } };
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
            // Firestore listener should update IDB with server timestamp for createdAt
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
        
        if (navigator.onLine && window.db) {
            const firestorePayload = { ...shipmentData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            delete firestorePayload.id; // Firestore uses doc ID
            await window.db.collection('shipments').doc(shipmentId).update(firestorePayload);
            updatedShipmentForIDB.pendingSync = false;
            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, updatedShipmentForIDB);
            console.log("Shipment updated in Firestore and IndexedDB (online):", updatedShipmentForIDB);
            return updatedShipmentForIDB;
        } else {
            updatedShipmentForIDB.pendingSync = true;
            // Preserve createdAt if it exists
            const existing = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentId);
            if (existing && existing.createdAt) {
                updatedShipmentForIDB.createdAt = existing.createdAt;
            }
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
    // deleteShipment can be added if needed, following similar pattern
    async deleteShipment(shipmentId) { // Basic implementation
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
                .orderBy('createdAt', 'desc') // Example: listen based on creation or shipmentDate
                .onSnapshot(async (querySnapshot) => {
                    await ensureDbManager(); 
                    const changes = querySnapshot.docChanges();
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
                        // Add other timestamp conversions (e.g., updatedAt)

                        if (change.type === "added" || change.type === "modified") {
                            // console.log(`Shipment ${change.type} via listener: ${shipmentData.id}`);
                            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentData);
                            changedCount++;
                        }
                        if (change.type === "removed") {
                            // console.log(`Shipment removed via listener: ${shipmentData.id}`);
                            await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentData.id);
                            changedCount++;
                        }
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
