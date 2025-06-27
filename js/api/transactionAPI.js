// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Depends on: listeners.js (transactionListenerUnsubscribe)

const transactionAPI_module = { // Renamed for clarity
    async getTransactions(params = {}) {
        await ensureDbManager();
        const { productCode, type, startDate, endDate, limit = 10, currentPage = 1 } = params;

        try {
            const db = await window.indexedDBManager.initDB();
            const transactionStoreName = window.indexedDBManager.STORE_NAMES.TRANSACTIONS;

            if (!db.objectStoreNames.contains(transactionStoreName)) {
                console.log("Transactions store not found, fetching from Firestore...");
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
            const index = store.index('transactionDate'); 

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

            await new Promise((resolveCount, rejectCount) => {
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
            
            await new Promise((resolveCursor, rejectCursor) => {
                const cursorRequest = index.openCursor(range, 'prev'); 
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
                                hasMoreDataForNextPage = true; 
                                resolveCursor(); 
                                return; 
                            }
                        }
                        cursor.continue();
                    } else {
                        resolveCursor(); 
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
                    hasNextPage: hasMoreDataForNextPage,
                    lastVisibleDocId: null 
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
                            if (!existingItem || !areObjectsShallowEqual(existingItem, txData, ['transactionDate'])) { 
                                itemsToUpdate.push(txData);
                            }
                            changedCount++; 
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
            if (!destAggItem || destAggItem.productCode !== productCode) { // If not found or it's a different product (shouldn't happen with productCode key)
                 destAggItem = { productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
            }
            // It's crucial that destAggItem is the same item as sourceAggItem if we want to update the same inventory record.
            // The current logic re-fetches, which is fine.
            // If it's the same product, total quantity should be preserved.
            // The local update for sourceAggItem already happened. Now for destAggItem.
            
            // Ensure we are working with a distinct copy for destination updates if it's the same productCode
            // to avoid issues if the object is shared and modified.
            // However, since we're updating specific warehouse quantities, and totalQuantity is recalculated, it should be okay.
            
            destAggItem.quantitiesByWarehouseId[destinationWarehouseId] = (destAggItem.quantitiesByWarehouseId[destinationWarehouseId] || 0) + numericQuantity;
            destAggItem.lastUpdated = new Date().toISOString();
            destAggItem.pendingSync = true;
            
            let newTotal = 0;
            for(const whId in destAggItem.quantitiesByWarehouseId){
                newTotal += (destAggItem.quantitiesByWarehouseId[whId] || 0);
            }
            destAggItem.totalQuantity = newTotal;
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
            // Add to local IDB transactions store
            try {
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, localOutboundTx);
            } catch (idbError) {
                console.error("Error adding offline outbound transfer leg to IDB transactions store:", idbError);
            }

            const localInboundTx = {
                ...inboundTx,
                id: `local_tx_${new Date().getTime()}_in_${Math.random().toString(36).substr(2, 5)}`,
                transactionDate: new Date().toISOString(),
                pendingSync: true
            };
            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'transactions', operation: 'inbound', payload: localInboundTx, timestamp: new Date().toISOString()
            });
            // Add to local IDB transactions store
             try {
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, localInboundTx);
            } catch (idbError) {
                console.error("Error adding offline inbound transfer leg to IDB transactions store:", idbError);
            }
            
            console.log("Internal transfer transactions queued offline and added to local IDB transaction store.");
            return { status: "queued_offline", outboundTxId: localOutboundTx.id, inboundTxId: localInboundTx.id };
        }
    }
};

window.transactionAPI = transactionAPI_module;
