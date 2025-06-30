// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Supabase: Uses window.supabaseClient
// import { incrementReadCount } from '../firebaseReadCounter.js'; // Firebase specific

let transactionListenerUnsubscribe = null; // Will hold the Supabase subscription object

const transactionAPI_module = {
    async getTransactions(params = {}) {
        console.log('[transactionAPI.getTransactions] Called with params:', JSON.parse(JSON.stringify(params)));
        await ensureDbManager();
        const { product_code, type, startDate, endDate, limit = 10, currentPage = 1 } = params; // CHANGED productCode to product_code

        try {
            const idb = await window.indexedDBManager.initDB(); // Renamed 'db' to 'idb' to avoid confusion with supabase client
            const transactionStoreName = window.indexedDBManager.STORE_NAMES.TRANSACTIONS;

            // Check if IndexedDB has been populated. If not, fetch from Supabase.
            // This logic might need adjustment based on how often full sync is desired.
            // For now, assume if empty, fetch all and cache.
            const countInIDB = await window.indexedDBManager.countItems(transactionStoreName);
            if (countInIDB === 0) {
                console.log("Transactions store in IndexedDB is empty, fetching from Supabase...");
                if (!window.supabaseClient) throw new Error("Supabase client is not available.");

                const { data: supabaseTransactions, error: fetchError } = await window.supabaseClient
                    .from('transactions')
                    .select('*')
                    .order('transaction_date', { ascending: false }); // Match Firestore's orderBy

                if (fetchError) {
                    console.error("Error fetching transactions from Supabase:", fetchError);
                    throw fetchError;
                }

                const itemsToCache = supabaseTransactions.map(tx => ({
                    ...tx,
                    // Ensure field name consistency if IndexedDB expects specific names, e.g., product_code, transactionDate // CHANGED
                    product_code: tx.product_code, // CHANGED key
                    transactionDate: tx.transaction_date
                }));

                if (itemsToCache.length > 0) {
                    await window.indexedDBManager.bulkPutItems(transactionStoreName, itemsToCache);
                    console.log(`Cached ${itemsToCache.length} transactions from Supabase to IndexedDB.`);
                }
            }

            const tx = idb.transaction(transactionStoreName, 'readonly');
            const store = tx.objectStore(transactionStoreName);
            // Assuming 'transactionDate' is the correct index name in IndexedDB.
            // Schema uses 'transaction_date', ensure it's mapped correctly when caching.
            const index = store.index('transactionDate');


            let range = null;
            if (startDate && endDate) {
                range = IDBKeyRange.bound(new Date(startDate).toISOString(), new Date(endDate).toISOString());
            } else if (startDate) {
                range = IDBKeyRange.lowerBound(new Date(startDate).toISOString());
            } else if (endDate) {
                range = IDBKeyRange.upperBound(new Date(endDate).toISOString());
            }
            console.log('[transactionAPI.getTransactions] Using range for IndexedDB query:', range);

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
                        const item = cursor.value; // item from IDB, will have product_code
                        let match = true;
                        if (product_code && item.product_code !== product_code) match = false; // CHANGED
                        if (type && item.type !== type) match = false;
                        // Note: productId filter is handled by Supabase query if provided, or not applied if only IDB
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
                        const item = cursor.value; // item from IDB, will have product_code
                        let match = true;
                        if (product_code && item.product_code !== product_code) match = false; // CHANGED
                        if (type && item.type !== type) match = false;
                        // Note: productId filter logic
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

            console.log('[transactionAPI.getTransactions] Returning results:', JSON.parse(JSON.stringify(results)), 'Total items matching filters:', totalItems);
            return {
                data: results,
                pagination: {
                    currentPage: currentPage,
                    itemsPerPage: limit,
                    totalItems: totalItems,
                    totalPages: Math.ceil(totalItems / limit),
                    hasNextPage: hasMoreDataForNextPage,
                    lastVisibleDocId: null // This was Firestore specific, may not apply to Supabase pagination directly
                }
            };

        } catch (error) {
            console.error("Error in transactionAPI.getTransactions (IndexedDB/Supabase):", error);
            return { data: [], pagination: { currentPage: currentPage, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false, lastVisibleDocId: null } };
        }
    },

    async inboundStock(data) {
        await ensureDbManager();
        const quantity = Number(data.quantity);
        // Map to Supabase column names
        const transactionPayload = {
            type: "inbound",
            product_id: data.productId, // Schema uses product_id - assuming this is a distinct identifier
            product_code: data.product_code, // CHANGED - data now provides product_code
            product_name: data.productName,
            warehouse_id: data.warehouseId,
            batch_no: data.batchNo || null, // This is operationReferenceBatchNo in internal transfers
            // product_batch_no: data.actualProductBatchNo, // if it's a separate field
            quantity: quantity,
            operator_id: data.operatorId,
            description: data.description || `Stock in to ${data.warehouseId}.`,
            // transaction_date will be set by Supabase (DEFAULT NOW()) or here for offline
        };

        if (navigator.onLine && window.supabaseClient) {
            // For online, transaction_date is handled by DB default or set to new Date().toISOString()
            // Supabase doesn't have a direct equivalent of FieldValue.serverTimestamp() for client-side optimistic updates
            // before insert. Best to let the DB handle it or use new Date().toISOString().
            // If an ID is needed before insert, generate a UUID client-side.
            const { data: insertedTx, error } = await window.supabaseClient
                .from('transactions')
                .insert({ ...transactionPayload, transaction_date: new Date().toISOString() })
                .select()
                .single(); // Assuming you want the inserted row back

            if (error) {
                console.error("Error sending inbound transaction to Supabase:", error);
                throw error; // Or handle more gracefully
            }
            console.log("Inbound transaction sent to Supabase:", insertedTx.id);
            return { transactionId: insertedTx.id, status: "success" };
        } else {
            // Offline handling
            const localTxData = {
                ...transactionPayload,
                id: `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`,
                transaction_date: new Date().toISOString(),
                pending_sync: true
            };
            // Map back to JS field names for IndexedDB if necessary
            // localTxData already has product_code (from Supabase mapping)
            const idbPayload = { ...localTxData, product_code: localTxData.product_code, transactionDate: localTxData.transaction_date }; // CHANGED key


            let aggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, data.product_code); // CHANGED data.product_code
            if (!aggItem) {
                // INVENTORY store keyPath is 'product_code'
                aggItem = { product_code: data.product_code, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() }; // CHANGED
            }
            aggItem.totalQuantity = (aggItem.totalQuantity || 0) + quantity;
            aggItem.quantitiesByWarehouseId[data.warehouseId] = (aggItem.quantitiesByWarehouseId[data.warehouseId] || 0) + quantity;
            aggItem.lastUpdated = new Date().toISOString();
            aggItem.pendingSync = true;
            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, aggItem);

            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'transactions', // Supabase table name
                operation: 'inbound', // Or 'insert'
                payload: idbPayload, // Data to be synced
                timestamp: new Date().toISOString()
            });
            console.log("Inbound transaction queued offline. Optimistic update to IDB inventory cache done.", idbPayload.id);
            return { transactionId: idbPayload.id, status: "queued_offline" };
        }
    },

    async outboundStock(data) {
        await ensureDbManager();
        const quantity = Number(data.quantity);
        const transactionPayload = {
            type: "outbound",
            product_id: data.productId, // Assuming distinct identifier
            product_code: data.product_code, // CHANGED - data now provides product_code
            product_name: data.productName,
            warehouse_id: data.warehouseId,
            batch_no: data.batchNo || null,
            quantity: quantity,
            operator_id: data.operatorId,
            description: data.description || `Stock out from ${data.warehouseId}.`
        };

        if (navigator.onLine && window.supabaseClient) {
            const { data: insertedTx, error } = await window.supabaseClient
                .from('transactions')
                .insert({ ...transactionPayload, transaction_date: new Date().toISOString() })
                .select()
                .single();

            if (error) {
                console.error("Error sending outbound transaction to Supabase:", error);
                throw error;
            }
            console.log("Outbound transaction sent to Supabase:", insertedTx.id);
            return { transactionId: insertedTx.id, status: "success" };
        } else {
            // Offline handling
            const localTxData = {
                ...transactionPayload,
                id: `local_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`,
                transaction_date: new Date().toISOString(),
                pending_sync: true
            };
            // localTxData already has product_code
            const idbPayload = { ...localTxData, product_code: localTxData.product_code, transactionDate: localTxData.transaction_date }; // CHANGED key


            let aggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, data.product_code); // CHANGED data.product_code
            if (!aggItem) {
                console.warn(`Outbound offline: Aggregated item for ${data.product_code} not found in IDB.`); // CHANGED
                // INVENTORY store keyPath is 'product_code'
                aggItem = { product_code: data.product_code, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() }; // CHANGED
            }
            const currentWarehouseQty = aggItem.quantitiesByWarehouseId[data.warehouseId] || 0;
            if (currentWarehouseQty < quantity) {
                console.warn(`Offline outbound for ${data.product_code} in ${data.warehouseId}: Requested ${quantity}, available in cache ${currentWarehouseQty}. Stock may go negative.`); // CHANGED
            }
            aggItem.totalQuantity = (aggItem.totalQuantity || 0) - quantity;
            aggItem.quantitiesByWarehouseId[data.warehouseId] = currentWarehouseQty - quantity;
            aggItem.lastUpdated = new Date().toISOString();
            aggItem.pendingSync = true;
            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, aggItem);

            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'transactions',
                operation: 'outbound', // Or 'insert'
                payload: idbPayload,
                timestamp: new Date().toISOString()
            });
            console.log("Outbound transaction queued offline. Optimistic update to IDB inventory cache done.", idbPayload.id);
            return { transactionId: idbPayload.id, status: "queued_offline" };
        }
    },

    async outboundStockByInventoryId(data) {
        // This function used Firestore transactions. Supabase supports transactions via functions or RPC.
        // For client-side, direct table manipulation in a transaction is not as straightforward as Firestore.
        // Option 1: Create a Supabase Edge Function (RPC) to handle this atomically.
        // Option 2: Perform operations sequentially and accept potential (though less likely for this specific op) inconsistencies if one fails.
        // For now, implementing with sequential operations and highlighting the need for an RPC for atomicity.

        if (typeof window.clearAllPageMessages === 'function') {
            window.clearAllPageMessages();
        }
        if (!navigator.onLine) {
            if (typeof window.displayPageMessage === 'function') {
                window.displayPageMessage("This specific outbound operation is currently not supported offline.", 'error');
            } else {
                alert("This specific outbound operation is currently not supported offline.");
            }
            throw new Error("Operation not supported offline.");
        }
        if (!window.supabaseClient) throw new Error("Supabase client is not available.");

        console.warn("outboundStockByInventoryId: For true atomicity, this should be a Supabase Edge Function/RPC call.");

        try {
            // 1. Fetch the inventory item
            const { data: inventoryItem, error: fetchError } = await window.supabaseClient
                .from('inventory')
                .select('*')
                .eq('id', data.inventoryId)
                .single();

            if (fetchError || !inventoryItem) {
                throw new Error(`Inventory item with ID ${data.inventoryId} not found or fetch error.`);
            }

            const currentQuantity = inventoryItem.quantity;
            const quantityToDecrement = Number(data.quantityToDecrement);
            if (isNaN(quantityToDecrement) || quantityToDecrement < 0) throw new Error("Quantity to decrement must be a non-negative number.");
            if (currentQuantity < quantityToDecrement) throw new Error(`Insufficient stock for ${data.inventoryId}. Available: ${currentQuantity}, Requested: ${quantityToDecrement}.`);

            let palletsToDecrementNum = 0;
            let newPalletCount = (inventoryItem._3pl_details && inventoryItem._3pl_details.pallet !== undefined) ? Number(inventoryItem._3pl_details.pallet) : 0;

            if (inventoryItem.warehouse_id === 'jordon') { // Assuming warehouse_id for Supabase
                const currentPallets = newPalletCount;
                palletsToDecrementNum = (data.palletsToDecrement !== undefined && !isNaN(Number(data.palletsToDecrement))) ? Number(data.palletsToDecrement) : 0;
                if (palletsToDecrementNum < 0) throw new Error(`Invalid pallet quantity to decrement.`);
                if (palletsToDecrementNum > currentPallets) throw new Error(`Insufficient pallet stock. Available: ${currentPallets}, Requested: ${palletsToDecrementNum}.`);
                newPalletCount = currentPallets - palletsToDecrementNum;
            }

            // 2. Create the transaction log
            const logPayload = {
                type: "outbound",
                inventory_id: data.inventoryId, // Schema name
                product_id: data.productId || inventoryItem.product_id, // Assuming productId is distinct
                product_code: inventoryItem.product_code || data.product_code, // CHANGED data.productCode to data.product_code
                product_name: inventoryItem.product_name || data.productName, // Assuming product_name is in inventory table
                warehouse_id: inventoryItem.warehouse_id,
                batch_no: inventoryItem.batch_no || null, // Assuming batch_no from inventory table
                quantity: quantityToDecrement,
                operator_id: data.operatorId,
                transaction_date: new Date().toISOString(),
                description: data.description || `Stock out for transfer. Inventory ID: ${data.inventoryId}`,
                pallets_decremented: inventoryItem.warehouse_id === 'jordon' ? palletsToDecrementNum : null
            };

            const { data: newTransaction, error: txError } = await window.supabaseClient
                .from('transactions')
                .insert(logPayload)
                .select()
                .single();

            if (txError) throw txError;

            // 3. Update the inventory item
            const newQuantity = currentQuantity - quantityToDecrement;
            const updatePayload = {
                quantity: newQuantity,
                last_updated: new Date().toISOString()
            };
            if (inventoryItem.warehouse_id === 'jordon') {
                // Ensure _3pl_details is updated correctly. Fetch existing or initialize.
                const current3plDetails = inventoryItem._3pl_details || {};
                updatePayload._3pl_details = { ...current3plDetails, pallet: newPalletCount };
                if (newQuantity === 0 && newPalletCount !== 0) updatePayload._3pl_details.pallet = 0;
            }

            const { error: updateError } = await window.supabaseClient
                .from('inventory')
                .update(updatePayload)
                .eq('id', data.inventoryId);

            if (updateError) {
                // TODO: Consider how to handle rollback or compensation if this fails after transaction log succeeded.
                // This is where an RPC is superior.
                console.error("Failed to update inventory after logging transaction. Data might be inconsistent.", updateError);
                throw updateError;
            }

            return { transactionId: newTransaction.id, status: "success", inventoryId: data.inventoryId };

        } catch (error) {
            console.error("Error in outboundStockByInventoryId (Supabase):", error);
            throw error;
        }
    },

    listenToTransactionChanges(callback) {
        if (transactionListenerUnsubscribe && typeof transactionListenerUnsubscribe.unsubscribe === 'function') {
            console.log("Detaching existing Supabase transaction subscription.");
            transactionListenerUnsubscribe.unsubscribe();
            transactionListenerUnsubscribe = null;
        }

        ensureDbManager().then(() => {
            if (!window.supabaseClient) {
                console.error("Supabase client not available for transaction listener.");
                if (typeof callback === 'function') callback({ error: "Supabase client not available." });
                return;
            }

            transactionListenerUnsubscribe = window.supabaseClient
                .channel('public:transactions')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, async (payload) => {
                    console.log('Supabase transactions change received:', payload);
                    await ensureDbManager();
                    let itemsToUpdate = [];
                    let itemIdsToDelete = [];
                    let changedCount = 0;

                    const { eventType, new: newRecord, old: oldRecord, table } = payload;
                    const recordToProcess = eventType === 'DELETE' ? oldRecord : newRecord;

                    if (!recordToProcess) {
                        console.warn("Transaction listener: No record data in payload for table", table, payload);
                        return;
                    }

                    // Map Supabase columns to what IndexedDB expects (e.g., id, productCode, transactionDate)
                    // The 'id' from Supabase is the primary key.
                    // 'transaction_date' from Supabase is already an ISO string.
                    // 'product_code' from Supabase.
                    const txData = {
                        ...recordToProcess,
                        id: recordToProcess.id, // ensure 'id' is used consistently
                        product_code: recordToProcess.product_code, // CHANGED key
                        transactionDate: recordToProcess.transaction_date
                    };


                    // Excel import specific logic might need review if operatorId handling is still complex with Supabase
                    // For now, assuming transaction_date from Supabase is always valid.

                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, txData.id);
                        if (!existingItem ||
                            existingItem.transactionDate !== txData.transactionDate || // Direct comparison of ISO strings
                            !areObjectsShallowEqual(existingItem, txData, ['transactionDate', 'updated_at'])) { // Supabase has updated_at
                            itemsToUpdate.push(txData);
                        }
                        changedCount++;
                    } else if (eventType === 'DELETE') {
                        itemIdsToDelete.push(txData.id); // Use the id of the deleted record
                        changedCount++;
                    }


                    if (itemsToUpdate.length > 0) {
                        await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, itemsToUpdate);
                        console.log(`Transaction listener: Updated/added ${itemsToUpdate.length} items in IndexedDB from Supabase.`);
                    }
                    if (itemIdsToDelete.length > 0) {
                        // Assuming deleteItems can take an array of keys
                        await window.indexedDBManager.deleteItems(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, itemIdsToDelete);
                        console.log(`Transaction listener: Deleted ${itemIdsToDelete.length} items from IndexedDB based on Supabase delete.`);
                    }

                    if (changedCount > 0 && typeof callback === 'function') {
                        callback({ type: 'transactions_updated', count: changedCount });
                    }
                })
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to Supabase transactions changes.');
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
                        console.error('Supabase transactions subscription error:', status, err);
                        if (typeof callback === 'function') callback({ error: `Supabase subscription failed: ${status}` });
                    }
                });
            console.log("Real-time listener (Supabase subscription) attached for transactions.");
        }).catch(error => {
            console.error("Failed to init DB for transaction listener (Supabase):", error);
            if (typeof callback === 'function') callback({ error: "IndexedDB init failed for transaction listener." });
        });

        return () => {
            if (transactionListenerUnsubscribe && typeof transactionListenerUnsubscribe.unsubscribe === 'function') {
                transactionListenerUnsubscribe.unsubscribe();
                transactionListenerUnsubscribe = null;
                console.log("Transaction listener (Supabase subscription) detached by returned function.");
            }
        };
    },

    detachTransactionListener() {
        if (transactionListenerUnsubscribe && typeof transactionListenerUnsubscribe.unsubscribe === 'function') {
            transactionListenerUnsubscribe.unsubscribe();
            transactionListenerUnsubscribe = null;
            console.log("Real-time listener for transactions (Supabase subscription) detached.");
        }
    },

    async performInternalTransfer(transferData) {
        console.log("[performInternalTransfer] Initiated with data (Supabase):", JSON.parse(JSON.stringify(transferData)));
        await ensureDbManager();
        const {
            productId, product_code, productName, // CHANGED productCode to product_code
            sourceWarehouseId, destinationWarehouseId,
            quantity, operatorId, batchNo, // This is product's batchNo
            sourceBatchDocId // This is the ID of the inventory item (row) in 'inventory' table
        } = transferData;

        if (!product_code || !sourceWarehouseId || !destinationWarehouseId || !quantity || isNaN(Number(quantity))) { // CHANGED
            console.error("[performInternalTransfer] Invalid transferData (Supabase):", JSON.parse(JSON.stringify(transferData)));
            throw new Error("Invalid data for internal transfer. Missing required fields or invalid quantity.");
        }

        const numericQuantity = Number(quantity);
        const operationReferenceBatchNo = `TRANSFER-${sourceWarehouseId}-TO-${destinationWarehouseId}`;

        // Map to Supabase column names
        const commonTxPayload = {
            product_id: productId || null, // Assuming productId is distinct
            product_code: product_code, // CHANGED
            product_name: productName,
            quantity: numericQuantity,
            operator_id: operatorId,
            product_batch_no: batchNo, // Actual product batch number
            batch_no: operationReferenceBatchNo, // Transfer operation reference
        };

        const outboundTxPayload = {
            ...commonTxPayload,
            type: "outbound",
            warehouse_id: sourceWarehouseId,
            description: `Internal transfer to warehouse ${destinationWarehouseId}`
        };
        const inboundTxPayload = {
            ...commonTxPayload,
            type: "inbound",
            warehouse_id: destinationWarehouseId,
            description: `Internal transfer from warehouse ${sourceWarehouseId}`
        };

        if (navigator.onLine && window.supabaseClient) {
            console.log("[performInternalTransfer] ONLINE mode (Supabase).");
            // This should ideally be an RPC call to a Supabase Edge Function for atomicity.
            // Simulating sequential operations here.
            console.warn("performInternalTransfer (Supabase): For true atomicity, this should be an RPC call.");
            try {
                // 1. Create outbound transaction
                const { data: outTx, error: outError } = await window.supabaseClient
                    .from('transactions')
                    .insert({ ...outboundTxPayload, transaction_date: new Date().toISOString() })
                    .select()
                    .single();
                if (outError) throw outError;
                console.log(`[performInternalTransfer] Staged OUTBOUND tx (ID: ${outTx.id}) to Supabase.`);

                // 2. Create inbound transaction
                const { data: inTx, error: inError } = await window.supabaseClient
                    .from('transactions')
                    .insert({ ...inboundTxPayload, transaction_date: new Date().toISOString() })
                    .select()
                    .single();
                if (inError) throw inError; // TODO: Handle rollback of outTx if this fails
                console.log(`[performInternalTransfer] Staged INBOUND tx (ID: ${inTx.id}) to Supabase.`);

                // 3. Update source inventory batch quantity (if sourceBatchDocId is provided)
                if (sourceBatchDocId) {
                    // Supabase requires explicit call to decrement. Using RPC with `increment` is safer.
                    // Fetch current quantity first, then update. This is not atomic without RPC.
                    const { data: sourceInvItem, error: fetchInvError } = await window.supabaseClient
                        .from('inventory')
                        .select('quantity')
                        .eq('id', sourceBatchDocId)
                        .single();

                    if (fetchInvError) throw fetchInvError;
                    if (!sourceInvItem) throw new Error(`Source inventory item ${sourceBatchDocId} not found.`);

                    const newSourceQuantity = sourceInvItem.quantity - numericQuantity;
                    if (newSourceQuantity < 0) throw new Error(`Insufficient stock in source inventory ${sourceBatchDocId}.`);

                    const { error: updateInvError } = await window.supabaseClient
                        .from('inventory')
                        .update({ quantity: newSourceQuantity, last_updated: new Date().toISOString() })
                        .eq('id', sourceBatchDocId);
                    if (updateInvError) throw updateInvError; // TODO: Handle rollback
                    console.log(`[performInternalTransfer] Updated source batch document (ID: ${sourceBatchDocId}) quantity in Supabase.`);
                } else {
                    console.warn(`[performInternalTransfer] sourceBatchDocId is missing. Cannot update specific source batch quantity.`);
                }

                console.log(`[performInternalTransfer] ONLINE Supabase operations SUCCESS. Outbound Tx ID: ${outTx.id}, Inbound Tx ID: ${inTx.id}.`);
                return { status: "success", outboundTxId: outTx.id, inboundTxId: inTx.id };

            } catch (error) {
                console.error("[performInternalTransfer] CRITICAL ERROR during ONLINE Supabase transfer:", error);
                // Implement manual rollback or notify user of partial failure if applicable
                throw error;
            }
        } else {
            // Offline handling for internal transfer
            console.log("[performInternalTransfer] OFFLINE mode (Supabase).");

            // Optimistically update IndexedDB inventory_aggregated
            // INVENTORY store in IDB is keyed by product_code
            let sourceAggItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.INVENTORY, product_code); // CHANGED
            if (!sourceAggItem) sourceAggItem = { product_code: product_code, totalQuantity: 0, quantitiesByWarehouseId: {}, lastUpdated: new Date().toISOString() }; // CHANGED
            sourceAggItem.quantitiesByWarehouseId[sourceWarehouseId] = (sourceAggItem.quantitiesByWarehouseId[sourceWarehouseId] || 0) - numericQuantity;
            // No change to totalQuantity here as it's an internal movement, just warehouse counts change.
            // However, the destination warehouse also needs an update.
             sourceAggItem.quantitiesByWarehouseId[destinationWarehouseId] = (sourceAggItem.quantitiesByWarehouseId[destinationWarehouseId] || 0) + numericQuantity;
            sourceAggItem.lastUpdated = new Date().toISOString();
            sourceAggItem.pendingSync = true;
            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.INVENTORY, sourceAggItem);
            console.log(`[performInternalTransfer] OFFLINE: Updated IndexedDB INVENTORY for product_code: ${product_code} (both source and dest warehouses).`); // CHANGED


            // Queue outbound transaction
            const localOutboundTx = {
                ...outboundTxPayload, // Uses Supabase field names (which includes product_code)
                id: `local_tx_out_${new Date().getTime()}_${Math.random().toString(36).substr(2, 5)}`,
                transaction_date: new Date().toISOString(),
                pending_sync: true
            };
             // Map back to JS field names for IDB if needed. localOutboundTx already has product_code.
            const idbOutboundPayload = { ...localOutboundTx, product_code: localOutboundTx.product_code, transactionDate: localOutboundTx.transaction_date, warehouseId: localOutboundTx.warehouse_id }; // CHANGED key to product_code

            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'transactions', operation: 'internal_transfer_out', payload: idbOutboundPayload, timestamp: new Date().toISOString()
            });
            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, idbOutboundPayload);


            // Queue inbound transaction
            const localInboundTx = {
                ...inboundTxPayload, // Uses Supabase field names (which includes product_code)
                id: `local_tx_in_${new Date().getTime()}_${Math.random().toString(36).substr(2, 5)}`,
                transaction_date: new Date().toISOString(),
                pending_sync: true
            };
            // localInboundTx already has product_code
            const idbInboundPayload = { ...localInboundTx, product_code: localInboundTx.product_code, transactionDate: localInboundTx.transaction_date, warehouseId: localInboundTx.warehouse_id }; // CHANGED key to product_code

            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'transactions', operation: 'internal_transfer_in', payload: idbInboundPayload, timestamp: new Date().toISOString()
            });
            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.TRANSACTIONS, idbInboundPayload);

            // Note: Offline update for specific 'inventory' batch (sourceBatchDocId) is complex.
            // The current offline logic primarily updates 'inventory_aggregated'.
            // If 'inventory' table also needs offline optimistic updates, that would be an addition here.
            console.warn("[performInternalTransfer] OFFLINE: Specific inventory batch update for sourceBatchDocId not implemented for offline mode yet.");


            console.log("[performInternalTransfer] OFFLINE: Processing complete.");
            return { status: "queued_offline", outboundTxId: localOutboundTx.id, inboundTxId: localInboundTx.id };
        }
    }
};

window.transactionAPI = transactionAPI_module;
console.log("transactionAPI.js executed and window.transactionAPI assigned (Supabase version):", window.transactionAPI && typeof window.transactionAPI.listenToTransactionChanges === 'function');
