// Imports for page-specific loading functions
import { loadProducts } from './products.js';
import { loadInventory } from './inventory.js';
import { loadTransactions } from './transactions.js';
import { initializeShipmentFeature } from './shipment.js';
// Assuming initJordonPage is handled by dynamic import in loadJordonPage or becomes a module import if jordon.js is refactored.

// HTML Templates for dynamic navigation items
const NAV_ITEM_JORDON_HTML = `
    <li data-page="jordon" id="nav-jordon" class="dynamic-nav-item">
        <i class="fas fa-box"></i> 
        <span>Jordon</span>
    </li>`;
const NAV_ITEM_LINEAGE_HTML = `
    <li data-page="lineage" id="nav-lineage" class="dynamic-nav-item">
        <i class="fas fa-box"></i> 
        <span>Lineage</span>
    </li>`;
const NAV_ITEM_SINGLONG_HTML = `
    <li data-page="singlong" id="nav-singlong" class="dynamic-nav-item">
        <i class="fas fa-box"></i> 
        <span>Sing Long</span>
    </li>`;

let sidebarToggleListenerAttached = false; // Flag to track listener attachment

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 主应用逻辑
let mainContentArea = null; // Cache for the main content DOM element

document.addEventListener('DOMContentLoaded', function () {
  mainContentArea = document.getElementById('content');
  if (!mainContentArea) {
      console.error("CRITICAL: Main content area '#content' not found on DOMContentLoaded. Application might not function correctly.");
      // Potentially halt further execution or show a global error
      return; 
  }

  // Firebase Auth State Change Listener
  firebase.auth().onAuthStateChanged(async user => { 
      if (user) {
          console.log('onAuthStateChanged (app.js): User signed in:', user.uid);
          let displayName = user.uid; 
          try {
              const idTokenResult = await user.getIdTokenResult(true); 
              if (idTokenResult.claims.name) {
                  displayName = idTokenResult.claims.name;
              }
          } catch (error) {
              console.error('Error getting ID token result:', error);
          }

          sessionStorage.setItem('isAuthenticated', 'true'); 
          sessionStorage.setItem('loggedInUser', displayName); 

          const sidebar = document.querySelector('.sidebar');
          const sidebarToggle = document.querySelector('.sidebar-toggle');
          
          if (sidebarToggle && sidebar && !sidebarToggleListenerAttached) { 
            sidebarToggle.addEventListener('click', function () {
              sidebar.classList.toggle('sidebar-collapsed');
            });
            sidebarToggleListenerAttached = true; // Set flag after attaching
          }

          initNavigation(); 
          loadDashboard();  

          // Initialize Product Listener after ensuring IndexedDB is ready
          if (window.indexedDBManagerReady) {
            window.indexedDBManagerReady.then(() => {
              console.log("IndexedDB is ready, attempting to attach product listener.");
              if (window.productAPI && typeof window.productAPI.listenToProductChanges === 'function') {
                  const debouncedLoadProductsCallback = debounce(loadProducts, 500); 

                  window.productAPI.listenToProductChanges((updateInfo) => {
                      if (updateInfo.error) {
                          console.error("Error from product listener callback:", updateInfo.error);
                          return;
                      }
                      console.log('Product data changed via listener:', updateInfo);
                      const activePageLi = document.querySelector('.sidebar nav ul li.active');
                      if (activePageLi && activePageLi.dataset.page === 'products') {
                          console.log('Product page is active, reloading product list via debounced function...');
                          debouncedLoadProductsCallback(mainContentArea);
                      } else {
                          console.log("Product page not active, IndexedDB updated in background.");
                      }
                  });
              } else {
                  console.warn('productAPI.listenToProductChanges is not available to attach listener.');
              }
            }).catch(err => {
                console.error("Failed to initialize IndexedDBManager in app.js, product listener not attached:", err);
            });
          } else {
            console.error("indexedDBManagerReady promise not found in app.js. Cannot attach product listener.");
          }

          // Initialize Inventory Listener after ensuring IndexedDB is ready
          if (window.indexedDBManagerReady) {
            window.indexedDBManagerReady.then(() => {
              console.log("IndexedDB is ready, attempting to attach inventory listener.");
              if (window.inventoryAPI && typeof window.inventoryAPI.listenToInventoryChanges === 'function') {
                  const debouncedLoadInventoryCallback = debounce(loadInventory, 500);

                  window.inventoryAPI.listenToInventoryChanges((updateInfo) => {
                      if (updateInfo.error) {
                          console.error("Error from inventory listener callback:", updateInfo.error);
                          return;
                      }
                      console.log('Inventory data changed via listener:', updateInfo);
                      const activePageLi = document.querySelector('.sidebar nav ul li.active');
                      if (activePageLi && activePageLi.dataset.page === 'inventory') {
                          console.log('Inventory page is active, reloading inventory list via debounced function...');
                          debouncedLoadInventoryCallback(mainContentArea);
                      } else {
                          console.log("Inventory page not active, IndexedDB updated in background.");
                      }
                  });
              } else {
                  console.warn('inventoryAPI.listenToInventoryChanges is not available to attach listener.');
              }
            }).catch(err => {
                console.error("Failed to initialize IndexedDBManager in app.js, inventory listener not attached:", err);
            });
          } else {
            console.error("indexedDBManagerReady promise not found in app.js. Cannot attach inventory listener.");
          }

          // Initialize Transaction Listener after ensuring IndexedDB is ready
          if (window.indexedDBManagerReady) {
            window.indexedDBManagerReady.then(() => {
              console.log("IndexedDB is ready, attempting to attach transaction listener.");
              if (window.transactionAPI && typeof window.transactionAPI.listenToTransactionChanges === 'function') {
                  const debouncedLoadTransactionsCallback = debounce(loadTransactions, 500);

                  window.transactionAPI.listenToTransactionChanges((updateInfo) => {
                      if (updateInfo.error) {
                          console.error("Error from transaction listener callback:", updateInfo.error);
                          return;
                      }
                      console.log('Transaction data changed via listener:', updateInfo);
                      const activePageLi = document.querySelector('.sidebar nav ul li.active');
                      if (activePageLi && activePageLi.dataset.page === 'transactions') {
                          console.log('Transaction page is active, reloading transaction list via debounced function...');
                          debouncedLoadTransactionsCallback(mainContentArea);
                      } else {
                          console.log("Transaction page not active, IndexedDB updated in background.");
                      }
                  });
              } else {
                  console.warn('transactionAPI.listenToTransactionChanges is not available to attach listener.');
              }
            }).catch(err => {
                console.error("Failed to initialize IndexedDBManager in app.js, transaction listener not attached:", err);
            });
          } else {
            console.error("indexedDBManagerReady promise not found in app.js. Cannot attach transaction listener.");
          }

          // Initialize Shipment Listener after ensuring IndexedDB is ready
          if (window.indexedDBManagerReady) {
            window.indexedDBManagerReady.then(() => {
              console.log("IndexedDB is ready, attempting to attach shipment listener.");
              if (window.shipmentAPI && typeof window.shipmentAPI.listenToShipmentChanges === 'function') {
                  const debouncedInitializeShipmentFeatureCallback = debounce(initializeShipmentFeature, 500);

                  window.shipmentAPI.listenToShipmentChanges((updateInfo) => {
                      if (updateInfo.error) {
                          console.error("Error from shipment listener callback:", updateInfo.error);
                          return;
                      }
                      console.log('Shipment data changed via listener:', updateInfo);
                      const activePageLi = document.querySelector('.sidebar nav ul li.active');
                      if (activePageLi && activePageLi.dataset.page === 'shipment') { 
                          console.log('Shipment page is active, reloading shipment page via debounced function...');
                          // initializeShipmentFeature in shipment.js finds its own DOM elements.
                          // It's called with mainContentArea by loadPage, but doesn't use the argument.
                          // Calling it here with mainContentArea for consistency.
                          debouncedInitializeShipmentFeatureCallback(mainContentArea); 
                      } else {
                          console.log("Shipment page not active, IndexedDB updated in background.");
                      }
                  });
              } else {
                  console.warn('shipmentAPI.listenToShipmentChanges is not available to attach listener.');
              }
            }).catch(err => {
                console.error("Failed to initialize IndexedDBManager in app.js, shipment listener not attached:", err);
            });
          } else {
            console.error("indexedDBManagerReady promise not found in app.js. Cannot attach shipment listener.");
          }


          const avatarMenuTrigger = document.getElementById('avatar-menu-trigger');
          const avatarDropdown = document.getElementById('avatar-dropdown');
          
          if (avatarMenuTrigger && avatarDropdown) {
              avatarMenuTrigger.addEventListener('click', function(event) {
                  event.stopPropagation(); 
                  avatarDropdown.classList.toggle('show');
              });
          }

          window.addEventListener('click', function(event) {
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
          console.log('onAuthStateChanged (app.js): User signed out. Redirecting to login.');
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
          
          // IndexedDB is persistent, other session caches might need clearing if added.
          sessionStorage.removeItem('isAuthenticated'); 
          sessionStorage.removeItem('loggedInUser');
          window.location.href = 'login.html';
      }
  });

  const dropdownLogoutButton = document.getElementById('dropdown-logout-button');
  if (dropdownLogoutButton) {
      dropdownLogoutButton.addEventListener('click', function(event) {
          event.preventDefault();
          firebase.auth().signOut().catch(error => {
              console.error('Firebase sign-out error:', error);
          });
      });
  }
});

function createNavItem(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
}

function initNavigation() {
  const mainNavList = document.querySelector('.sidebar nav ul');
  const publicWarehouseMenuItem = document.getElementById('public-warehouse-menu');

  if (!mainNavList || !publicWarehouseMenuItem) { 
    console.error('Essential navigation elements not found.');
    return;
  }

  const DYNAMIC_NAV_ITEM_IDS = ['nav-jordon', 'nav-lineage', 'nav-singlong'];

  function removeDynamicNavItems() {
    DYNAMIC_NAV_ITEM_IDS.forEach(id => {
      const item = document.getElementById(id);
      if (item) item.remove();
    });
    publicWarehouseMenuItem.classList.remove('expanded');
  }

  mainNavList.addEventListener('click', function(event) {
    const clickedLi = event.target.closest('li');
    if (!clickedLi) return;

    const isPublicWarehouseParentClicked = clickedLi.id === 'public-warehouse-menu';
    const isDynamicSubItemClicked = clickedLi.classList.contains('dynamic-nav-item');
    const pageToLoad = clickedLi.getAttribute('data-page');

    mainNavList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

    if (isPublicWarehouseParentClicked && !pageToLoad) { 
      event.stopPropagation(); 
      const isCurrentlyExpanded = publicWarehouseMenuItem.classList.contains('expanded');
      if (isCurrentlyExpanded) {
        removeDynamicNavItems(); 
      } else {
        publicWarehouseMenuItem.classList.add('expanded', 'active');
        const singlongItem = createNavItem(NAV_ITEM_SINGLONG_HTML);
        const lineageItem = createNavItem(NAV_ITEM_LINEAGE_HTML);
        const jordonItem = createNavItem(NAV_ITEM_JORDON_HTML);
        let currentLastItem = publicWarehouseMenuItem;
        [jordonItem, lineageItem, singlongItem].forEach(item => {
          currentLastItem.insertAdjacentElement('afterend', item);
          currentLastItem = item;
        });
      }
    } else if (pageToLoad) { 
      clickedLi.classList.add('active'); 
      if (isDynamicSubItemClicked) {
        publicWarehouseMenuItem.classList.add('expanded', 'active');
      } else {
        removeDynamicNavItems(); 
      }
      loadPage(pageToLoad);
    }
  });

  removeDynamicNavItems(); 
  publicWarehouseMenuItem.classList.remove('active');
}

function loadPage(page) {
  // Use cached mainContentArea
  if (!mainContentArea) { 
      console.error("Main content area cache is not initialized.");
      return;
  }
  if (!page) {
      mainContentArea.innerHTML = '<p>Please select a page.</p>'; // Handle case where page is undefined
      return;
  }

  // Clear content area and show a more structured loading indicator
  mainContentArea.innerHTML = '<div class="loading-indicator" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Loading...</p></div>'; 

  switch (page) {
    case 'dashboard': 
        loadDashboard(); 
        break;
    case 'products': 
        // Dynamic import is already a good practice.
        // loadProducts is imported at the top and can be called directly if needed,
        // but the dynamic import here ensures it's loaded on demand for this page.
        // The imported loadProducts will be used by the listener.
        import('./products.js')
            .then(module => {
                if (module.loadProducts && typeof module.loadProducts === 'function') {
                    module.loadProducts(mainContentArea); 
                } else {
                    console.error("loadProducts function not found in products.js module via dynamic import.");
                    mainContentArea.innerHTML = '<p style="color: red;">Error: Could not load products page components.</p>';
                }
            })
            .catch(error => {
                console.error('Failed to load products.js module:', error);
                mainContentArea.innerHTML = `<p style="color: red;">Error loading products page: ${error}.</p>`;
            });
        break;
    case 'inventory': 
        import('./inventory.js')
            .then(module => {
                if (module.loadInventory && typeof module.loadInventory === 'function') {
                    module.loadInventory(mainContentArea); 
                } else {
                    console.error("loadInventory function not found in inventory.js module via dynamic import.");
                    mainContentArea.innerHTML = '<p style="color: red;">Error: Could not load inventory page components.</p>';
                }
            })
            .catch(error => {
                console.error('Failed to load inventory.js module:', error);
                mainContentArea.innerHTML = `<p style="color: red;">Error loading inventory page: ${error}.</p>`;
            });
        break;
    case 'transactions': 
        import('./transactions.js')
            .then(module => {
                if (module.loadTransactions && typeof module.loadTransactions === 'function') {
                    module.loadTransactions(mainContentArea); 
                } else {
                    console.error("loadTransactions function not found in transactions.js module via dynamic import.");
                    mainContentArea.innerHTML = '<p style="color: red;">Error: Could not load transactions page components.</p>';
                }
            })
            .catch(error => {
                console.error('Failed to load transactions.js module:', error);
                mainContentArea.innerHTML = `<p style="color: red;">Error loading transactions page: ${error}.</p>`;
            });
        break;
    case 'inbound': loadInboundForm(); break;
    case 'outbound': loadOutboundForm(); break;
    case 'shipment':
        fetch('shipment.html')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.text();
            })
            .then(html => {
                mainContentArea.innerHTML = html;
                // shipment.js is now imported at the top as well.
                // The dynamic import here is fine, module.initializeShipmentFeature will be the same function.
                return import('./shipment.js'); 
            })
            .then(module => {
                if (module.initializeShipmentFeature && typeof module.initializeShipmentFeature === 'function') {
                    module.initializeShipmentFeature(mainContentArea); 
                } else {
                    console.error("initializeShipmentFeature function not found in shipment.js module via dynamic import.");
                }
            })
            .catch(error => {
                console.error('Failed to load shipment page or module:', error);
                mainContentArea.innerHTML = `<p style="color: red;">Failed to load shipment page: ${error}.</p>`;
            });
        break;
    case 'jordon': loadJordonPage(); break; 
    case 'lineage': mainContentArea.innerHTML = '<h1>Lineage (Coming Soon)</h1>'; break;
    case 'singlong': mainContentArea.innerHTML = '<h1>Sing Long (Coming Soon)</h1>'; break;
    default: loadDashboard();
  }
}

