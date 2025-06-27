// Helper function for shallow comparison of two objects
function areObjectsShallowEqual(objA, objB, keysToIgnore = []) {
    if (objA === objB) return true;
    if (!objA || !objB || typeof objA !== 'object' || typeof objB !== 'object') {
        return false;
    }

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    // Filter out ignored keys
    const relevantKeysA = keysA.filter(key => !keysToIgnore.includes(key));
    const relevantKeysB = keysB.filter(key => !keysToIgnore.includes(key));

    if (relevantKeysA.length !== relevantKeysB.length) return false;

    for (const key of relevantKeysA) {
        if (!objB.hasOwnProperty(key) || objA[key] !== objB[key]) {
            return false;
        }
    }
    return true;
}

// Helper function to ensure IndexedDB is ready before proceeding
async function ensureDbManager() {
    if (!window.indexedDBManagerReady) {
        console.error("indexedDBManagerReady promise is not available.");
        throw new Error("IndexedDBManager readiness promise not found.");
    }
    await window.indexedDBManagerReady; // Wait for the DB to be initialized
    if (!window.indexedDBManager) {
        // This should ideally not happen if indexedDBManagerReady resolved successfully
        console.error("indexedDBManager is still not available after promise resolution.");
        throw new Error("IndexedDBManager failed to initialize.");
    }
}
