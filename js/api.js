// generateNameTokens function removed

const productAPI_firestore = {
    async getProducts(params = {}) { 
        try {
            let productsQuery = window.db.collection('products');
            // Example: Add orderBy if needed, e.g., productsQuery = productsQuery.orderBy('createdAt', 'desc');
            // TODO: Implement actual pagination using params.limit and Firestore cursors (startAfter)
            // TODO: Implement actual search/filtering based on params.searchTerm

            const querySnapshot = await productsQuery.get();
            const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            return { 
                data: products, 
                pagination: { 
                    page: params.page || 1,  
                    totalPages: 1,          
                    totalRecords: products.length 
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
        const searchTerm = searchText.trim(); // No longer lowercasing here, Firestore handles casing for range.

        try {
            // Case-sensitive "starts-with" query on 'name' field
            const querySnapshot = await productsCollectionRef
                .where('name', '>=', searchTerm)
                .where('name', '<=', searchTerm + '\uf8ff') // \uf8ff is a high Unicode char for range queries
                .limit(10) 
                .get();
            
            const products = [];
            querySnapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            
            // console.log(`Found ${products.length} products for search term: "${searchText}"`);
            return products;
        } catch (error) {
            // console.error(`Error searching products by name for "${searchText}": `, error);
            throw error; 
        }
    }
};

window.productAPI = productAPI_firestore; 

// --- Placeholder/Outdated APIs ---
window.inventoryAPI = {
    async getInventory(params = {}) {
        try {
            let inventoryQuery = window.db.collection('inventory');
            if (params.productCode && params.productCode.trim() !== '') {
                inventoryQuery = inventoryQuery.where('productCode', '==', params.productCode.trim());
            }
            const querySnapshot = await inventoryQuery.get();
            const inventoryItems = querySnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            return { 
                data: inventoryItems, 
                pagination: { 
                    page: 1, 
                    totalPages: 1, 
                    totalRecords: inventoryItems.length 
                } 
            };
        } catch (error) {
            console.error("Error fetching inventory from Firestore:", error);
            throw error; 
        }
    }
};

window.transactionAPI = {
    async getTransactions(params = {}) {
        try {
            const defaultLimit = 10; 
            const limit = params.limit || defaultLimit;
            let query = window.db.collection('transactions').orderBy('transactionDate', 'desc');

            if (params.type) {
                query = query.where('type', '==', params.type);
            }
            if (params.startDate) { 
                query = query.where('transactionDate', '>=', params.startDate);
            }
            if (params.endDate) { 
                query = query.where('transactionDate', '<=', params.endDate);
            }
            if (params.lastVisibleDocId) {
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
                    hasNextPage: transactions.length === limit, 
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
            transactionDate: firebase.firestore.FieldValue.serverTimestamp()
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
            });
        }
        await batch.commit();
        return { transactionId: transactionRef.id, status: "success" };
    },

    async outboundStock(data) { // This function remains for general purpose outbound stock
        const inventoryQuery = window.db.collection('inventory')
            .where('productId', '==', data.productId)
            .where('warehouseId', '==', data.warehouseId)
            .where('batchNo', '==', data.batchNo || null); // Ensure batchNo comparison is correct
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
            operatorId: data.operatorId, // Make sure this is passed in `data`
            transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
            relatedInventoryId: inventoryDoc.id // Store related inventory ID for traceability
        });

        batch.update(inventoryDoc.ref, {
            quantity: firebase.firestore.FieldValue.increment(-outboundQuantity),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        return { transactionId: transactionRef.id, status: "success", inventoryId: inventoryDoc.id };
    },

    async outboundStockByInventoryId(data) {
        // data should include: inventoryId, quantityToDecrement, productCode, productName, operatorId, palletsToDecrement
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

            // Validate carton quantity
            if (isNaN(quantityToDecrement) || quantityToDecrement < 0) { // Ensure non-negative, allows 0 if only pallets are moved (though unlikely)
                throw new Error("Quantity to decrement must be a non-negative number.");
            }
            if (currentQuantity < quantityToDecrement) {
                throw new Error(`Insufficient carton stock for inventory item ${data.inventoryId} (${currentItemData.productCode}). Available: ${currentQuantity}, Requested: ${quantityToDecrement}.`);
            }

            // Prepare for pallet quantity validation and deduction if applicable (Jordon items)
            let palletsToDecrementNum = 0;
            let currentPallets = 0;
            let newPalletCount = 0; // Will hold the calculated new pallet count for Jordon items

            if (currentItemData.warehouseId === 'jordon') {
                currentPallets = (currentItemData._3plDetails && currentItemData._3plDetails.pallet !== undefined)
                                ? Number(currentItemData._3plDetails.pallet)
                                : 0;
                // Ensure data.palletsToDecrement is treated as a number, default to 0 if not provided or invalid
                palletsToDecrementNum = (data.palletsToDecrement !== undefined && !isNaN(Number(data.palletsToDecrement))) 
                                      ? Number(data.palletsToDecrement) 
                                      : 0;

                if (palletsToDecrementNum < 0) { // Already validated in handleAddToStockOutList, but good to be safe
                    throw new Error(`Invalid pallet quantity to decrement (${data.palletsToDecrement}). Must be a non-negative number.`);
                }
                if (palletsToDecrementNum > currentPallets) { // Also validated earlier
                    throw new Error(`Insufficient pallet stock for Jordon item ${data.inventoryId}. Available: ${currentPallets}, Requested: ${palletsToDecrementNum}.`);
                }
                newPalletCount = currentPallets - palletsToDecrementNum;
            }

            // Product ID determination for logging
            let effectiveProductId = data.productId; 
            const inventoryProductId = currentItemData.productId; 
            if (!effectiveProductId && inventoryProductId) {
                effectiveProductId = inventoryProductId;
                // console.warn for discrepancies can be re-added if needed
            } else if (!inventoryProductId && !effectiveProductId) { // If both are missing
                 console.warn(`Transaction Log for ${data.inventoryId}: productId is missing from both input data and inventory document. This indicates a data integrity issue.`);
            }
            // If effectiveProductId is still falsy after these checks, it will cause an error in transaction.set if required by rules
            if (!effectiveProductId) {
                throw new Error(`Cannot log transaction for inventory ID ${data.inventoryId}: effectiveProductId is undefined/null. Please ensure the inventory item and product data are correctly linked.`);
            }
            
            // Log the transaction
            const transactionLogRef = db.collection('transactions').doc();
            const logData = {
                type: "outbound",
                inventoryId: data.inventoryId, 
                productId: effectiveProductId, 
                productCode: currentItemData.productCode || data.productCode, 
                productName: currentItemData.productName || data.productName, 
                warehouseId: currentItemData.warehouseId, 
                batchNo: currentItemData.batchNo || null, 
                quantity: quantityToDecrement, // Log carton quantity decremented
                operatorId: data.operatorId,
                transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
                description: `Stock out for transfer. Inventory ID: ${data.inventoryId}`
            };
            if (currentItemData.warehouseId === 'jordon') {
                logData.palletsDecremented = palletsToDecrementNum; // Log pallet quantity decremented
            }
            transaction.set(transactionLogRef, logData);

            // Prepare inventory update payload
            const newQuantity = currentQuantity - quantityToDecrement;
            const updatePayload = {
                quantity: newQuantity,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (currentItemData.warehouseId === 'jordon') {
                // Ensure _3plDetails structure exists if we are about to write to its pallet subfield
                if (!currentItemData._3plDetails && palletsToDecrementNum >= 0) { // palletsToDecrementNum will be 0 if not provided
                    updatePayload._3plDetails = { pallet: newPalletCount };
                } else if (currentItemData._3plDetails || palletsToDecrementNum >= 0) { // If _3plDetails exists or we need to set pallet
                    updatePayload['_3plDetails.pallet'] = newPalletCount;
                }
                
                console.log(`Jordon item ${data.inventoryId}: Cartons ${currentQuantity}->${newQuantity}. Pallets ${currentPallets}->${newPalletCount}. (Decrement requested: ${palletsToDecrementNum} pallets)`);

                // Safeguard: If all cartons are gone, pallets must be zero.
                // This overrides the calculation if, for instance, user said 0 pallets out but took all cartons.
                if (newQuantity === 0 && updatePayload['_3plDetails.pallet'] !== 0) {
                    console.warn(`Jordon item ${data.inventoryId}: All cartons depleted. Forcing _3plDetails.pallet to 0 (was calculated as ${updatePayload['_3plDetails.pallet']}).`);
                    if (!updatePayload._3plDetails) updatePayload._3plDetails = {};
                    updatePayload['_3plDetails.pallet'] = 0;
                }
            }
            transaction.update(inventoryDocRef, updatePayload);

            return { transactionId: transactionLogRef.id, status: "success", inventoryId: data.inventoryId };
        });
    },

    // Reviewing inboundStock: It seems generally suitable.
    // It creates a new inventory record if one doesn't exist for the product/warehouse/batch,
    // or increments quantity if it does. This is the desired behavior for the destination warehouse.
    // We need to ensure all necessary data (productId, productCode, productName, warehouseId, batchNo, quantity, operatorId)
    // is correctly passed from handleSubmitAllStockOut.
    async inboundStock(data) { // data: productId, productCode, productName, warehouseId, batchNo, quantity, operatorId, expiryDate (optional)
        const db = window.db; // or firebase.firestore()
        const batch = db.batch();
        const transactionRef = db.collection('transactions').doc();

        batch.set(transactionRef, {
            type: "inbound",
            productId: data.productId,
            productCode: data.productCode,
            productName: data.productName,
            warehouseId: data.warehouseId, // Destination warehouse
            batchNo: data.batchNo || null,
            quantity: Number(data.quantity),
            operatorId: data.operatorId,
            transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
            description: `Stock in to ${data.warehouseId} from Jordon transfer.`
        });

        const inventoryQuery = db.collection('inventory')
            .where('productId', '==', data.productId)
            .where('warehouseId', '==', data.warehouseId)
            .where('batchNo', '==', data.batchNo || null); // Ensure batchNo comparison is correct

        const inventorySnapshot = await inventoryQuery.limit(1).get();

        if (!inventorySnapshot.empty) {
            const inventoryDocRef = inventorySnapshot.docs[0].ref;
            batch.update(inventoryDocRef, {
                quantity: firebase.firestore.FieldValue.increment(Number(data.quantity)),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                // Optionally update other fields if they can change, e.g., productName, though less likely for existing stock
                productName: data.productName, // Ensure product name is consistent
                productCode: data.productCode  // Ensure product code is consistent
            });
        } else {
            const newInventoryRef = db.collection('inventory').doc();
            // Ensure all necessary fields for a new inventory item are present in `data`
            // or fetched/derived if necessary.
            // For a transfer, core product details should remain the same.
            // _3plDetails might need to be considered if the destination warehouse also uses it.
            // For now, keeping it simple for the transferred item.
            batch.set(newInventoryRef, {
                productId: data.productId,
                productCode: data.productCode,
                productName: data.productName,
                warehouseId: data.warehouseId, // Destination warehouse
                batchNo: data.batchNo || null,
                quantity: Number(data.quantity),
                // expiryDate: data.expiryDate ? new Date(data.expiryDate) : null, // If expiry is tracked
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                // Add any other relevant fields for a new inventory record in the destination.
                // For example, if the destination uses _3plDetails, it might need default values.
                // _3plDetails: { location: 'default_location', status: 'Complete', palletType: 'N/A' } // Example
            });
        }
        await batch.commit();
        return { transactionId: transactionRef.id, status: "success" };
    }
};

window.dashboardAPI = {
    async getStats() {
        try {
            const productsSnapshot = await window.db.collection('products').get();
            const totalProducts = productsSnapshot.size;
            const inventorySnapshot = await window.db.collection('inventory').get();
            let totalInventory = 0;
            inventorySnapshot.forEach(doc => {
                totalInventory += (doc.data().quantity || 0); 
            });
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0); 
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999); 
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
            return { totalProducts: 0, totalInventory: 0, todayTransactions: 0 }; 
        }
    }
};

console.log("productAPI, inventoryAPI, transactionAPI (inbound/outbound/getTransactions), and dashboardAPI now use Firestore.");

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
                .orderBy("lotNumber", "asc")
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
