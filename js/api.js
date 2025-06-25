// --- Product Cache Configuration & Helpers ---
const PRODUCT_CACHE_KEY = 'product_data_cache';
const PRODUCT_CACHE_TIMESTAMP_KEY = 'product_data_cache_timestamp';
const PRODUCT_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

function getProductCache() {
    const cachedData = sessionStorage.getItem(PRODUCT_CACHE_KEY);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.error("Error parsing product cache:", e);
            invalidateProductCache(); // Clear corrupted cache
            return null;
        }
    }
    return null;
}

function setProductCache(products) {
    try {
        sessionStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products));
        sessionStorage.setItem(PRODUCT_CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
        console.error("Error setting product cache:", e);
        // This might happen if sessionStorage is full.
    }
}

function isProductCacheValid() {
    const timestamp = sessionStorage.getItem(PRODUCT_CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;
    const cacheAge = Date.now() - parseInt(timestamp, 10);
    return cacheAge < PRODUCT_CACHE_DURATION_MS;
}

function invalidateProductCache() {
    sessionStorage.removeItem(PRODUCT_CACHE_KEY);
    sessionStorage.removeItem(PRODUCT_CACHE_TIMESTAMP_KEY);
    console.log("Product cache invalidated.");
}
// --- End Product Cache ---

// generateNameTokens function removed

const productAPI_firestore = {
    async fetchAllProductsFromFirestore() {
        try {
            const querySnapshot = await window.db.collection('products').orderBy('productCode', 'asc').get();
            const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Fetched ${products.length} products from Firestore.`);
            return products;
        } catch (error) {
            console.error("Error fetching all products from Firestore:", error);
            throw error; // Re-throw the error to be handled by the caller
        }
    },

    async getProducts(params = {}) {
        const { 
            searchTerm = '', 
            limit = 10, 
            page = 1 // Default to page 1
        } = params;

        try {
            let allProducts = [];
            if (isProductCacheValid()) {
                allProducts = getProductCache();
                console.log("Loaded products from cache.");
            } else {
                allProducts = await this.fetchAllProductsFromFirestore();
                setProductCache(allProducts);
                console.log("Fetched products from Firestore and cached.");
            }

            if (!allProducts) { // Should not happen if fetchAllProductsFromFirestore throws error on failure
                allProducts = [];
            }
            
            let processedProducts = [...allProducts]; // Create a mutable copy

            // Apply search if searchTerm is provided
            if (searchTerm.trim() !== '') {
                const lowerCaseSearchTerm = searchTerm.trim().toLowerCase();
                processedProducts = processedProducts.filter(product => {
                    let match = false;
                    if (product.productCode && product.productCode.toLowerCase().includes(lowerCaseSearchTerm)) {
                        match = true;
                    }
                    if (!match && product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) {
                        match = true;
                    }
                    if (!match && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) {
                        match = true;
                    }
                    return match;
                });
            }

            // Sort products (consistent sort order)
            // Current sort is by productCode, then name. Replicate this.
            processedProducts.sort((a, b) => {
                if (a.productCode < b.productCode) return -1;
                if (a.productCode > b.productCode) return 1;
                if (a.name && b.name && a.name < b.name) return -1;
                if (a.name && b.name && a.name > b.name) return 1;
                return 0;
            });

            // Apply pagination
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
                    // We no longer use Firestore snapshots for paging, 
                    // so lastVisibleDocSnapshot is removed.
                    // The UI will need to manage page numbers.
                }
            };

        } catch (error) {
            console.error("Error in getProducts (cache/client-side):", error);
            // Gracefully return empty if there's an issue, or rethrow
            return { 
                data: [], 
                pagination: { 
                    currentPage: 1, 
                    itemsPerPage: limit, 
                    totalItems: 0, 
                    totalPages: 0, 
                    hasNextPage: false 
                } 
            };
        }
    },

    async addProduct(productData) {
        try {
            const productsCollectionRef = window.db.collection('products');
            // name_lowercase and name_tokens removed
            const docRef = await productsCollectionRef.add({
                ...productData, // name is stored as is from productData
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            invalidateProductCache(); // Invalidate cache after adding
            return { id: docRef.id, ...productData }; // Return original productData + id
        } catch (error) {
            console.error("Error adding product to Firestore:", error);
            throw error;
        }
    },

    async getProductById(productId) {
        try {
            const productDocRef = window.db.collection('products').doc(productId);
            const docSnap = await productDocRef.get();
            if (docSnap.exists) {
                return { id: docSnap.id, ...docSnap.data() };
            } else {
                console.log("No such product document in Firestore!");
                return null;
            }
        } catch (error) {
            console.error("Error fetching product by ID from Firestore:", error);
            throw error;
        }
    },

    async updateProduct(productId, productData) {
        try {
            const productDocRef = window.db.collection('products').doc(productId);
            const updateData = { ...productData };
            // logic for name_lowercase and name_tokens removed

            updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

            await productDocRef.update(updateData);
            invalidateProductCache(); // Invalidate cache after updating
            return { id: productId, ...updateData }; // Return what was sent for update, plus ID
        } catch (error) {
            console.error("Error updating product in Firestore:", error);
            throw error;
        }
    },

    async deleteProduct(productId) {
        try {
            const productDocRef = window.db.collection('products').doc(productId);
            await productDocRef.delete();
            invalidateProductCache(); // Invalidate cache after deleting
            return { id: productId };
        } catch (error) { // Added curly brace for catch block
            console.error("Error deleting product from Firestore:", error);
            throw error;
        }
    },

    async getProductByCode(productCode) {
        try {
            const productQuery = window.db.collection('products').where('productCode', '==', productCode.trim()).limit(1);
            const snapshot = await productQuery.get();
            if (snapshot.empty) {
                console.warn(`Product with code ${productCode} not found in Firestore.`);
                return null;
            }
            const productDoc = snapshot.docs[0];
            return { id: productDoc.id, ...productDoc.data() };
        } catch (error) {
            console.error(`Error fetching product by code ${productCode} from Firestore:`, error);
            throw error;
        }
    },

    async searchProductsByName(searchText) {
        if (!searchText || searchText.trim() === "") {
            return [];
        }

        const productsCollectionRef = window.db.collection("products");
        const searchTerm = searchText.trim().toLowerCase(); // Lowercase for case-insensitive search

        try {
            // This is a simplified version. For true case-insensitive search on Firestore,
            // you'd typically store a lowercase version of the 'name' field and query against that.
            // The current .where('name', '>=', searchTerm) approach is case-sensitive.
            // The following will fetch all and filter, which is inefficient for large datasets.
            const querySnapshot = await productsCollectionRef.get();
            
            const products = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.name && data.name.toLowerCase().includes(searchTerm)) {
                    products.push({ id: doc.id, ...data });
                }
            });
            
            return products.slice(0,10); // Limit results
        } catch (error) {
            console.error(`Error searching products by name for "${searchText}": `, error);
            throw error;
        }
    }
};

window.productAPI = productAPI_firestore;

// --- Cache Configuration ---
// This CACHE_DURATION_MS is for warehouse and productMap, not for the new product cache.
// It can be kept or removed if not used elsewhere after product cache is primary.
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes 

let warehouseCache = {
    data: null,
    timestamp: 0
};

let productMapCache = { // Caches the productMap used in getInventory
    data: null,
    timestamp: 0
};

window.inventoryAPI = {
    async getInventory() {
        try {
            const now = Date.now();
            let allWarehouses;
            let productMap;

            // 缓存仓库
            // Uses its own CACHE_DURATION_MS, not PRODUCT_CACHE_DURATION_MS
            if (warehouseCache.data && (now - warehouseCache.timestamp < CACHE_DURATION_MS)) {
                allWarehouses = warehouseCache.data;
            } else {
                const warehousesSnapshot = await window.db.collection('warehouses').get();
                allWarehouses = warehousesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                warehouseCache.data = allWarehouses;
                warehouseCache.timestamp = now;
            }

            // 缓存产品映射
            // Uses its own CACHE_DURATION_MS
            if (productMapCache.data && (now - productMapCache.timestamp < CACHE_DURATION_MS)) {
                productMap = productMapCache.data;
            } else {
                // This also fetches all products. If product cache is populated, this could potentially use it.
                // However, for now, keeping it separate to avoid circular dependencies or complex logic.
                const productsSnapshot = await window.db.collection('products').get();
                productMap = new Map();
                productsSnapshot.docs.forEach(doc => {
                    const product = doc.data();
                    if (product.productCode) {
                        productMap.set(product.productCode, {
                            name: product.name || 'Unknown Product',
                            packaging: product.packaging || ''
                        });
                    }
                });
                productMapCache.data = productMap;
                productMapCache.timestamp = now;
            }

            // 从聚合表 inventory_aggregated 读取
            const aggSnapshot = await window.db.collection('inventory_aggregated').get();
            const aggregatedInventory = aggSnapshot.docs.map(doc => {
                const data = doc.data();
                const productDetails = productMap.get(data.productCode) || { name: 'Unknown Product', packaging: '' };

                return {
                    productCode: data.productCode,
                    productName: productDetails.name,
                    packaging: productDetails.packaging,
                    totalQuantity: data.totalQuantity || 0,
                    quantitiesByWarehouseId: data.quantitiesByWarehouseId || {}
                };
            });

            return {
                aggregatedInventory,
                warehouses: allWarehouses
            };
        } catch (error) {
            console.error("Error fetching inventory aggregation:", error);
            throw error;
        }
    }
};


window.transactionAPI = {
    async getTransactions(params = {}) {
        try {
            const defaultLimit = params.productCode ? 1000 : 10;
            const limit = params.limit || defaultLimit;
            let query = window.db.collection('transactions');

            if (params.productCode) {
                query = query.where('productCode', '==', params.productCode).orderBy('transactionDate', 'asc');
            } else {
                query = query.orderBy('transactionDate', 'desc');
            }

            if (params.type) {
                query = query.where('type', '==', params.type);
            }
            if (params.startDate) {
                query = query.where('transactionDate', '>=', params.startDate);
            }
            if (params.endDate) {
                query = query.where('transactionDate', '<=', params.endDate);
            }

            if (params.lastVisibleDocId && !params.productCode) {
                const lastDocSnapshot = await window.db.collection('transactions').doc(params.lastVisibleDocId).get();
                if (lastDocSnapshot.exists) {
                    query = query.startAfter(lastDocSnapshot);
                }
            }

            query = query.limit(limit);
            const querySnapshot = await query.get();
            const transactions = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            let lastVisibleDocId = null;
            if (querySnapshot.docs.length > 0) {
                lastVisibleDocId = querySnapshot.docs[querySnapshot.docs.length - 1].id;
            }

            return {
                data: transactions,
                pagination: {
                    lastVisibleDocId: lastVisibleDocId,
                    hasNextPage: transactions.length === limit && !params.productCode,
                    currentPage: params.currentPage || 1,
                    itemsPerPage: limit
                }
            };
        } catch (error) {
            console.error("Error fetching transactions from Firestore:", error);
            throw error;
        }
    },

    async inboundStock(data) {
        const batch = window.db.batch();
        const transactionRef = window.db.collection('transactions').doc();
        batch.set(transactionRef, {
            type: "inbound",
            productId: data.productId,
            productCode: data.productCode,
            productName: data.productName,
            warehouseId: data.warehouseId,
            batchNo: data.batchNo || null,
            quantity: Number(data.quantity),
            operatorId: data.operatorId,
            transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
            description: data.description || `Stock in to ${data.warehouseId}.` // Added description
        });
        const inventoryQuery = window.db.collection('inventory')
            .where('productId', '==', data.productId)
            .where('warehouseId', '==', data.warehouseId)
            .where('batchNo', '==', data.batchNo || null);
        const inventorySnapshot = await inventoryQuery.limit(1).get();
        if (!inventorySnapshot.empty) {
            const inventoryDocRef = inventorySnapshot.docs[0].ref;
            batch.update(inventoryDocRef, {
                quantity: firebase.firestore.FieldValue.increment(Number(data.quantity)),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                productName: data.productName,
                productCode: data.productCode
            });
        } else {
            const newInventoryRef = window.db.collection('inventory').doc();
            batch.set(newInventoryRef, {
                productId: data.productId,
                productCode: data.productCode,
                productName: data.productName,
                warehouseId: data.warehouseId,
                batchNo: data.batchNo || null,
                quantity: Number(data.quantity),
                expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                // Consider if _3plDetails or other fields are needed for new items here
            });
        }
        await batch.commit();
        return { transactionId: transactionRef.id, status: "success" };
    },

    async outboundStock(data) {
        const inventoryQuery = window.db.collection('inventory')
            .where('productId', '==', data.productId)
            .where('warehouseId', '==', data.warehouseId)
            .where('batchNo', '==', data.batchNo || null);
        const inventorySnapshot = await inventoryQuery.limit(1).get();

        if (inventorySnapshot.empty) {
            throw new Error(`Stock not found for Product ID: ${data.productId}, Product Code: ${data.productCode}, Batch: ${data.batchNo || 'N/A'} in Warehouse: ${data.warehouseId}.`);
        }
        const inventoryDoc = inventorySnapshot.docs[0];
        const currentQuantity = inventoryDoc.data().quantity;
        const outboundQuantity = Number(data.quantity);

        if (currentQuantity < outboundQuantity) {
            throw new Error(`Insufficient stock for Product ID: ${data.productId}, Product Code: ${data.productCode}, Batch: ${data.batchNo || 'N/A'}. Available: ${currentQuantity}, Requested: ${outboundQuantity}.`);
        }

        const batch = window.db.batch();
        const transactionRef = window.db.collection('transactions').doc();
        batch.set(transactionRef, {
            type: "outbound",
            productId: data.productId,
            productCode: data.productCode,
            productName: data.productName,
            warehouseId: data.warehouseId,
            batchNo: data.batchNo || null,
            quantity: outboundQuantity,
            operatorId: data.operatorId,
            transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
            relatedInventoryId: inventoryDoc.id,
            description: data.description || `Stock out from ${data.warehouseId}.` // Added description
        });

        batch.update(inventoryDoc.ref, {
            quantity: firebase.firestore.FieldValue.increment(-outboundQuantity),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { transactionId: transactionRef.id, status: "success", inventoryId: inventoryDoc.id };
    },

    async outboundStockByInventoryId(data) {
        const inventoryDocRef = window.db.collection('inventory').doc(data.inventoryId);
        const db = firebase.firestore();

        return db.runTransaction(async (transaction) => {
            const inventoryDoc = await transaction.get(inventoryDocRef);
            if (!inventoryDoc.exists) {
                throw new Error(`Inventory item with ID ${data.inventoryId} not found.`);
            }

            const currentItemData = inventoryDoc.data();
            const currentQuantity = currentItemData.quantity;
            const quantityToDecrement = Number(data.quantityToDecrement);

            if (isNaN(quantityToDecrement) || quantityToDecrement < 0) {
                throw new Error("Quantity to decrement must be a non-negative number.");
            }
            if (currentQuantity < quantityToDecrement) {
                throw new Error(`Insufficient carton stock for inventory item ${data.inventoryId} (${currentItemData.productCode}). Available: ${currentQuantity}, Requested: ${quantityToDecrement}.`);
            }

            let palletsToDecrementNum = 0;
            let currentPallets = 0;
            let newPalletCount = 0;

            if (currentItemData.warehouseId === 'jordon') {
                currentPallets = (currentItemData._3plDetails && currentItemData._3plDetails.pallet !== undefined)
                    ? Number(currentItemData._3plDetails.pallet)
                    : 0;
                palletsToDecrementNum = (data.palletsToDecrement !== undefined && !isNaN(Number(data.palletsToDecrement)))
                    ? Number(data.palletsToDecrement)
                    : 0;

                if (palletsToDecrementNum < 0) {
                    throw new Error(`Invalid pallet quantity to decrement (${data.palletsToDecrement}). Must be a non-negative number.`);
                }
                if (palletsToDecrementNum > currentPallets) {
                    throw new Error(`Insufficient pallet stock for Jordon item ${data.inventoryId}. Available: ${currentPallets}, Requested: ${palletsToDecrementNum}.`);
                }
                newPalletCount = currentPallets - palletsToDecrementNum;
            }

            let effectiveProductId = data.productId || currentItemData.productId;
            if (!effectiveProductId) {
                 console.warn(`Transaction Log for ${data.inventoryId}: productId is missing. This indicates a data integrity issue.`);
                 // Decide if this should throw an error or proceed with a placeholder if your DB/rules allow
            }


            const transactionLogRef = db.collection('transactions').doc();
            const logData = {
                type: "outbound",
                inventoryId: data.inventoryId,
                productId: effectiveProductId, // Use determined product ID
                productCode: currentItemData.productCode || data.productCode,
                productName: currentItemData.productName || data.productName,
                warehouseId: currentItemData.warehouseId,
                batchNo: currentItemData.batchNo || null,
                quantity: quantityToDecrement,
                operatorId: data.operatorId,
                transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
                description: data.description || `Stock out for transfer. Inventory ID: ${data.inventoryId}`
            };
            if (currentItemData.warehouseId === 'jordon') {
                logData.palletsDecremented = palletsToDecrementNum;
            }
            transaction.set(transactionLogRef, logData);

            const newQuantity = currentQuantity - quantityToDecrement;
            const updatePayload = {
                quantity: newQuantity,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (currentItemData.warehouseId === 'jordon') {
                updatePayload['_3plDetails.pallet'] = newPalletCount;
                if (newQuantity === 0 && newPalletCount !== 0) {
                    console.warn(`Jordon item ${data.inventoryId}: All cartons depleted. Forcing _3plDetails.pallet to 0.`);
                    updatePayload['_3plDetails.pallet'] = 0;
                }
            }
            transaction.update(inventoryDocRef, updatePayload);

            return { transactionId: transactionLogRef.id, status: "success", inventoryId: data.inventoryId };
        });
    }
};

window.dashboardAPI = {
    async getStats() {
        let totalProducts = 0;
        let totalInventory = 0;
        let todayTransactions = 0;

        try {
            const productStatsRef = window.db.doc('system_stats/productStats');
            const productStatsDoc = await productStatsRef.get();
            if (productStatsDoc.exists) {
                totalProducts = productStatsDoc.data().count || 0;
            } else {
                console.warn("Product stats document (system_stats/productStats) not found.");
            }
        } catch (error) {
            console.error("Error fetching product stats:", error);
        }

        try {
            const inventoryStatsRef = window.db.doc('system_stats/inventoryStats');
            const inventoryStatsDoc = await inventoryStatsRef.get();
            if (inventoryStatsDoc.exists) {
                totalInventory = inventoryStatsDoc.data().totalQuantity || 0;
            } else {
                console.warn("Inventory stats document (system_stats/inventoryStats) not found.");
            }
        } catch (error) {
            console.error("Error fetching inventory stats:", error);
        }

        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            const transactionsQuery = window.db.collection('transactions')
                .where('transactionDate', '>=', todayStart)
                .where('transactionDate', '<=', todayEnd);
            const todayTransactionsSnapshot = await transactionsQuery.get();
            todayTransactions = todayTransactionsSnapshot.size;
        } catch (error) {
            console.error("Error fetching today's transactions:", error);
        }

        return {
            totalProducts: totalProducts,
            totalInventory: totalInventory,
            todayTransactions: todayTransactions
        };
    }
};

// console.log("productAPI, inventoryAPI, transactionAPI, and dashboardAPI initialized.");

window.jordonAPI = {
    async addJordonStockItems(itemsArray) {
        if (!itemsArray || itemsArray.length === 0) {
            throw new Error("No items provided to add.");
        }
        const batch = window.db.batch();
        const itemsCollectionRef = window.db.collection("jordonInventoryItems");
        itemsArray.forEach(item => {
            const newItemRef = itemsCollectionRef.doc();
            const itemDataWithTimestamp = {
                ...item,
                totalCartons: Number(item.totalCartons) || 0,
                physicalPallets: Number(item.physicalPallets) || 0,
                stockInTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(newItemRef, itemDataWithTimestamp);
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
        const itemsCollectionRef = window.db.collection("jordonInventoryItems");
        try {
            const querySnapshot = await itemsCollectionRef
                .orderBy("stockInTimestamp", "desc")
                .orderBy("lotNumber", "asc") // Assuming lotNumber exists and is relevant for ordering
                .get();
            const items = [];
            querySnapshot.forEach(doc => {
                items.push({ id: doc.id, ...doc.data() });
            });
            return items;
        } catch (error) {
            console.error("Error fetching Jordon stock items: ", error);
            throw error;
        }
    }
};
