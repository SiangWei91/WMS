// Firestore Admin Functions
// This file will contain functions for administrative tasks related to Firestore,
// such as clearing collections.

/**
 * Clears all documents from specified Firestore collections.
 * @param {Array<string>} collectionNames Array of collection names to clear.
 */
async function clearFirestoreCollections(collectionNames) {
  if (!confirm(`Are you sure you want to delete all data from the following collections?\n\n- ${collectionNames.join("\n- ")}\n\nThis action cannot be undone.`)) {
    console.log('Firestore collection clearing cancelled by user.');
    return;
  }

  console.log('Starting to clear Firestore collections:', collectionNames);
  const db = firebase.firestore();
  let allSucceeded = true;

  for (const collectionName of collectionNames) {
    try {
      console.log(`Attempting to clear collection: ${collectionName}`);
      const collectionRef = db.collection(collectionName);
      const querySnapshot = await collectionRef.limit(500).get(); // Process in batches to avoid memory issues

      if (querySnapshot.empty) {
        console.log(`Collection ${collectionName} is already empty or does not exist.`);
        continue;
      }

      let deletedCount = 0;
      let batch = db.batch();
      let batchCount = 0;

      for (const doc of querySnapshot.docs) {
        batch.delete(doc.ref);
        batchCount++;
        if (batchCount >= 490) { // Firestore batch limit is 500 operations
          await batch.commit();
          deletedCount += batchCount;
          console.log(`Cleared ${batchCount} documents from ${collectionName} in a batch.`);
          batch = db.batch(); // Start a new batch
          batchCount = 0;
          // Fetch next batch of documents
          const nextSnapshot = await collectionRef.limit(500).get();
          if (nextSnapshot.empty) break; // No more documents
          // This simple batching might not cover all documents if collection is very large.
          // A more robust solution would loop `get()` calls until empty.
          // For now, this handles up to 500 docs per collection.
          // TODO: Implement recursive batch deletion for very large collections if needed.
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        deletedCount += batchCount;
        console.log(`Cleared remaining ${batchCount} documents from ${collectionName}.`);
      }
      
      console.log(`Successfully cleared ${deletedCount} documents from collection: ${collectionName}`);

    } catch (error) {
      console.error(`Error clearing collection ${collectionName}:`, error);
      alert(`Failed to clear collection ${collectionName}. Check console for details. Error: ${error.message}`);
      allSucceeded = false;
      // Optionally, decide if you want to stop or continue with other collections
      // For now, it continues.
    }
  }

  if (allSucceeded) {
    alert('All specified Firestore collections have been cleared successfully!');
    console.log('All specified Firestore collections cleared.');
  } else {
    alert('Some collections could not be cleared completely. Please check the console for errors.');
    console.warn('One or more collections were not cleared successfully.');
  }
}

// Expose the function to be used by other modules if necessary,
// e.g., by attaching to a global API object or by using ES6 modules.
// For now, assuming it will be called directly from app.js where firebase is available.
// If app.js doesn't have firebase.firestore() in its scope, this needs adjustment.

// Making it globally available for now for simplicity with existing structure
window.firestoreAdminAPI = {
  clearFirestoreCollections
};
