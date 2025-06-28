// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Depends on: listeners.js (productsListenerUnsubscribe)
import { incrementReadCount } from '../firebaseReadCounter.js';

const productAPI_indexedDB = {
    async fetchAllProductsFromFirestoreAndStoreInIndexedDB() {
        try {
            await ensureDbManager(); // Wait for DB manager
            if (!window.db) throw new Error("Firestore 'db' instance is not available.");

            const querySnapshot = await window.db.collection('products').orderBy('productCode', 'asc').get();
            incrementReadCount(querySnapshot.docs.length || 1); // Count reads (at least 1 for the query itself)
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
        } = params;

        try {
            await ensureDbManager();
            const db = await window.indexedDBManager.initDB(); 

            if (!db.objectStoreNames.contains(window.indexedDBManager.STORE_NAMES.PRODUCTS)) {
                 console.log("Products store not found, fetching from Firestore...");
                 await this.fetchAllProductsFromFirestoreAndStoreInIndexedDB();
            }
            
            const transaction = db.transaction(window.indexedDBManager.STORE_NAMES.PRODUCTS, 'readonly');
            const store = transaction.objectStore(window.indexedDBManager.STORE_NAMES.PRODUCTS);
            
            const results = [];
            const offset = (page - 1) * limit;
            let cursorAdvancement = offset;
            let hasMoreData = false; 
            let totalItems = 0;
            
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
            
            let paginatedRequest;
            const index = store.index('productCode'); 
            paginatedRequest = index.openCursor(null, 'next'); 

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
                            hasMoreData = true; 
                            resolveCursor(); 
                        }
                    } else {
                        resolveCursor();
                    }
                };
                paginatedRequest.onerror = event => rejectCursor(event.target.error);
            });
            
             results.sort((a, b) => {
                if (a.productCode < b.productCode) return -1;
                if (a.productCode > b.productCode) return 1;
                const nameA = a.name || '';
                const nameB = b.name || '';
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });

            const hasNextPage = results.length === limit && hasMoreData; 
                                
            if (totalItems === 0 && results.length === 0) {
                const idbIsEmpty = await (async () => {
                    const countReq = store.count();
                    return new Promise(res => {
                        countReq.onsuccess = () => res(countReq.result === 0);
                        countReq.onerror = () => res(true); 
                    });
                })();
                if (idbIsEmpty) {
                    console.log("IndexedDB is empty for products, fetching from Firestore and retrying getProducts...");
                    await this.fetchAllProductsFromFirestoreAndStoreInIndexedDB();
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
            return { data: [], pagination: { currentPage: page, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false } };
        }
    },

    async addProduct(productData) {
        try {
            await ensureDbManager(); 

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
            incrementReadCount(1); // Count this get operation
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

            const keysToIgnore = ['updatedAt', 'pendingSync', 'createdAt'];
            if (existingProductFromIDB && areObjectsShallowEqual(existingProductFromIDB, updatedProductForIndexedDB, keysToIgnore)) {
                console.log("Product update skipped for IDB, no significant data change:", productId);
                if (navigator.onLine && window.db) {
                     const productDocRef = window.db.collection('products').doc(productId);
                     const firestorePayload = { ...productData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                     delete firestorePayload.id; 
                     delete firestorePayload.pendingSync;
                     await productDocRef.update(firestorePayload);
                     console.log("Product updated in Firestore (no change for IDB):", updatedProductForIndexedDB);
                }
                return { ...existingProductFromIDB, ...updatedProductForIndexedDB }; 
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
            incrementReadCount(snapshot.docs.length || 1); // Count reads
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
                    incrementReadCount(querySnapshot.docs.length || 1); // Count reads for the snapshot delivery
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
};

// Assign to window object for global access, maintaining current app structure
window.productAPI = productAPI_indexedDB;
