// import { incrementReadCount } from '../firebaseReadCounter.js'; // Firebase specific, remove or replace if needed

const jordonAPI_module = {
    async addJordonStockItems(itemsArray) {
        if (!window.supabaseClient) throw new Error("Supabase client is not available.");
        if (!itemsArray || itemsArray.length === 0) throw new Error("No items provided to add.");

        // Assuming items in itemsArray are objects that map directly to columns in the 'inventory' table
        // or need minimal transformation.
        // Supabase insert takes an array of objects.
        // We need to map fields like 'totalCartons' to 'quantity' (example) and handle timestamps.
        // For Supabase, timestamps can be ISO strings. `new Date().toISOString()`
        
        const itemsToInsert = itemsArray.map(item => ({
            // Assuming your 'inventory' table has these columns:
            // product_code, batch_no, quantity, physical_pallets, _3pl_details, warehouse_id, etc.
            // This mapping is an example and needs to match your actual table structure.
            product_code: item.productCode,
            batch_no: item.batchNo,
            quantity: Number(item.totalCartons) || 0,
            physical_pallets: Number(item.physicalPallets) || 0, // Example column name
            _3pl_details: item._3plDetails || {}, // CORRECTED COLUMN NAME, maps from JS _3plDetails
            warehouse_id: 'jordon', // Defaulting to 'jordon' or get from item
            // stockInTimestamp: new Date().toISOString(), // Use 'created_at' with default now() or manage manually
            // created_at: new Date().toISOString(), // If you have a created_at managed by client
            // Map other fields from 'item' to your Supabase table columns
            ...item.customFields // If item has other fields to be directly inserted
        }));

        try {
            const { data, error } = await window.supabaseClient
                .from('inventory') // Assuming 'inventory' table for Jordon items as per user
                .insert(itemsToInsert)
                .select(); // Optionally select to get the inserted rows back

            if (error) {
                console.error("Error adding Jordon stock items in batch to Supabase: ", error);
                throw error;
            }
            return { success: true, count: data ? data.length : 0, data: data };
        } catch (error) {
            // Catch any other synchronous errors or rethrown errors
            console.error("Supabase batch insert failed: ", error);
            throw error;
        }
    },

    async getJordonInventoryItems(params = {}) {
        if (!window.supabaseClient) throw new Error("Supabase client is not available.");
        
        const { limit = 100, page = 1 } = params; // Use page for offset calculation
        const offset = (page - 1) * limit;

        // Determine table and ordering based on previous assumptions for jordon.js
        // Ordering by stockInTimestamp (assuming 'created_at' or similar) and lotNumber (from _3plDetails)
        // Supabase ordering on JSONB fields: .order('_3plDetails->>lotNumber')
        // Assuming 'created_at' for stockInTimestamp equivalent.
        
        let query = window.supabaseClient
            .from('inventory') // Assuming 'inventory' table for Jordon items
            .select('*', { count: 'exact' }) // Select all and request total count
            .eq('warehouse_id', 'jordon') // Filter for Jordon items
            .order('created_at', { ascending: false }) // Example: order by creation time
            .order('_3pl_details->>lotNumber', { ascending: true }) // CORRECTED COLUMN NAME
            .range(offset, offset + limit - 1); // For pagination

        try {
            const { data: items, error, count } = await query;

            if (error) {
                console.error("Error fetching Jordon stock items from Supabase: ", error);
                throw error;
            }
            
            // Map Supabase snake_case to camelCase if rest of app expects it
            const mappedItems = items.map(item => ({
                id: item.id,
                productCode: item.product_code,
                batchNo: item.batch_no,
                quantity: item.quantity,
                physicalPallets: item.physical_pallets,
                _3plDetails: item._3pl_details, // CORRECTED COLUMN NAME, mapped to JS _3plDetails
                warehouseId: item.warehouse_id,
                stockInTimestamp: item.created_at, // or relevant timestamp field
                // ... other fields
            }));

            return {
                data: mappedItems,
                totalItems: count,
                currentPage: page,
                pageSize: limit,
                hasNextPage: (offset + mappedItems.length) < count,
                // lastVisibleDoc is a Firestore concept, not directly applicable.
                // For keyset pagination with Supabase, you'd pass the last item's value of the ordered field.
            };
        } catch (error) {
            console.error("Error processing Jordon stock items fetch from Supabase: ", error);
            throw error; 
        }
    }
};

window.jordonAPI = jordonAPI_module;
