// Main application logic (app.js)
import { initAuth } from './app/auth.js';
// Page specific loaders - these are imported here because they are passed to auth.js -> firestoreListeners.js
import { loadProducts } from './products.js';
import { loadInventory } from './inventory.js';
import { loadTransactions } from './transactions.js';
import { initializeShipmentFeature } from './shipment.js';
// Main page loading functions from the new module
import { loadPage, loadDashboard } from './app/pageLoader.js';
// HTML Templates and navigation logic (initNavigation, createNavItem) are now in app/navigation.js
// Debounce function is now in app/utils.js
// CSV Import functionality
import { initInitialCsvImport } from './app/initialCsvImport.js';
// sidebarToggleListenerAttached is managed within app/auth.js
// Firestore Listeners setup is now in app/firestoreListeners.js, called by auth.js

// 主应用逻辑
let mainContentArea = null; // Cache for the main content DOM element

document.addEventListener('DOMContentLoaded', function () {
    // initializeReadCounter(); // Removed this line

    mainContentArea = document.getElementById('content');
    if (!mainContentArea) {
        console.error("CRITICAL: Main content area '#content' not found on DOMContentLoaded. Application might not function correctly.");
        return;
    }

    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const mainNavList = document.querySelector('.sidebar nav ul');
    const publicWarehouseMenuItem = document.getElementById('public-warehouse-menu');

    // These page loader functions are passed to auth.js, which then passes them to
    // other modules like firestoreListeners.js (for data update callbacks) 
    // and navigation.js (for page loading on nav clicks).
    const pageLoaders = {
        loadProducts: (contentArea) => loadProducts(contentArea), 
        loadInventory: (contentArea) => loadInventory(contentArea), 
        loadTransactions: (contentArea) => loadTransactions(contentArea), 
        initializeShipmentFeature: (contentArea) => initializeShipmentFeature(contentArea),
        loadPage: (page) => loadPage(page, mainContentArea), // from ./app/pageLoader.js
        loadDashboard: (contentArea) => loadDashboard(contentArea) // from ./app/pageLoader.js
        // initJordonPage will be handled internally by loadPage -> loadJordonPage which dynamically imports jordon.js
    };

    const navigationElements = {
        mainNavList: mainNavList,
        publicWarehouseMenuItem: publicWarehouseMenuItem
    };

    // Initialize authentication.
    // The initAuth function in auth.js is now responsible for:
    // 1. Setting up the Firebase auth listener.
    // 2. On login:
    //    - Initializing navigation (passing pageLoaders.loadPage).
    //    - Loading the dashboard (using pageLoaders.loadDashboard).
    //    - Initializing Firestore listeners (passing necessary pageLoaders for callbacks).
    //    - Handling sidebar toggle and avatar menu.
    // 3. On logout:
    //    - Redirecting to login page and cleaning up (detaching listeners etc.).
    initAuth(mainContentArea, sidebar, sidebarToggle, pageLoaders, navigationElements);
    
    // Initialize CSV Import functionality
    initInitialCsvImport();

    // Event listener for the logout button in the avatar dropdown
    // This remains in app.js as it's a direct user interaction tied to the main page structure.
    const dropdownLogoutButton = document.getElementById('dropdown-logout-button');
    if (dropdownLogoutButton) {
        dropdownLogoutButton.addEventListener('click', function(event) {
            event.preventDefault();
            firebase.auth().signOut().catch(error => {
                console.error('Firebase sign-out error:', error);
            });
        });
    }

    // Event listener for the "Clear Supabase Data" button
    // This also remains in app.js for now, as it's a global admin action.
    // It could be further modularized if other admin functionalities are added.
    const dropdownClearSupabaseButton = document.getElementById('dropdown-clear-supabase-button');
    if (dropdownClearSupabaseButton) {
        dropdownClearSupabaseButton.addEventListener('click', async function(event) {
            event.preventDefault();
            if (typeof window.clearAllPageMessages === 'function') {
                window.clearAllPageMessages();
            }

            const avatarDropdown = document.getElementById('avatar-dropdown');
            if (avatarDropdown) {
                avatarDropdown.classList.remove('show');
            }

            const collectionsToClear = [
                'inventory',
                'inventory_aggregated',
                // 'jordonWithdrawForms', // Table does not exist
                'transactions'
                // Add 'products' or other collections if they also need clearing
            ];

            if (window.supabaseAdminAPI && typeof window.supabaseAdminAPI.clearSupabaseTables === 'function') {
                try {
                    await window.supabaseAdminAPI.clearSupabaseTables(collectionsToClear);
                    
                    if (window.indexedDBManager && typeof window.indexedDBManager.clearStore === 'function') {
                        for (const collectionName of collectionsToClear) {
                            let storeToClear = null;
                            if (collectionName === 'transactions' && window.indexedDBManager.STORE_NAMES.TRANSACTIONS) {
                                storeToClear = window.indexedDBManager.STORE_NAMES.TRANSACTIONS;
                            } else if (collectionName === 'inventory_aggregated' && window.indexedDBManager.STORE_NAMES.INVENTORY) {
                                storeToClear = window.indexedDBManager.STORE_NAMES.INVENTORY;
                            } else if (collectionName === 'inventory' && window.indexedDBManager.STORE_NAMES.INVENTORY_DETAIL) {
                                // storeToClear = window.indexedDBManager.STORE_NAMES.INVENTORY_DETAIL; // Placeholder
                                console.warn(`IndexedDB clearing for Supabase table '${collectionName}' (inventory_detail) not explicitly mapped yet.`);
                            } else if (collectionName === 'jordonWithdrawForms') {
                                console.warn(`IndexedDB clearing for Supabase table '${collectionName}' not implemented.`);
                            }
                            // Example for products if it were added to collectionsToClear
                            // else if (collectionName === 'products' && window.indexedDBManager.STORE_NAMES.PRODUCTS) {
                            //     storeToClear = window.indexedDBManager.STORE_NAMES.PRODUCTS;
                            // }


                            if (storeToClear) {
                                console.log(`Attempting to clear IndexedDB store: ${storeToClear} (mapped from Supabase table: ${collectionName})`);
                                await window.indexedDBManager.clearStore(storeToClear);
                            }
                        }
                        // Also clear products from IDB if products collection is cleared from Supabase
                        if (collectionsToClear.includes('products') && window.indexedDBManager.STORE_NAMES.PRODUCTS) {
                           // await window.indexedDBManager.clearStore(window.indexedDBManager.STORE_NAMES.PRODUCTS);
                           // console.log("Cleared products store from IndexedDB as part of Supabase clear.");
                        }

                    } else {
                        console.warn('window.indexedDBManager.clearStore is not available. Skipping IndexedDB clear.');
                    }

                    const activePageLi = document.querySelector('.sidebar nav ul li.active');
                    const activePage = activePageLi ? activePageLi.dataset.page : null;

                    // Reload data for active page if its data was cleared
                    if (activePage === 'transactions' && collectionsToClear.includes('transactions')) {
                        if (typeof loadTransactions === 'function' && mainContentArea) {
                            loadTransactions(mainContentArea);
                        }
                    } else if (activePage === 'inventory' && collectionsToClear.includes('inventory_aggregated')) {
                        if (typeof loadInventory === 'function' && mainContentArea) {
                            loadInventory(mainContentArea);
                        }
                    } else if (activePage === 'products' && collectionsToClear.includes('products')) {
                        // if (typeof loadProducts === 'function' && mainContentArea) {
                        //     loadProducts(mainContentArea);
                        // }
                    }
                    // Add more conditions for other pages if needed

                } catch (error) {
                    console.error('Error during clear Supabase tables or IndexedDB stores:', error);
                    if (typeof window.displayPageMessage === 'function') {
                        window.displayPageMessage('An unexpected error occurred while clearing data. Check the console.', 'error');
                    } else {
                        alert('An unexpected error occurred while clearing data. Check the console.');
                    }
                }
            } else {
                console.error('supabaseAdminAPI.clearSupabaseTables is not available.');
                if (typeof window.displayPageMessage === 'function') {
                    window.displayPageMessage('Error: Clear tables functionality is not loaded correctly.', 'error');
                } else {
                    alert('Error: Clear tables functionality is not loaded correctly.');
                }
            }
        });
    }
});



// Fallbacks for loadProducts, etc. are no longer needed here as modules handle their own loading.
console.log("app.js: Main script loaded. Initialization delegated to imported modules.");
