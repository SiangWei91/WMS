
const productAPI_firestore = {
    async getProducts(params = {}) { // params currently not fully used for query conditions, can be added
        try {
            let productsQuery = window.db.collection('products');
            // Example: Add orderBy if needed, e.g., productsQuery = productsQuery.orderBy('createdAt', 'desc');
            // TODO: Implement actual pagination using params.limit and Firestore cursors (startAfter)
            // TODO: Implement actual search/filtering based on params.searchTerm

            const querySnapshot = await productsQuery.get();
            const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Simplified pagination for now
            return { 
                data: products, 
                pagination: { 
                    page: params.page || 1,  // Reflects requested page
                    totalPages: 1,          // Placeholder - needs calculation based on total docs & limit
                    totalRecords: products.length // Total records fetched in this call
                } 
            };
        } catch (error) {
            console.error("Error fetching products from Firestore:", error);
            throw error;
        }
    },

    async addProduct(productData) {
        try {
            const productsCollectionRef = window.db.collection('products');
            const docRef = await productsCollectionRef.add({
                ...productData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            // Return the ID of the newly created document and the original data
            return { id: docRef.id, ...productData }; 
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
            await productDocRef.update({
                ...productData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            return { id: productId, ...productData };
        } catch (error) {
            console.error("Error updating product in Firestore:", error);
            throw error;
        }
    },

    async deleteProduct(productId) {
        try {
            const productDocRef = window.db.collection('products').doc(productId);
            await productDocRef.delete();
            return { id: productId }; // Return id of deleted product
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
            return { id: productDoc.id, ...productDoc.data() }; // Includes original document ID as 'id' and all other fields
        } catch (error) {
            console.error(`Error fetching product by code ${productCode} from Firestore:`, error);
            throw error; // Re-throw to be caught by caller
        }
    }
};

// Overwrite global productAPI with the new Firestore implementation
window.productAPI = productAPI_firestore; 

// --- Placeholder/Outdated APIs ---
// These APIs are not yet updated for Firestore and will show warnings.

window.inventoryAPI = {
    async getInventory(params = {}) {
        try {
            let inventoryQuery = window.db.collection('inventory');

            // Search by productCode if provided
            if (params.productCode && params.productCode.trim() !== '') {
                inventoryQuery = inventoryQuery.where('productCode', '==', params.productCode.trim());
            }
            // TODO: Consider adding other search capabilities e.g. by productName, warehouseId
            // TODO: Implement actual server-side pagination using params.limit and Firestore cursors (startAfter)

            // For now, fetch all matching documents without server-side pagination
            const querySnapshot = await inventoryQuery.get();
            const inventoryItems = querySnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            
            // Simplified pagination response
            return { 
                data: inventoryItems, 
                pagination: { 
                    page: 1, // Static for now as we fetch all
                    totalPages: 1, // Static for now
                    totalRecords: inventoryItems.length 
                } 
            };
        } catch (error) {
            console.error("Error fetching inventory from Firestore:", error);
            // It's good practice to throw the error or return an error structure
            // so the calling function can handle it.
            throw error; 
        }
    }
    // Other inventory methods like updateInventoryQuantity will be added later
    // when refactoring transactions.
};

window.transactionAPI = {
    async getTransactions(params = {}) {
        try {
            const defaultLimit = 10; // Same as transactionsRowsPerPage in js/transactions.js
            const limit = params.limit || defaultLimit;
            let query = window.db.collection('transactions').orderBy('transactionDate', 'desc');

            // Apply filters
            if (params.type) {
                query = query.where('type', '==', params.type);
            }
            if (params.startDate) { // Assuming startDate is a JavaScript Date object or Firestore Timestamp
                query = query.where('transactionDate', '>=', params.startDate);
            }
            if (params.endDate) { // Assuming endDate is a JavaScript Date object or Firestore Timestamp
                // For endDate, to include the whole day, it's often better to set it to the end of the day
                // e.g., if params.endDate is Date('2023-10-29'), query for < Date('2023-10-30')
                // For simplicity here, we'll use '<=' which might require time to be set to 23:59:59 for full day coverage.
                query = query.where('transactionDate', '<=', params.endDate);
            }

            // Pagination
            if (params.lastVisibleDocId) {
                const lastDocSnapshot = await window.db.collection('transactions').doc(params.lastVisibleDocId).get();
                if (lastDocSnapshot.exists) {
                    query = query.startAfter(lastDocSnapshot);
                } else {
                    console.warn("lastVisibleDocId provided for pagination does not exist:", params.lastVisibleDocId);
                    // May decide to fetch from beginning or return error/empty
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
            
            const hasNextPage = transactions.length === limit;

            return {
                data: transactions,
                pagination: {
                    lastVisibleDocId: lastVisibleDocId,
                    hasNextPage: hasNextPage, 
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
        console.log("inboundStock API call with data:", data);
        const batch = window.db.batch();

        // 1. Create Transaction Record
        const transactionRef = window.db.collection('transactions').doc(); // Auto-generate ID
        batch.set(transactionRef, {
            type: "inbound",
            productId: data.productId, // Ensure productId is passed in `data`
            productCode: data.productCode,
            productName: data.productName, // Ensure productName is passed in `data`
            warehouseId: data.warehouseId,
            batchNo: data.batchNo || null, // Ensure null if empty/undefined
            quantity: Number(data.quantity), // Ensure it's a number
            operatorId: data.operatorId,
            transactionDate: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update Inventory
        // Query for existing inventory item
        const inventoryQuery = window.db.collection('inventory')
            .where('productId', '==', data.productId) // Assuming productId is the unique ID from the 'products' collection
            .where('warehouseId', '==', data.warehouseId)
            .where('batchNo', '==', data.batchNo || null);

        const inventorySnapshot = await inventoryQuery.limit(1).get();

        if (!inventorySnapshot.empty) {
            // Inventory item exists, update it
            const inventoryDocRef = inventorySnapshot.docs[0].ref;
            batch.update(inventoryDocRef, {
                quantity: firebase.firestore.FieldValue.increment(Number(data.quantity)),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                // Ensure denormalized fields like productName, productCode are updated if necessary,
                // though typically these are established when product is first added to inventory.
                productName: data.productName, 
                productCode: data.productCode
            });
        } else {
            // Inventory item does not exist, create it
            const newInventoryRef = window.db.collection('inventory').doc(); // Auto-generate ID
            batch.set(newInventoryRef, {
                productId: data.productId,
                productCode: data.productCode,
                productName: data.productName,
                warehouseId: data.warehouseId,
                batchNo: data.batchNo || null,
                quantity: Number(data.quantity),
                expiryDate: data.expiryDate ? new Date(data.expiryDate) : null, // Assuming expiryDate might come from form
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                // Other fields like unitOfMeasure, supplierInfo could be added here if available in `data`
            });
        }

        await batch.commit();
        // Return some data, perhaps the transaction ID
        return { transactionId: transactionRef.id, status: "success" };
    },

    async outboundStock(data) {
        console.log("outboundStock API call with data:", data);

        const inventoryQuery = window.db.collection('inventory')
            .where('productId', '==', data.productId) // Assuming productId is the unique ID
            .where('warehouseId', '==', data.warehouseId)
            .where('batchNo', '==', data.batchNo || null);

        const inventorySnapshot = await inventoryQuery.limit(1).get();

        if (inventorySnapshot.empty) {
            throw new Error(`Stock not found for Product ID: ${data.productId}, Batch: ${data.batchNo || 'N/A'} in Warehouse: ${data.warehouseId}.`);
        }

        const inventoryDoc = inventorySnapshot.docs[0];
        const currentQuantity = inventoryDoc.data().quantity;
        const outboundQuantity = Number(data.quantity);

        if (currentQuantity < outboundQuantity) {
            throw new Error(`Insufficient stock for Product ID: ${data.productId}, Batch: ${data.batchNo || 'N/A'}. Available: ${currentQuantity}, Requested: ${outboundQuantity}.`);
        }

        // Proceed with batch write if stock is sufficient
        const batch = window.db.batch();

        // 1. Create Transaction Record
        const transactionRef = window.db.collection('transactions').doc(); // Auto-generate ID
        batch.set(transactionRef, {
            type: "outbound",
            productId: data.productId,
            productCode: data.productCode, // Should be passed in data
            productName: data.productName, // Should be passed in data
            warehouseId: data.warehouseId,
            batchNo: data.batchNo || null,
            quantity: outboundQuantity,
            operatorId: data.operatorId,
            transactionDate: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update Inventory
        batch.update(inventoryDoc.ref, {
            quantity: firebase.firestore.FieldValue.increment(-outboundQuantity),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { transactionId: transactionRef.id, status: "success" };
    }
};

window.dashboardAPI = {
    async getStats() {
        try {
            // Get total products
            const productsSnapshot = await window.db.collection('products').get();
            const totalProducts = productsSnapshot.size;

            // Get total inventory quantity
            const inventorySnapshot = await window.db.collection('inventory').get();
            let totalInventory = 0;
            inventorySnapshot.forEach(doc => {
                totalInventory += (doc.data().quantity || 0); // Sum quantities, default to 0 if undefined
            });

            // Get today's transactions
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0); // Set to midnight today

            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999); // Set to end of today

            const transactionsQuery = window.db.collection('transactions')
                .where('transactionDate', '>=', todayStart)
                .where('transactionDate', '<=', todayEnd);
            const todayTransactionsSnapshot = await transactionsQuery.get();
            const todayTransactions = todayTransactionsSnapshot.size;

            return {
                totalProducts: totalProducts,
                totalInventory: totalInventory,
                todayTransactions: todayTransactions
            };

        } catch (error) {
            console.error("Error fetching dashboard stats from Firestore:", error);
            // Return zeros or throw, depending on how UI should behave on error
            return { totalProducts: 0, totalInventory: 0, todayTransactions: 0 }; 
        }
    }
};

console.log("productAPI, inventoryAPI, transactionAPI (inbound/outbound/getTransactions), and dashboardAPI now use Firestore.");
