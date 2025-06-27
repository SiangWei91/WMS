// Depends on: helpers.js (ensureDbManager, areObjectsShallowEqual)
// Depends on: listeners.js (shipmentListenerUnsubscribe)

const shipmentAPI_module = { // Renamed for clarity
    async getShipments(params = {}) {
        await ensureDbManager();
        const { status, startDate, endDate, limit = 20, currentPage = 1 } = params; 
        try {
            const db = await window.indexedDBManager.initDB();
            const shipmentStoreName = window.indexedDBManager.STORE_NAMES.SHIPMENTS;

            if (!db.objectStoreNames.contains(shipmentStoreName)) {
                console.log("Shipments store not found, fetching from Firestore...");
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
                    return { id: doc.id, ...shipmentData };
                });
                if (firestoreShipments.length > 0) {
                   await window.indexedDBManager.bulkPutItems(shipmentStoreName, firestoreShipments);
                }
            }

            const tx = db.transaction(shipmentStoreName, 'readonly');
            const store = tx.objectStore(shipmentStoreName);
            const index = store.index('shipmentDate'); 
            
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
                        if (status && item.status !== status) match = false;
                        
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
                        if (status && item.status !== status) match = false;

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
                    hasNextPage: hasMoreDataForNextPage
                }
            };
        } catch (error) {
            console.error("Error in shipmentAPI.getShipments (IndexedDB):", error);
            return { data: [], pagination: { currentPage: currentPage, itemsPerPage: limit, totalItems: 0, totalPages: 0, hasNextPage: false } };
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
        const existingShipmentFromIDB = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentId);

        if (existingShipmentFromIDB && existingShipmentFromIDB.createdAt && !updatedShipmentForIDB.createdAt) {
            updatedShipmentForIDB.createdAt = existingShipmentFromIDB.createdAt;
        }

        const keysToIgnore = ['updatedAt', 'pendingSync', 'createdAt', 'shipmentDate'];
        if (existingShipmentFromIDB && areObjectsShallowEqual(existingShipmentFromIDB, updatedShipmentForIDB, keysToIgnore)) {
            if (!existingShipmentFromIDB.shipmentDate || !updatedShipmentForIDB.shipmentDate || existingShipmentFromIDB.shipmentDate === updatedShipmentForIDB.shipmentDate) {
                console.log("Shipment update skipped for IDB, no significant data change:", shipmentId);
                if (navigator.onLine && window.db) {
                    const firestorePayload = { ...shipmentData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                    delete firestorePayload.id; 
                    await window.db.collection('shipments').doc(shipmentId).update(firestorePayload);
                    console.log("Shipment updated in Firestore (no change for IDB):", updatedShipmentForIDB);
                }
                return { ...existingShipmentFromIDB, ...updatedShipmentForIDB };
            }
        }
        
        updatedShipmentForIDB.pendingSync = !navigator.onLine;

        if (navigator.onLine && window.db) {
            const firestorePayload = { ...shipmentData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            delete firestorePayload.id; 
            await window.db.collection('shipments').doc(shipmentId).update(firestorePayload);
            updatedShipmentForIDB.pendingSync = false;
            await window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, updatedShipmentForIDB);
            console.log("Shipment updated in Firestore and IndexedDB (online):", updatedShipmentForIDB);
            return updatedShipmentForIDB;
        } else {
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
    async deleteShipment(shipmentId) { 
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
                .orderBy('createdAt', 'desc') 
                .onSnapshot(async (querySnapshot) => {
                    await ensureDbManager(); 
                    const changes = querySnapshot.docChanges();
                    let itemsToUpdate = [];
                    let itemIdsToDelete = [];
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
                        if (change.type === "added" || change.type === "modified") {
                            const existingItem = await window.indexedDBManager.getItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, shipmentData.id);
                            if (!existingItem || !areObjectsShallowEqual(existingItem, shipmentData, ['updatedAt', 'createdAt'])) {
                                itemsToUpdate.push(shipmentData);
                            }
                            changedCount++;
                        }
                        if (change.type === "removed") {
                            itemIdsToDelete.push(shipmentData.id);
                            changedCount++;
                        }
                    }

                    if (itemsToUpdate.length > 0) {
                        await window.indexedDBManager.bulkPutItems(window.indexedDBManager.STORE_NAMES.SHIPMENTS, itemsToUpdate);
                        console.log(`Shipment listener: Bulk updated/added ${itemsToUpdate.length} items in IndexedDB.`);
                    }
                    for (const idToDelete of itemIdsToDelete) {
                        await window.indexedDBManager.deleteItem(window.indexedDBManager.STORE_NAMES.SHIPMENTS, idToDelete);
                    }
                    if(itemIdsToDelete.length > 0){
                        console.log(`Shipment listener: Deleted ${itemIdsToDelete.length} items from IndexedDB.`);
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

window.shipmentAPI = shipmentAPI_module;
