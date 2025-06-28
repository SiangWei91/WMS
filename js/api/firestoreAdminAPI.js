// Firestore Admin Functions
// This file will contain functions for administrative tasks related to Firestore,
// such as clearing collections.
import { incrementReadCount } from '../firebaseReadCounter.js';

/**
 * Clears all documents from specified Firestore collections.
 * @param {Array<string>} collectionNames Array of collection names to clear.
 */
async function clearFirestoreCollections(collectionNames) {
  if (typeof window.clearAllPageMessages === 'function') {
    window.clearAllPageMessages();
  }

  if (!confirm(`Are you sure you want to delete all data from the following collections?\n\n- ${collectionNames.join("\n- ")}\n\nThis action cannot be undone.`)) {
    console.log('Firestore collection clearing cancelled by user.');
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage('Firestore collection clearing cancelled by user.', 'info', 3000);
    } else {
      alert('Firestore collection clearing cancelled by user.');
    }
    return;
  }

  console.log('Starting to clear Firestore collections:', collectionNames);
  const db = firebase.firestore();
  let allSucceeded = true;

  for (const collectionName of collectionNames) {
    try {
      console.log(`Attempting to clear collection: ${collectionName}`);
      const collectionRef = db.collection(collectionName);
      let querySnapshot = await collectionRef.limit(500).get(); // Process in batches to avoid memory issues
      incrementReadCount(querySnapshot.docs.length || 1); // Count initial read

      if (querySnapshot.empty) {
        console.log(`Collection ${collectionName} is already empty or does not exist.`);
        continue;
      }

      let deletedCount = 0;
      
      // Loop as long as there are documents to delete
      while (!querySnapshot.empty) {
        let batch = db.batch();
        let batchCount = 0;

        for (const doc of querySnapshot.docs) {
          batch.delete(doc.ref);
          batchCount++;
        }
        
        await batch.commit();
        deletedCount += batchCount;
        console.log(`Cleared ${batchCount} documents from ${collectionName} in a batch.`);

        if (batchCount < 500) { // If last batch was smaller than limit, no more docs
            break;
        }

        // Fetch next batch of documents
        querySnapshot = await collectionRef.limit(500).get();
        incrementReadCount(querySnapshot.docs.length || 1); // Count this subsequent read
      }
      
      console.log(`Successfully cleared ${deletedCount} documents from collection: ${collectionName}`);

    } catch (error) {
      console.error(`Error clearing collection ${collectionName}:`, error);
      if (typeof window.displayPageMessage === 'function') {
        window.displayPageMessage(`Failed to clear collection ${collectionName}. Error: ${error.message}`, 'error');
      } else {
        alert(`Failed to clear collection ${collectionName}. Check console for details. Error: ${error.message}`);
      }
      allSucceeded = false;
      // Optionally, decide if you want to stop or continue with other collections
      // For now, it continues.
    }
  }

  if (allSucceeded) {
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage('All specified Firestore collections have been cleared successfully!', 'success', 5000);
    } else {
      alert('All specified Firestore collections have been cleared successfully!');
    }
    console.log('All specified Firestore collections cleared.');
  } else {
    if (typeof window.displayPageMessage === 'function') {
      window.displayPageMessage('Some collections could not be cleared completely. Please check the console for errors.', 'warning');
    } else {
      alert('Some collections could not be cleared completely. Please check the console for errors.');
    }
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
