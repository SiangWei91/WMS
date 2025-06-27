// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Depends on: listeners.js (transactionListenerUnsubscribe)

const transactionAPI_module = { // Renamed for clarity
    async getTransactions(params = {}) {
        console.log('[transactionAPI.getTransactions] Called with params:', JSON.parse(JSON.stringify(params))); // Log params
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
            console.log('[transactionAPI.getTransactions] Using range for IndexedDB query:', range); // Log range

            const results = [];
            let totalItems = 0;
            const offset = (currentPage - 1) * limit;
            let cursorAdvancement = offset;
            let hasMoreDataForNextPage = false;
            let rawCountAll = 0; // Log raw count

            await new Promise((resolveCount, rejectCount) => {
                const countCursorRequest = index.openCursor(range, 'prev');
                countCursorRequest.onsuccess = event => {
                    const cursor = event.target.result;
                    if (cursor) {
                        rawCountAll++; // Count all items iterated by cursor
                        const item = cursor.value;
                        // console.log('[transactionAPI.getTransactions countCursor] Iterating item:', JSON.parse(JSON.stringify(item))); // Potentially very verbose
                        let match = true;
                        if (productCode && item.productCode !== productCode) match = false;
                        if (type && item.type !== type) match = false;
                        
                        if (match) {
                            totalItems++;
                        }
                        cursor.continue();
                    } else {
                        console.log(`[transactionAPI.getTransactions countCursor] Raw items iterated by count cursor: ${rawCountAll}, Matched items for total: ${totalItems}`);
                        resolveCount();
                    }
                };
                countCursorRequest.onerror = event => rejectCount(event.target.error);
            });
            
            let rawItemsIteratedMain = 0; // Log raw items for main cursor
            await new Promise((resolveCursor, rejectCursor) => {
                const cursorRequest = index.openCursor(range, 'prev'); 
                cursorRequest.onsuccess = event => {
                    const cursor = event.target.result;
                    if (cursor) {
                        rawItemsIteratedMain++;
                        const item = cursor.value;
                        // console.log('[transactionAPI.getTransactions mainCursor] Iterating item:', JSON.parse(JSON.stringify(item))); // Potentially very verbose
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
                        console.log(`[transactionAPI.getTransactions mainCursor] Raw items iterated by main cursor: ${rawItemsIteratedMain}`);
                        resolveCursor(); 
                    }
                };
                cursorRequest.onerror = event => rejectCursor(event.target.error);
            });
            
            console.log('[transactionAPI.getTransactions] Returning results:', JSON.parse(JSON.stringify(results)), 'Total items matching filters:', totalItems); // Log final results
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
                        const rawData = change.doc.data();
                        const operatorId = rawData.operatorId;
                        const docId = change.doc.id;

                        if (operatorId === 'system_excel_import') {
                            // Check if the transactionDate is null or not a Firestore Timestamp object
                            if (rawData.transactionDate === null || typeof rawData.transactionDate?.toDate !== 'function') {
                                console.log(`[Transaction Listener - Excel Import] Skipping doc ID ${docId} for now (operatorId: ${operatorId}). transactionDate is null or not a Firestore Timestamp. Value:`, rawData.transactionDate);
                                // Skip this change, wait for the update with the resolved server timestamp
                                continue; 
                            }
                            // console.log('[Transaction Listener - Excel Import] Raw data received (valid date expected):', JSON.parse(JSON.stringify(rawData)));
                            // console.log('[Transaction Listener - Excel Import] Raw transactionDate from Firestore (valid date expected):', rawData.transactionDate);
                        }

                        let txData = { id: docId, ...rawData };

                        if (txData.transactionDate && typeof txData.transactionDate.toDate === 'function') {
                            // if (operatorId === 'system_excel_import') {
                            //     console.log('[Transaction Listener - Excel Import] Attempting to convert transactionDate to ISOString. Original:', txData.transactionDate);
                            // }
                            try {
                                txData.transactionDate = txData.transactionDate.toDate().toISOString();
                                // if (operatorId === 'system_excel_import') {
                                //     console.log('[Transaction Listener - Excel Import] Converted transactionDate to ISOString:', txData.transactionDate);
                                // }
                            } catch (e) {
                                console.error('[Transaction Listener] Error converting transactionDate to ISOString:', e, 'Original value:', txData.transactionDate, 'Doc ID:', docId);
                                // If conversion fails, it might remain a Firestore Timestamp object.
                                // Depending on strictness, you might want to skip or set to null.
                                // For now, let it proceed and see if areObjectsShallowEqual catches it or if IDB errors.
                            }
                        } else if (txData.transactionDate !== null && operatorId === 'system_excel_import') {
                            // This case should ideally not be hit if the above skip logic works for null/unresolved timestamps.
                            // However, if it's some other non-convertible format, log it.
                            console.warn(`[Transaction Listener - Excel Import] Doc ID ${docId}: transactionDate is present but not a convertable Firestore Timestamp. Value:`, txData.transactionDate);
                        }
                        
                        if (change.type === "added" || change.type === "modified") {
                            const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, txData.id);
                            // If it's a new item, or if the transactionDate has changed, 
                            // or if other fields have changed (checked by areObjectsShallowEqual ignoring transactionDate)
                            if (!existingItem || 
                                existingItem.transactionDate !== txData.transactionDate || 
                                !areObjectsShallowEqual(existingItem, txData, ['transactionDate'])
                            ) {
                                itemsToUpdate.push(txData);
                            } else {
                                // console.log(`[Transaction Listener] Doc ID ${txData.id} data is same as in IDB (considering transactionDate separately), skipping update.`);
                            }
                            changedCount++;
                        }
                        if (change.type === "removed") {
                            itemIdsToDelete.push(txData.id);
                            changedCount++;
                        }
                    }

                    if (itemsToUpdate.length > 0) {
                        console.log(`[transactionAPI listener] About to call bulkPutItems for ${itemsToUpdate.length} items.`); // New log
                        try {
                            await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, itemsToUpdate);
                            console.log(`[transactionAPI listener] bulkPutItems completed for ${itemsToUpdate.length} items.`); // New Log
                            
                            // Verification step
                            console.log(`[transactionAPI listener] After bulkPut completion, trying to verify IDB content for transactions.`);
                            const allTxInIDB = await window.indexedDBManager.getAllItems(window.indexedDBManager.STORE_NAMES.TRANSACTIONS);
                            console.log(`[transactionAPI listener] Verification: ${allTxInIDB.length} items found in IDB transactions store immediately after bulkPut. First item (if any):`, allTxInIDB[0] ? JSON.parse(JSON.stringify(allTxInIDB[0])) : 'N/A');
                        } catch (err) {
                            console.error('[transactionAPI listener] Error during bulkPutItems or subsequent verification:', err);
                        }
                         // Original log moved slightly to be outside the try if only bulkPutItems is in try, but it's fine here.
                        console.log(`Transaction listener: Finished processing updates for ${itemsToUpdate.length} items in IndexedDB.`);
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
        console.log("[performInternalTransfer] Initiated with data:", JSON.parse(JSON.stringify(transferData)));
        await ensureDbManager();
        const { 
            productId, productCode, productName, 
            sourceWarehouseId, destinationWarehouseId, 
            quantity, operatorId, batchNo, // Expect actual product batchNo here
            sourceBatchDocId // Firestore document ID of the batch entry in 'inventory' collection
        } = transferData;

        if (!productCode || !sourceWarehouseId || !destinationWarehouseId || !quantity || isNaN(Number(quantity))) {
            console.error("[performInternalTransfer] Invalid transferData received (basic validation):", JSON.parse(JSON.stringify(transferData)));
            throw new Error("Invalid data for internal transfer. Missing required fields or invalid quantity.");
        }
        // It's possible that batchNo might be null or undefined if not applicable for a product,
        // so we don't strictly require it in the validation above unless business logic demands all transfers must have a batch.
        // For now, we'll pass it along if present.

        const numericQuantity = Number(quantity);
        // This 'batchNoForTransfer' is actually a reference ID for the transfer operation itself.
        // Let's keep its generation but ensure the actual product batchNo is also handled.
        const operationReferenceBatchNo = `TRANSFER-${sourceWarehouseId}-TO-${destinationWarehouseId}`;
        console.log(`[performInternalTransfer] Generated operationReferenceBatchNo: ${operationReferenceBatchNo}`);

        const commonTxData = {
            productId: productId || null, 
            productCode,
            productName,
            quantity: numericQuantity,
            operatorId,
            productBatchNo: batchNo, // Storing the actual product's batch number
            batchNo: operationReferenceBatchNo, // This is the transfer operation's reference ID
            // Note: The original 'batchNo' field in transactions will now store the operationReferenceBatchNo.
            // The actual product's batch is stored in 'productBatchNo'.
            // This is a choice: alternatively, one could rename the transaction field e.g. transaction.operationRef 
            // and keep transaction.batchNo for the product's batch.
            // For now, adding a new field 'productBatchNo' is less disruptive to existing queries on 'batchNo'.
        };

        const outboundTx = {
            ...commonTxData,
            type: "outbound",
            warehouseId: sourceWarehouseId,
            description: `Internal transfer to warehouse ${destinationWarehouseId}` // More specific
        };
        const inboundTx = {
            ...commonTxData,
            type: "inbound",
            warehouseId: destinationWarehouseId,
            description: `Internal transfer from warehouse ${sourceWarehouseId}` // More specific
        };

        console.log("[performInternalTransfer] Outbound transaction data:", JSON.parse(JSON.stringify(outboundTx)));
        console.log("[performInternalTransfer] Inbound transaction data:", JSON.parse(JSON.stringify(inboundTx)));

        try {
            if (navigator.onLine && window.db && firebase.firestore) { // Added firebase.firestore check
                console.log("[performInternalTransfer] ONLINE mode detected.");
                const batch = window.db.batch();
                
                const outboundTxRef = window.db.collection('transactions').doc();
                batch.set(outboundTxRef, { ...outboundTx, transactionDate: firebase.firestore.FieldValue.serverTimestamp() });
                console.log(`[performInternalTransfer] Staging OUTBOUND tx (ID: ${outboundTxRef.id}) to batch.`);

                const inboundTxRef = window.db.collection('transactions').doc();
                batch.set(inboundTxRef, { ...inboundTx, transactionDate: firebase.firestore.FieldValue.serverTimestamp() });
                console.log(`[performInternalTransfer] Staging INBOUND tx (ID: ${inboundTxRef.id}) to batch.`);

                // Update the specific batch document in the 'inventory' collection for the source warehouse
                if (sourceBatchDocId) {
                    const sourceBatchRef = window.db.collection('inventory').doc(sourceBatchDocId);
                    // It's safer to use FieldValue.increment with a negative value for atomic updates.
                    // This also handles the case where the document might be updated by another process concurrently.
                    batch.update(sourceBatchRef, {
                        quantity: firebase.firestore.FieldValue.increment(-numericQuantity),
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // Also update lastUpdated timestamp
                    });
                    console.log(`[performInternalTransfer] Staging update to source batch document (ID: ${sourceBatchDocId}) to decrement quantity by ${numericQuantity}.`);
                } else {
                    // This case should ideally be prevented by UI requiring batch selection if batches exist.
                    // If sourceBatchDocId is missing, it implies we can't update the specific batch.
                    // This might be an error or an old transfer style. For now, log a warning.
                    console.warn(`[performInternalTransfer] sourceBatchDocId is missing. Cannot update specific source batch quantity in 'inventory' collection.`);
                }
                
                await batch.commit();
                console.log(`[performInternalTransfer] ONLINE batch commit SUCCESS. Outbound Tx ID: ${outboundTxRef.id}, Inbound Tx ID: ${inboundTxRef.id}. Source batch doc update staged if ID provided.`);
                return { status: "success", outboundTxId: outboundTxRef.id, inboundTxId: inboundTxRef.id };
            } else {
                console.log("[performInternalTransfer] OFFLINE mode detected.");
                console.log(`[performInternalTransfer] OFFLINE: Updating IndexedDB INVENTORY for productCode: ${productCode}`);

                let sourceAggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, productCode);
                console.log(`[performInternalTransfer] OFFLINE: Fetched sourceAggItem (before outbound):`, JSON.parse(JSON.stringify(sourceAggItem)));
                if (!sourceAggItem) {
                    sourceAggItem = { productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
                    console.log(`[performInternalTransfer] OFFLINE: sourceAggItem not found, initialized.`, JSON.parse(JSON.stringify(sourceAggItem)));
                }
                
                sourceAggItem.totalQuantity = (sourceAggItem.totalQuantity || 0) - numericQuantity;
                sourceAggItem.quantitiesByWarehouseId[sourceWarehouseId] = (sourceAggItem.quantitiesByWarehouseId[sourceWarehouseId] || 0) - numericQuantity;
                sourceAggItem.lastUpdated = new Date().toISOString();
                sourceAggItem.pendingSync = true; 
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, sourceAggItem);
                console.log(`[performInternalTransfer] OFFLINE: Updated sourceAggItem (after outbound):`, JSON.parse(JSON.stringify(sourceAggItem)));
                
                // Re-fetch or use the same item for destination updates. Re-fetching ensures we have the latest if multiple ops happened.
                let destAggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, productCode);
                console.log(`[performInternalTransfer] OFFLINE: Fetched destAggItem (before inbound):`, JSON.parse(JSON.stringify(destAggItem)));
                if (!destAggItem || destAggItem.productCode !== productCode) { 
                     destAggItem = { productCode, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() };
                     console.log(`[performInternalTransfer] OFFLINE: destAggItem not found or mismatched, initialized.`, JSON.parse(JSON.stringify(destAggItem)));
                }
                
                // Update destination quantity for the specific warehouse
                destAggItem.quantitiesByWarehouseId[destinationWarehouseId] = (destAggItem.quantitiesByWarehouseId[destinationWarehouseId] || 0) + numericQuantity;
                
                // Recalculate total quantity based on all warehouse quantities in this item
                let newTotal = 0;
                for(const whId in destAggItem.quantitiesByWarehouseId){
                    newTotal += (destAggItem.quantitiesByWarehouseId[whId] || 0);
                }
                destAggItem.totalQuantity = newTotal;
                destAggItem.lastUpdated = new Date().toISOString();
                destAggItem.pendingSync = true;
                
                await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, destAggItem);
                console.log(`[performInternalTransfer] OFFLINE: Updated destAggItem (after inbound and total recalc):`, JSON.parse(JSON.stringify(destAggItem)));

                const localOutboundTx = {
                    ...outboundTx,
                    id: `local_tx_out_${new Date().getTime()}_${Math.random().toString(36).substr(2, 5)}`, // Unique ID
                    transactionDate: new Date().toISOString(),
                    pendingSync: true
                };
                console.log("[performInternalTransfer] OFFLINE: localOutboundTx prepared:", JSON.parse(JSON.stringify(localOutboundTx)));
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: 'transactions', operation: 'outbound', payload: { ...localOutboundTx }, timestamp: new Date().toISOString() // Ensure payload is a copy
                });
                console.log("[performInternalTransfer] OFFLINE: Added localOutboundTx to OFFLINE_QUEUE.");
                try {
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, localOutboundTx);
                    console.log("[performInternalTransfer] OFFLINE: Added localOutboundTx to local TRANSACTIONS store.");
                } catch (idbError) {
                    console.error("[performInternalTransfer] OFFLINE: Error adding localOutboundTx to IDB TRANSACTIONS store:", idbError);
                }

                const localInboundTx = {
                    ...inboundTx,
                    id: `local_tx_in_${new Date().getTime()}_${Math.random().toString(36).substr(2, 5)}`, // Unique ID
                    transactionDate: new Date().toISOString(),
                    pendingSync: true
                };
                console.log("[performInternalTransfer] OFFLINE: localInboundTx prepared:", JSON.parse(JSON.stringify(localInboundTx)));
                await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                    storeName: 'transactions', operation: 'inbound', payload: { ...localInboundTx }, timestamp: new Date().toISOString() // Ensure payload is a copy
                });
                console.log("[performInternalTransfer] OFFLINE: Added localInboundTx to OFFLINE_QUEUE.");
                 try {
                    await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, localInboundTx);
                    console.log("[performInternalTransfer] OFFLINE: Added localInboundTx to local TRANSACTIONS store.");
                } catch (idbError) {
                    console.error("[performInternalTransfer] OFFLINE: Error adding localInboundTx to IDB TRANSACTIONS store:", idbError);
                }
                
                console.log("[performInternalTransfer] OFFLINE: Processing complete.");
                return { status: "queued_offline", outboundTxId: localOutboundTx.id, inboundTxId: localInboundTx.id };
            }
        } catch (error) {
            console.error("[performInternalTransfer] CRITICAL ERROR during transfer processing:", error);
            console.error("[performInternalTransfer] Transfer Data that caused error:", JSON.parse(JSON.stringify(transferData)));
            // Depending on where the error occurred, inventory might be partially updated (especially in offline)
            // Re-throw the error so the caller (handleInternalTransferSubmit) can catch it and inform the user.
            throw error; 
        }
    }
};

window.transactionAPI = transactionAPI_module;
console.log("transactionAPI.js executed and window.transactionAPI assigned:", window.transactionAPI && typeof window.transactionAPI.listenToTransactionChanges === 'function');
