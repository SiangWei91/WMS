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

    async outboundStock(data) {
        const inventoryQuery = window.db.collection('inventory')
            .where('productId', '==', data.productId) 
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
            transactionDate: firebase.firestore.FieldValue.serverTimestamp()
        });
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
