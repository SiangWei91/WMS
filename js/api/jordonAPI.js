// Depends on: (none explicitly from helpers.js or listeners.js in current form)
import { incrementReadCount } from '../firebaseReadCounter.js';

const jordonAPI_module = { // Renamed for clarity
    async addJordonStockItems(itemsArray) {
        if (!window.db) throw new Error("Firestore 'db' instance is not available.");
        if (!itemsArray || itemsArray.length === 0) throw new Error("No items provided.");
        const batch = window.db.batch();
        const itemsCollectionRef = window.db.collection("jordonInventoryItems");
        itemsArray.forEach(item => {
            const newItemRef = itemsCollectionRef.doc();
            batch.set(newItemRef, { 
                ...item, 
                totalCartons: Number(item.totalCartons) || 0, 
                physicalPallets: Number(item.physicalPallets) || 0, 
                stockInTimestamp: firebase.firestore.FieldValue.serverTimestamp() 
            });
        });
        try {
            await batch.commit();
            return { success: true, count: itemsArray.length };
        } catch (error) {
            console.error("Error adding Jordon stock items in batch: ", error);
            throw error;
        }
    },

    async getJordonInventoryItems(params = {}) {
        if (!window.db) throw new Error("Firestore 'db' instance is not available.");
        
        const { limit = 100, startAfterDocSnapshot = null } = params;

        const itemsCollectionRef = window.db.collection("jordonInventoryItems");
        let query = itemsCollectionRef.orderBy("stockInTimestamp", "desc").orderBy("lotNumber", "asc");

        if (startAfterDocSnapshot) {
            query = query.startAfter(startAfterDocSnapshot);
        }
        query = query.limit(limit);

        try {
            const querySnapshot = await query.get();
            incrementReadCount(querySnapshot.docs.length || 1); // Count reads for the main query
            const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const lastVisibleDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;
            
            let totalItems = 0;
            try {
                // Firestore does not have a cheap way to get total count of a collection without reading documents
                // or maintaining a counter. For simplicity, we'll try to get the count, but this can be slow/costly.
                // A more scalable approach is often to maintain counters via cloud functions.
                // If this collection is expected to be very large, this count method should be reconsidered.
                const countSnapshot = await window.db.collection("jordonInventoryItems").get(); 
                incrementReadCount(countSnapshot.docs.length || 1); // Count reads for the count query
                totalItems = countSnapshot.size;
            } catch (countError) {
                console.warn("Could not fetch total count for Jordon inventory items:", countError);
                // If count fails, pagination can still work but totalPages might be unknown or less accurate.
            }

            return {
                data: items,
                lastVisibleDoc: lastVisibleDoc, 
                hasNextPage: items.length === limit, 
                totalItems: totalItems 
            };
        } catch (error) {
            console.error("Error fetching Jordon stock items: ", error);
            throw error; 
        }
    }
};

window.jordonAPI = jordonAPI_module;
