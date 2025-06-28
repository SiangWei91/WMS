// Depends on: (none explicitly from helpers.js or listeners.js in current form)
import { incrementReadCount } from '../firebaseReadCounter.js';

const dashboardAPI_module = { // Renamed for clarity
    async getStats() {
        if (!window.db) {
            console.error("Firestore 'db' instance is not available for dashboard stats.");
            // Return default/error state that UI can handle
            return { totalProducts: 'N/A', totalInventory: 'N/A', todayTransactions: 'N/A', error: "Firestore not available" };
        }
        let totalProducts = 0, totalInventory = 0, todayTransactions = 0;
        try {
            const productStatsDoc = await window.db.doc('system_stats/productStats').get();
            incrementReadCount(1); // Count this read
            if (productStatsDoc.exists) {
                totalProducts = productStatsDoc.data().count || 0;
            } else {
                console.warn("Product stats document not found (system_stats/productStats).");
            }
        } catch (e) { 
            console.error("Error fetching product stats:", e);
            totalProducts = 'Error'; // Indicate error for this specific stat
        }
        try {
            const inventoryStatsDoc = await window.db.doc('system_stats/inventoryStats').get();
            incrementReadCount(1); // Count this read
            if (inventoryStatsDoc.exists) {
                totalInventory = inventoryStatsDoc.data().totalQuantity || 0;
            } else {
                console.warn("Inventory stats document not found (system_stats/inventoryStats).");
            }
        } catch (e) { 
            console.error("Error fetching inventory stats:", e);
            totalInventory = 'Error'; // Indicate error
        }
        try {
            const todayStart = new Date(); 
            todayStart.setHours(0,0,0,0);
            const todayEnd = new Date(); 
            todayEnd.setHours(23,59,59,999);
            
            const transSnap = await window.db.collection('transactions')
                                      .where('transactionDate','>=',todayStart)
                                      .where('transactionDate','<=',todayEnd)
                                      .get();
            incrementReadCount(transSnap.docs.length || 1); // Count reads
            todayTransactions = transSnap.size;
        } catch (e) { 
            console.error("Error fetching today's transactions:", e);
            todayTransactions = 'Error'; // Indicate error
        }
        return { totalProducts, totalInventory, todayTransactions };
    }
};

window.dashboardAPI = dashboardAPI_module;