async function loadJordonPage() {
    // Use cached mainContentArea
    if(!mainContentArea) return;
    try {
        const response = await fetch('jordon.html');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        content.innerHTML = await response.text();
        // Dynamically import jordon.js and initialize
        import('./jordon.js')
            .then(module => {
                if (module.initJordonPage && typeof module.initJordonPage === 'function') {
                    module.initJordonPage(content); 
                } else if (typeof initJordonTabs === 'function') { 
                    console.warn("initJordonPage not found in jordon.js, falling back to global initJordonTabs (if available). Consider exporting initJordonPage from jordon.js.");
                    initJordonTabs(content); 
                }
                else {
                    console.error("initJordonPage (or initJordonTabs) function not found in jordon.js module or globally.");
                }
            })
            .catch(error => {
                console.error('Failed to load jordon.js module:', error);
            });
    } catch (error) {
        console.error('Failed to load Jordon page HTML:', error);
        content.innerHTML = '<h1>Error loading Jordon page</h1>';
    }
}

async function loadDashboard() {
    // Use cached mainContentArea
    if(!mainContentArea) return;
    mainContentArea.innerHTML = `
      <div class="dashboard">
          <h1>Welcome to Li Chuan Inventory Management System</h1>
          <div class="stats">
              <div class="stat-card"><i class="fas fa-boxes"></i><div><h3>Total Product</h3><p id="total-products">0</p></div></div>
              <div class="stat-card"><i class="fas fa-warehouse"></i><div><h3>Total Quantity</h3><p id="total-inventory">0</p></div></div>
              <div class="stat-card"><i class="fas fa-exchange-alt"></i><div><h3>Transaction</h3><p id="today-transactions">0</p></div></div>
          </div>
      </div>
    `;
    try {
      if (window.dashboardAPI && typeof window.dashboardAPI.getStats === 'function') {
        const stats = await window.dashboardAPI.getStats();
        if(document.getElementById('total-products')) document.getElementById('total-products').textContent = stats.totalProducts;
        if(document.getElementById('total-inventory')) document.getElementById('total-inventory').textContent = stats.totalInventory;
        if(document.getElementById('today-transactions')) document.getElementById('today-transactions').textContent = stats.todayTransactions;
      } else {
        console.warn('dashboardAPI.getStats is not available.');
        ['total-products', 'total-inventory', 'today-transactions'].forEach(id => {
            if(document.getElementById(id)) document.getElementById(id).textContent = 'N/A';
        });
      }
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      ['total-products', 'total-inventory', 'today-transactions'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).textContent = 'Error';
      });
    }
}

