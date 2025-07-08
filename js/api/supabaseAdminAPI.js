// Supabase Admin Functions
// This file will contain functions for administrative tasks related to Supabase,
// such as clearing tables.

/**
 * Clears all rows from specified Supabase tables.
 * @param {Array<string>} tableNames Array of table names to clear.
 */
async function clearSupabaseTables(tableNames) {
  if (typeof window.clearAllPageMessages === 'function') {
    window.clearAllPageMessages();
  }

  if (!window.supabaseClient) {
    const errorMsg = "Supabase client is not available. Cannot clear tables.";
    console.error(errorMsg);
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage(errorMsg, 'error');
    } else {
      alert(errorMsg);
    }
    return;
  }

  if (!confirm(`Are you sure you want to delete all data from the following Supabase tables?\n\n- ${tableNames.join("\n- ")}\n\nThis action CANNOT BE UNDONE and will permanently delete all rows.`)) {
    console.log('Supabase table clearing cancelled by user.');
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage('Supabase table clearing cancelled by user.', 'info', 3000);
    } else {
      alert('Supabase table clearing cancelled by user.');
    }
    return;
  }

  console.log('Starting to clear Supabase tables:', tableNames);
  let allSucceeded = true;
  const NIL_UUID = '00000000-0000-0000-0000-000000000000';

  for (const tableName of tableNames) {
    try {
      console.log(`[SupabaseAdmin] Attempting to clear table: ${tableName}`);
      let response = { error: null, data: null, count: null }; // Ensure response is initialized for logging clarity

      if (tableName === 'jordonWithdrawForms') {
        console.log(`[SupabaseAdmin] Processing ${tableName} (strategy: jordonWithdrawForms)`);
        response = await window.supabaseClient
          .from(tableName)
          .delete()
          .neq('id', NIL_UUID); 

        if (response.error) {
          if (response.error.code === '42P01' || (response.error.message && response.error.message.includes('relation "public.jordonWithdrawForms" does not exist'))) {
            console.warn(`[SupabaseAdmin] Table ${tableName} does not exist, skipping. Error details:`, response.error);
            continue; 
          } else {
            console.error(`[SupabaseAdmin] Error for ${tableName} before throwing:`, response.error);
            throw response.error; 
          }
        }
        console.log(`[SupabaseAdmin] Deletion response for ${tableName}:`, response);
      } else if (tableName === 'inventory_aggregated') {
        console.log(`[SupabaseAdmin] Processing ${tableName} (strategy: inventory_aggregated)`);
        response = await window.supabaseClient
          .from(tableName)
          .delete()
          .not('product_Code', 'is', null); 

        if (response.error) {
          console.error(`[SupabaseAdmin] Error for ${tableName} before throwing:`, response.error);
          throw response.error;
        }
        console.log(`[SupabaseAdmin] Deletion response for ${tableName}:`, response);
      } else if (tableName === 'inventory') { 
        console.log(`[SupabaseAdmin] Processing ${tableName} (strategy: inventory)`);
        // Assuming 'inventory' table also might be better cleared by a non-id field.
        // Using .not('product_code', 'is', null) as a tentative strategy.
        // This assumes 'inventory' has 'product_code'. If not, this will fail and logs should show it.
        response = await window.supabaseClient
          .from(tableName)
          .delete()
          .not('product_code', 'is', null); // Tentative: assuming product_code exists and is not null for all rows.

        if (response.error) {
          console.error(`[SupabaseAdmin] Error for ${tableName} before throwing:`, response.error);
          throw response.error;
        }
        console.log(`[SupabaseAdmin] Deletion response for ${tableName}:`, response);
      } else if (tableName === 'transactions') {
        console.log(`[SupabaseAdmin] Processing ${tableName} (strategy: transactions)`);
        response = await window.supabaseClient
          .from(tableName)
          .delete()
          .neq('id', NIL_UUID);

        if (response.error) {
          console.error(`[SupabaseAdmin] Error for ${tableName} before throwing:`, response.error);
          throw response.error;
        }
        console.log(`[SupabaseAdmin] Deletion response for ${tableName}:`, response);
      } else {
        console.log(`[SupabaseAdmin] Processing ${tableName} (strategy: default)`);
        response = await window.supabaseClient
          .from(tableName)
          .delete()
          .neq('id', NIL_UUID);

        if (response.error) {
          console.error(`[SupabaseAdmin] Error for ${tableName} before throwing:`, response.error);
          throw response.error;
        }
        console.log(`[SupabaseAdmin] Deletion response for ${tableName}:`, response);
      }

      // Log success if no error was thrown by the Supabase client for the current table operation
      // The 'response.error' here is the direct result from the Supabase call.
      if (!response.error) {
        console.log(`[SupabaseAdmin] Successfully cleared/processed table: ${tableName}.`);
      } else {
        // This case should ideally be caught by "throw response.error" and handled in the catch block.
        // However, adding a log here for completeness if an error exists but wasn't thrown.
        console.warn(`[SupabaseAdmin] Table ${tableName} processed, but Supabase response contained an error:`, response.error);
      }

    } catch (error) { // Catch any errors thrown from the try block
      console.error(`[SupabaseAdmin] Error caught for table ${tableName} in main catch block:`, error);
      if (typeof window.displayPageMessage === 'function') {
        window.displayPageMessage(`Failed to process table ${tableName}. Error: ${error.message || JSON.stringify(error)}`, 'error');
      } else {
        alert(`Failed to process table ${tableName}. Check console for details. Error: ${error.message || JSON.stringify(error)}`);
      }
      allSucceeded = false;
    }
  }

  // The following block was identified as erroneous and is removed.
  // if (allSucceeded) {
  //     if (typeof window.displayPageMessage === 'function') {
  //       window.displayPageMessage(`Unexpected error clearing table ${tableName}. Error: ${error.message}`, 'error');
  //     } else {
  //       alert(`Unexpected error clearing table ${tableName}. Check console for details. Error: ${error.message}`);
  //     }
  //     allSucceeded = false;
  //   }
  // }

  if (allSucceeded) {
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage('All specified Supabase tables have been cleared successfully!', 'success', 5000);
    } else {
      alert('All specified Supabase tables have been cleared successfully!');
    }
    console.log('All specified Supabase tables cleared attempt completed.');
  } else {
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage('Some Supabase tables could not be cleared completely or an error occurred. Please check the console.', 'warning');
    } else {
      alert('Some Supabase tables could not be cleared completely or an error occurred. Please check the console.');
    }
    console.warn('One or more Supabase tables were not cleared successfully or an error occurred during the process.');
  }
}

// Expose the function globally
window.supabaseAdminAPI = {
  clearSupabaseTables
};

console.log('supabaseAdminAPI.js loaded and window.supabaseAdminAPI assigned.');
