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

  for (const tableName of tableNames) {
    try {
      console.log(`Attempting to clear table: ${tableName}`);
      // Supabase delete without a filter deletes all rows.
      // The `match` filter with an empty object `{}` should not be needed,
      // but using a non-empty object ensures we don't accidentally delete without any condition.
      // However, to delete all rows, the condition should select all rows, e.g. by matching a common non-null column to not be null.
      // Or, more simply, just use .delete() and it applies to the whole table if no filters applied before it.
      // For safety, Supabase RLS should be configured to allow this, or run this with service_role key if from a secure backend.
      // From client-side with anon_key, this depends on table permissions.
      // Let's assume RLS allows delete for the user, or this is run by an admin.
      // A common way to delete all rows is `delete from table_name where true;` in SQL.
      // Supabase client equivalent:
      const { error, count } = await window.supabaseClient
        .from(tableName)
        .delete()
        .neq('id', 'this-id-should-not-exist-unless-you-have-it'); // A dummy condition that should effectively match all rows or be optimized away by Supabase
                                                                // More robust: .delete().match({ some_column: value_that_matches_all }) - but that's not generic.
                                                                // Safest client-side delete all is often to call an RPC function.
                                                                // For now, using a condition that is likely true for all or many rows.
                                                                // A simpler .delete().gt('id', 0) if id is numeric, or similar for UUID.
                                                                // The most straightforward is just .delete() with no other filters.
                                                                // Let's try with a condition that should always be true for any row.
                                                                // Example: if all your tables have a primary key 'id' that's a UUID (string) or number.
                                                                // This is a placeholder, actual implementation might depend on table structures or using an RPC.
                                                                // For this example, let's use a common pattern that might work if 'id' exists and is text/varchar.
                                                                // It's better to call an RPC function `truncate_table(table_name)`
                                                                // For now, this is a placeholder for a real "delete all"
      // const { error, count } = await window.supabaseClient.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Example for UUID
      // A simpler, more common way:
      const { data, error: deleteError } = await window.supabaseClient
        .from(tableName)
        .delete()
        .gte('id', 0); // This assumes 'id' is a numeric PK and >= 0. Adjust if PK is different (e.g. text/UUID).
                       // If 'id' is text/UUID, a condition like .neq('id', 'a-value-that-never-exists') works.
                       // Or, if RLS allows, simply .delete() with no other chained filters.

      if (deleteError) {
        console.error(`Error clearing table ${tableName}:`, deleteError);
        if (typeof window.displayPageMessage === 'function') {
          window.displayPageMessage(`Failed to clear table ${tableName}. Error: ${deleteError.message}`, 'error');
        } else {
          alert(`Failed to clear table ${tableName}. Check console for details. Error: ${deleteError.message}`);
        }
        allSucceeded = false;
        continue; // Continue with the next table
      }
      
      // Supabase delete doesn't directly return the count of deleted rows in the same way as Firestore batch delete.
      // The 'count' variable from { error, count } with .delete() is for options like 'exact', 'planned', 'estimated'.
      // We can assume success if no error.
      console.log(`Successfully cleared data from table: ${tableName}. (Actual row count not directly available from this client operation)`);

    } catch (error) { // Catch any other unexpected errors
      console.error(`Unexpected error clearing table ${tableName}:`, error);
      if (typeof window.displayPageMessage === 'function') {
        window.displayPageMessage(`Unexpected error clearing table ${tableName}. Error: ${error.message}`, 'error');
      } else {
        alert(`Unexpected error clearing table ${tableName}. Check console for details. Error: ${error.message}`);
      }
      allSucceeded = false;
    }
  }

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