function loadInboundForm() {
    // Use cached mainContentArea
    if(!mainContentArea) return;
    mainContentArea.innerHTML = `
      <div class="form-container">
          <h1>Inbound</h1>
          <form id="inbound-form">
              <div class="form-group"><label for="inbound-productCode">Item Code*</label><input type="text" id="inbound-productCode" name="productCode" required></div>
              <div class="form-group"><label for="inbound-warehouseId">Warehouse ID*</label><input type="text" id="inbound-warehouseId" name="warehouseId" value="WH01" required></div>
              <div class="form-row">
                  <div class="form-group"><label for="inbound-batchNo">Batch No</label><input type="text" id="inbound-batchNo" name="batchNo"></div>
                  <div class="form-group"><label for="inbound-expiryDate">Exp Date</label><input type="date" id="inbound-expiryDate" name="expiryDate"></div>
              </div>
              <div class="form-group"><label for="inbound-quantity">Quantity*</label><input type="number" id="inbound-quantity" name="quantity" min="1" required></div>
              <div class="form-group"><label for="inbound-operatorId">User ID*</label><input type="text" id="inbound-operatorId" name="operatorId" required></div>
              <div class="form-actions"><button type="button" class="btn btn-secondary" id="inbound-cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Submit</button></div>
          </form>
      </div>
    `;
    const cancelBtn = document.getElementById('inbound-cancel-btn');
    if(cancelBtn) cancelBtn.addEventListener('click', () => loadPage('inventory'));
    const inboundForm = document.getElementById('inbound-form');
    if(inboundForm) inboundForm.addEventListener('submit', handleInboundSubmit);
}

