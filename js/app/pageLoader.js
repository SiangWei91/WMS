// Page Loading Module: Handles loading content for different pages.

// Imports for page-specific content loading functions from their respective original files
// These are dynamically imported by loadPage where appropriate, or directly called for dashboard/forms.
// For functions like loadProducts, loadInventory, loadTransactions, initializeShipmentFeature, initJordonPage,
// they are expected to be available in their respective modules (e.g., ../products.js, ../inventory.js)
// and dynamically imported by this module if not passed in or directly imported for specific cases.

// We need access to the actual loadX functions if they are not dynamically imported within each case.
// For instance, if loadDashboard, loadInboundForm etc. are complex and remain, they'd be defined here.
// However, the plan is to use dynamic imports for most page modules.

// For loadDashboard, loadInboundForm, loadOutboundForm, loadJordonPage,
// their definitions will be moved here from the original app.js.

let currentMainContentArea = null; // To store the main content area reference

// Helper to set mainContentArea if not already set by each load function
function ensureMainContentArea(mainContentArea) {
    if (mainContentArea) {
        currentMainContentArea = mainContentArea;
    }
    if (!currentMainContentArea) {
        console.error("pageLoader.js: Main content area is not set.");
        throw new Error("Main content area is not set.");
    }
    return currentMainContentArea;
}

export async function loadDashboard(mainContentArea) {
    const contentArea = ensureMainContentArea(mainContentArea);
    contentArea.innerHTML = `
      <div class="dashboard">
          <h1>Dashboard</h1>
          <p>Coming Soon!</p>
      </div>
    `;
    // The previous logic for displaying stat cards and setting their values
    // (either from API or to "Coming Soon") is now removed.
}

function loadInboundForm(mainContentArea) {
    const contentArea = ensureMainContentArea(mainContentArea);
    contentArea.innerHTML = `
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
    if(cancelBtn) cancelBtn.addEventListener('click', () => loadPage('inventory', contentArea)); // Use loadPage from this module
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
        loadPage('inventory', currentMainContentArea); // Reload inventory page
    } catch (error) {
        console.error('Inbound failed:', error);
        alert('Inbound failed: ' + error.message);
    } finally {
        if(submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit';}
    }
}

function loadOutboundForm(mainContentArea) {
    const contentArea = ensureMainContentArea(mainContentArea);
    contentArea.innerHTML = `
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
    if(cancelBtn) cancelBtn.addEventListener('click', () => loadPage('inventory', contentArea)); // Use loadPage from this module
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
        loadPage('inventory', currentMainContentArea); // Reload inventory page
    } catch (error) {
        console.error('Outbound failed:', error);
        alert('Outbound failed: ' + error.message);
    } finally {
        if(submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit';}
    }
}

async function loadJordonPage(mainContentArea) {
    const contentArea = ensureMainContentArea(mainContentArea);
    try {
        const response = await fetch('../jordon.html'); // Adjusted path relative to js/app/
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        contentArea.innerHTML = await response.text();
        
        const module = await import('../jordon.js'); // Adjusted path
        if (module.initJordonPage && typeof module.initJordonPage === 'function') {
            module.initJordonPage(contentArea);
        } else if (module.initJordonTabs && typeof module.initJordonTabs === 'function') {
            console.warn("initJordonPage not found in jordon.js, using module.initJordonTabs.");
            module.initJordonTabs(contentArea);
        } else {
            console.error("Neither initJordonPage nor initJordonTabs found in jordon.js module.");
        }
    } catch (error) {
        console.error('Failed to load Jordon page HTML or module:', error);
        contentArea.innerHTML = '<h1>Error loading Jordon page</h1>';
    }
}

