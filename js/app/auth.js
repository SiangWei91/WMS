// Authentication module: handles Firebase auth state changes and UI updates.
import { initializeSupabaseListeners } from './supabaseListeners.js'; // UPDATED import
import { initNavigation } from './navigation.js';
import { loadDashboard } from './pageLoader.js';

let sidebarToggleListenerAttached = false; // Flag to track listener attachment

export function initAuth(mainContentArea, sidebar, sidebarToggle, pageLoaders, navigationElements) {
    firebase.auth().onAuthStateChanged(async user => {
        if (user) {
            console.log('onAuthStateChanged (auth.js): User signed in:', user.uid);
            let displayName = user.uid;
            try {
                const idTokenResult = await user.getIdTokenResult(true);
                if (idTokenResult.claims.name && idTokenResult.claims.name.trim() !== "") {
                    displayName = idTokenResult.claims.name.trim();
                }
            } catch (error) {
                console.error('Error getting ID token result:', error);
            }

            sessionStorage.setItem('isAuthenticated', 'true');
            sessionStorage.setItem('loggedInUser', displayName); // displayName will be uid if claims.name is not present or empty

            if (sidebarToggle && sidebar && !sidebarToggleListenerAttached) {
                sidebarToggle.addEventListener('click', function () {
                    sidebar.classList.toggle('sidebar-collapsed');
                });
                sidebarToggleListenerAttached = true; // Set flag after attaching
            }

            // Initialize navigation
            if (navigationElements.mainNavList && navigationElements.publicWarehouseMenuItem && typeof pageLoaders.loadPage === 'function') {
                initNavigation(navigationElements.mainNavList, navigationElements.publicWarehouseMenuItem, pageLoaders.loadPage);
            } else {
                console.error("Auth.js: Failed to initialize navigation due to missing elements or loadPage function.");
            }
            
            // Load initial content
            if (typeof pageLoaders.loadDashboard === 'function') {
                loadDashboard(mainContentArea);
            } else {
                 console.error("Auth.js: loadDashboard function is not available from pageLoaders.");
            }


            // Initialize Supabase Listeners
            // Ensure pageLoaders are correctly passed and structured for initializeSupabaseListeners
            if (typeof initializeSupabaseListeners === 'function') { // UPDATED function name check
                 initializeSupabaseListeners(mainContentArea, pageLoaders); // UPDATED function call
            } else {
                console.error("Auth.js: initializeSupabaseListeners is not available."); // UPDATED error message
            }


            const avatarMenuTrigger = document.getElementById('avatar-menu-trigger');
            const avatarDropdown = document.getElementById('avatar-dropdown');

            if (avatarMenuTrigger && avatarDropdown) {
                avatarMenuTrigger.addEventListener('click', function (event) {
                    event.stopPropagation();
                    avatarDropdown.classList.toggle('show');
                });
            }

            window.addEventListener('click', function (event) {
                const currentAvatarDropdown = document.getElementById('avatar-dropdown');
                const currentAvatarMenuTrigger = document.getElementById('avatar-menu-trigger');
                if (currentAvatarDropdown && currentAvatarDropdown.classList.contains('show')) {
                    if (currentAvatarMenuTrigger && !currentAvatarMenuTrigger.contains(event.target) && !currentAvatarDropdown.contains(event.target)) {
                        currentAvatarDropdown.classList.remove('show');
                    }
                }
            });

            const usernameDisplay = document.getElementById('username-display');
            if (usernameDisplay) {
                usernameDisplay.textContent = displayName;
            }

        } else {
            console.log('onAuthStateChanged (auth.js): User signed out. Redirecting to login.');
            // Detach Firestore listeners if they exist
            if (window.productAPI && typeof window.productAPI.detachProductListener === 'function') {
                window.productAPI.detachProductListener();
            }
            if (window.inventoryAPI && typeof window.inventoryAPI.detachInventoryListener === 'function') {
                window.inventoryAPI.detachInventoryListener();
            }
            if (window.transactionAPI && typeof window.transactionAPI.detachTransactionListener === 'function') {
                window.transactionAPI.detachTransactionListener();
            }
            if (window.shipmentAPI && typeof window.shipmentAPI.detachShipmentListener === 'function') {
                window.shipmentAPI.detachShipmentListener();
            }
            // Add similar detach logic for other listeners when implemented

            sessionStorage.removeItem('isAuthenticated');
            sessionStorage.removeItem('loggedInUser');
            sessionStorage.removeItem('isAuthenticated');
            sessionStorage.removeItem('loggedInUser');
            sessionStorage.removeItem('supabaseToken'); // Also clear supabase token on sign out
            window.location.href = 'login.html';
        }
    });

    firebase.auth().onIdTokenChanged(async (user) => {
        if (user) {
            try {
                const token = await user.getIdToken();
                sessionStorage.setItem('supabaseToken', token);
                console.log('onIdTokenChanged: Supabase token updated in sessionStorage.');
            } catch (error) {
                console.error('onIdTokenChanged: Error getting ID token:', error);
                // If token refresh fails, it could lead to auth issues with Supabase.
                // Consider redirecting to login or showing an error.
                // For now, logging the error. If Supabase calls start failing with 401,
                // this could be a reason.
                // One option: display a persistent error message or force re-login.
                // Example:
                // if (typeof window.displayGlobalError === 'function') {
                //     window.displayGlobalError('Your session may have expired. Please try refreshing or logging in again.');
                // }
            }
        } else {
            // User is signed out, token is already cleared by onAuthStateChanged
            console.log('onIdTokenChanged: User is signed out.');
        }
    });
}