async function handleInboundSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const rawData = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector('button[type="submit"]');
    if(submitButton) { submitButton.disabled = true; submitButton.textContent = 'Submitting...';}

    try {
      if (!window.productAPI || !window.transactionAPI) throw new Error("API not available.");
      const product = await window.productAPI.getProductByCode(rawData.productCode);
      if (!product) throw new Error(`Product with code "${rawData.productCode}" not found.`);
      
      await window.transactionAPI.inboundStock({
        productId: product.id, productCode: product.productCode, productName: product.name,
        warehouseId: rawData.warehouseId, batchNo: rawData.batchNo, 
        expiryDate: rawData.expiryDate || null, quantity: Number(rawData.quantity),
        operatorId: rawData.operatorId,
      });
      alert('Inbound successful!');
      loadPage('inventory');
    } catch (error) {
      console.error('Inbound failed:', error);
      alert('Inbound failed: ' + error.message);
    } finally {
      if(submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit';}
    }
}

function loadOutboundForm() {
    // Use cached mainContentArea
    if(!mainContentArea) return;
    mainContentArea.innerHTML = `
      <div class="form-container">
          <h1>Out Bound</h1>
          <form id="outbound-form">
              <div class="form-group"><label for="outbound-productCode">Item Code*</label><input type="text" id="outbound-productCode" name="productCode" required></div>
              <div class="form-group"><label for="outbound-warehouseId">Warehouse ID*</label><input type="text" id="outbound-warehouseId" name="warehouseId" value="WH01" required></div>
              <div class="form-group"><label for="outbound-batchNo">Batch No</label><input type="text" id="outbound-batchNo" name="batchNo"></div>
              <div class="form-group"><label for="outbound-quantity">Quantity*</label><input type="number" id="outbound-quantity" name="quantity" min="1" required></div>
              <div class="form-group"><label for="outbound-operatorId">User ID*</label><input type="text" id="outbound-operatorId" name="operatorId" required></div>
              <div class="form-actions"><button type="button" class="btn btn-secondary" id="outbound-cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Submit</button></div>
          </form>
      </div>
    `;
    const cancelBtn = document.getElementById('outbound-cancel-btn');
    if(cancelBtn) cancelBtn.addEventListener('click', () => loadPage('inventory'));
    const outboundForm = document.getElementById('outbound-form');
    if(outboundForm) outboundForm.addEventListener('submit', handleOutboundSubmit);
}

async function handleOutboundSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const rawData = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector('button[type="submit"]');
    if(submitButton) { submitButton.disabled = true; submitButton.textContent = 'Submitting...'; }

    try {
      if (!window.productAPI || !window.transactionAPI) throw new Error("API not available.");
      const product = await window.productAPI.getProductByCode(rawData.productCode); 
      if (!product) throw new Error(`Product with code "${rawData.productCode}" not found.`);

      await window.transactionAPI.outboundStock({
        productId: product.id, productCode: product.productCode, productName: product.name,
        warehouseId: rawData.warehouseId, batchNo: rawData.batchNo, 
        quantity: Number(rawData.quantity), operatorId: rawData.operatorId,
      });
      alert('Outbound successful!');
      loadPage('inventory');
    } catch (error) {
      console.error('Outbound failed:', error);
      alert('Outbound failed: ' + error.message);
    } finally {
      if(submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit';}
    }
}

// Note: Fallbacks for loadProducts, loadInventory, loadTransactions previously here
// are removed as these are now handled by dynamic imports in loadPage.