export function loadPage(page, mainContentArea) {
    const contentArea = ensureMainContentArea(mainContentArea); // Ensure currentMainContentArea is set

    if (!page) {
        contentArea.innerHTML = '<p>Please select a page.</p>';
        return;
    }

    contentArea.innerHTML = '<div class="loading-indicator" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Loading...</p></div>';

    switch (page) {
        case 'dashboard':
            loadDashboard(contentArea);
            break;
        case 'products':
            import('../products.js') // Adjust path relative to js/app/
                .then(module => {
                    if (module.loadProducts && typeof module.loadProducts === 'function') {
                        module.loadProducts(contentArea);
                    } else {
                        console.error("loadProducts function not found in products.js module.");
                        contentArea.innerHTML = '<p style="color: red;">Error: Could not load products page components.</p>';
                    }
                })
                .catch(error => {
                    console.error('Failed to load products.js module:', error);
                    contentArea.innerHTML = `<p style="color: red;">Error loading products page: ${error}.</p>`;
                });
            break;
        case 'inventory':
            import('../inventory.js') // Adjust path
                .then(module => {
                    if (module.loadInventory && typeof module.loadInventory === 'function') {
                        module.loadInventory(contentArea);
                    } else {
                        console.error("loadInventory function not found in inventory.js module.");
                        contentArea.innerHTML = '<p style="color: red;">Error: Could not load inventory page components.</p>';
                    }
                })
                .catch(error => {
                    console.error('Failed to load inventory.js module:', error);
                    contentArea.innerHTML = `<p style="color: red;">Error loading inventory page: ${error}.</p>`;
                });
            break;
        case 'transactions':
            import('../transactions.js') // Adjust path
                .then(module => {
                    if (module.loadTransactions && typeof module.loadTransactions === 'function') {
                        module.loadTransactions(contentArea);
                    } else {
                        console.error("loadTransactions function not found in transactions.js module.");
                        contentArea.innerHTML = '<p style="color: red;">Error: Could not load transactions page components.</p>';
                    }
                })
                .catch(error => {
                    console.error('Failed to load transactions.js module:', error);
                    contentArea.innerHTML = `<p style="color: red;">Error loading transactions page: ${error}.</p>`;
                });
            break;
        case 'inbound':
            loadInboundForm(contentArea);
            break;
        case 'outbound':
            loadOutboundForm(contentArea);
            break;
        case 'stock-take':
            contentArea.innerHTML = '<h1>Stock Take (Coming Soon)</h1>';
            break;
        case 'order':
            contentArea.innerHTML = '<h1>Order (Coming Soon)</h1>';
            break;
        case 'cr-temperature':
            contentArea.innerHTML = '<h1>CR Temperature (Coming Soon)</h1>';
            break;
        case 'service-record':
            contentArea.innerHTML = '<h1>Service Record (Coming Soon)</h1>';
            break;
        case 'packaging-material':
            contentArea.innerHTML = '<h1>Packaging Material (Coming Soon)</h1>';
            break;
        case 'shipment':
            fetch('../shipment.html') // Adjust path
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.text();
                })
                .then(html => {
                    contentArea.innerHTML = html;
                    return import('../shipment.js'); // Adjust path
                })
                .then(module => {
                    if (module.initializeShipmentFeature && typeof module.initializeShipmentFeature === 'function') {
                        module.initializeShipmentFeature(contentArea); // Pass contentArea if it uses it
                    } else {
                        console.error("initializeShipmentFeature function not found in shipment.js module.");
                    }
                })
                .catch(error => {
                    console.error('Failed to load shipment page or module:', error);
                    contentArea.innerHTML = `<p style="color: red;">Failed to load shipment page: ${error}.</p>`;
                });
            break;
        case 'jordon':
            loadJordonPage(contentArea);
            break;
        case 'lineage':
            contentArea.innerHTML = '<h1>Lineage (Coming Soon)</h1>';
            break;
        case 'singlong':
            contentArea.innerHTML = '<h1>Sing Long (Coming Soon)</h1>';
            break;
        default:
            loadDashboard(contentArea); // Fallback to dashboard
    }
}
