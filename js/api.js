// generateNameTokens function removed

const productAPI_firestore = {
    async getProducts(params = {}) {
        const PRODUCTS_PER_PAGE = params.limit || 10;
        try {
            const activeSearchTerm = params.searchTerm ? params.searchTerm.trim() : '';

            if (activeSearchTerm !== '') {
                // --- Search Mode ---
                let searchOffset = 0;
                if (params.lastVisibleDocSnapshot &&
                    params.lastVisibleDocSnapshot._isSearchPagingMarker &&
                    params.lastVisibleDocSnapshot.searchTerm === activeSearchTerm) {
                    searchOffset = params.lastVisibleDocSnapshot.nextOffset || 0;
                }

                let combinedProducts = [];
                const productIds = new Set(); // For de-duplication
                const lowerCaseSearchTerm = activeSearchTerm.toLowerCase();

                // Since Firestore queries are case-sensitive for string comparisons,
                // and we need case-insensitive search for 'name' and 'Chinese Name',
                // the most straightforward way without altering DB schema (e.g., adding lowercase fields)
                // is to fetch all documents and filter client-side.
                // This is NOT PERFORMANT for large datasets.
                // A better solution would involve backend changes or a search service like Algolia/Elasticsearch.

                // Fetch all products
                const allProductsSnapshot = await window.db.collection('products').get();

                allProductsSnapshot.docs.forEach(doc => {
                    const product = { id: doc.id, ...doc.data() };
                    let match = false;

                    // 1. Check productCode (exact match, case-sensitive as it's an identifier)
                    if (product.productCode && product.productCode === activeSearchTerm) {
                        match = true;
                    }

                    // 2. Check name (case-insensitive)
                    if (!match && product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) {
                        match = true;
                    }

                    // 3. Check Chinese Name (case-insensitive)
                    if (!match && product['Chinese Name'] && product['Chinese Name'].toLowerCase().includes(lowerCaseSearchTerm)) {
                        match = true;
                    }

                    if (match && !productIds.has(doc.id)) {
                        combinedProducts.push(product);
                        productIds.add(doc.id);
                    }
                });

                // Sort the combined results (e.g., by productCode, then name for stability)
                combinedProducts.sort((a, b) => {
                    if (a.productCode < b.productCode) return -1;
                    if (a.productCode > b.productCode) return 1;
                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;
                    return 0;
                });

                // Client-side pagination from the merged and sorted list
                const paginatedProducts = combinedProducts.slice(searchOffset, searchOffset + PRODUCTS_PER_PAGE);

                let hasNextPage = (searchOffset + PRODUCTS_PER_PAGE < combinedProducts.length);
                let nextSearchMarker = null;

                if (hasNextPage) {
                    nextSearchMarker = {
                        _isSearchPagingMarker: true,
                        searchTerm: activeSearchTerm,
                        nextOffset: searchOffset + PRODUCTS_PER_PAGE,
                    };
                }

                return {
                    data: paginatedProducts,
                    lastVisibleDocSnapshot: nextSearchMarker,
                    hasNextPage: hasNextPage
                };

            } else {
                // --- Non-Search Mode (Standard Browsing/Pagination) ---
                let productsQuery = window.db.collection('products').orderBy('productCode', 'asc');

                if (params.lastVisibleDocSnapshot && !params.lastVisibleDocSnapshot._isSearchPagingMarker) {
                    productsQuery = productsQuery.startAfter(params.lastVisibleDocSnapshot);
                }

                productsQuery = productsQuery.limit(PRODUCTS_PER_PAGE);

                const querySnapshot = await productsQuery.get();
                const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const actualLastFirestoreDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

                let hasNextPage = false;
                if (actualLastFirestoreDoc) {
                    const nextPageQuery = window.db.collection('products')
                        .orderBy('productCode', 'asc')
                        .startAfter(actualLastFirestoreDoc)
                        .limit(1);
                    const nextPageSnapshot = await nextPageQuery.get();
                    if (!nextPageSnapshot.empty) {
                        hasNextPage = true;
                    }
                }

                return {
                    data: products,
                    lastVisibleDocSnapshot: actualLastFirestoreDoc,
                    hasNextPage: hasNextPage
                };
            }
        } catch (error) {
            console.error("Error fetching products from Firestore:", error);
            throw error;
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
            return { id: productId };
        } catch (error) {
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
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

let warehouseCache = {
    data: null,
    timestamp: 0
};

let productMapCache = { // Caches the productMap used in getInventory
    data: null,
    timestamp: 0
};

// --- Inventory API with Caching ---
window.inventoryAPI = {
    async getInventory() { // Removed params, as we're fetching all for client-side aggregation
        try {
            const now = Date.now();
            let allWarehouses;
            let productMap;

            // 1. Fetch warehouses (with caching)
            if (warehouseCache.data && (now - warehouseCache.timestamp < CACHE_DURATION_MS)) {
                allWarehouses = warehouseCache.data;
                // console.log("Using cached warehouses");
            } else {
                // console.log("Fetching warehouses from Firestore");
                const warehousesSnapshot = await window.db.collection('warehouses').get();
                allWarehouses = warehousesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                warehouseCache.data = allWarehouses;
                warehouseCache.timestamp = now;
            }

            // 2. Fetch products and create a lookup map (with caching for productMap)
            if (productMapCache.data && (now - productMapCache.timestamp < CACHE_DURATION_MS)) {
                productMap = productMapCache.data;
                // console.log("Using cached product map");
            } else {
                // console.log("Fetching products from Firestore for product map");
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

            // 3. Fetch all inventory items (no caching for this part in this step)
            // console.log("Fetching inventory items from Firestore");
            const inventorySnapshot = await window.db.collection('inventory').get();
            const inventoryItems = inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 4. Aggregate inventory data
            const aggregatedData = new Map();

            inventoryItems.forEach(item => {
                const originalProductCode = item.productCode; // Store original code from inventory item
                if (!originalProductCode) return; // Skip items without productCode

                let productDetails = productMap.get(originalProductCode);

                if (!productDetails) {
                    // Fallback logic if not found
                    if (originalProductCode.endsWith('.1')) {
                        const trimmedCode = originalProductCode.slice(0, -2);
                        productDetails = productMap.get(trimmedCode);
                    } else {
                        const suffixedCode = originalProductCode + '.1';
                        productDetails = productMap.get(suffixedCode);
                    }
                }
                
                // Ensure productDetails is an object, even after fallback
                productDetails = productDetails || { name: 'Unknown Product (Code not in products collection)', packaging: '' };

                // Use originalProductCode from inventory item for aggregation key
                if (!aggregatedData.has(originalProductCode)) {
                    aggregatedData.set(originalProductCode, {
                        productCode: originalProductCode, // Display the code as it is in the inventory
                        productName: productDetails.name,
                        packaging: productDetails.packaging,
                        totalQuantity: 0,
                        quantitiesByWarehouseId: {}
                    });
                }

                const productEntry = aggregatedData.get(originalProductCode);
                const quantity = Number(item.quantity) || 0;
                productEntry.totalQuantity += quantity;

                if (item.warehouseId) {
                    productEntry.quantitiesByWarehouseId[item.warehouseId] = (productEntry.quantitiesByWarehouseId[item.warehouseId] || 0) + quantity;
                }
            });

            return {
                aggregatedInventory: Array.from(aggregatedData.values()),
                warehouses: allWarehouses
                // Pagination is removed as we're doing client-side aggregation of all data
            };
        } catch (error) {
            console.error("Error fetching and aggregating inventory data from Firestore:", error);
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
