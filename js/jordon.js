// Jordon specific JavaScript

// Helper function to escape HTML characters
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

async function loadPendingJordonStock() {
    const db = firebase.firestore(); 
    const pendingItemsWithProducts = [];
    try {
        const inventoryRef = db.collection('inventory');
        const q = inventoryRef
            .where('warehouseId', '==', 'jordon')
            .where('_3plDetails.status', '==', 'pending');
        const pendingInventorySnapshot = await q.get();

        for (const doc of pendingInventorySnapshot.docs) {
            const inventoryItem = { id: doc.id, ...doc.data() };
            let productName = 'N/A';
            let productPackaging = 'N/A';

            if (inventoryItem.productCode) {
                const productsRef = db.collection('products');
                const productQuery = productsRef.where('productCode', '==', inventoryItem.productCode).limit(1);
                const productSnapshot = await productQuery.get();
                if (!productSnapshot.empty) {
                    const productData = productSnapshot.docs[0].data();
                    productName = productData.name || 'N/A';
                    productPackaging = productData.packaging || 'N/A';
                } else {
                    console.warn(`Product details not found for productCode: ${inventoryItem.productCode}`);
                }
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode.`);
            }
            pendingItemsWithProducts.push({ ...inventoryItem, productName, productPackaging });
        }
        console.log('Loaded pending Jordon stock with product details:', pendingItemsWithProducts);
        return pendingItemsWithProducts;
    } catch (error) {
        console.error("Error loading pending Jordon stock:", error);
        return []; 
    }
}

function displayPendingStockInTable(items) {
    const stockInTableBody = document.getElementById('stock-in-table-body');
    if (!stockInTableBody) {
        console.error('Stock In table body (#stock-in-table-body) not found.');
        return;
    }
    stockInTableBody.innerHTML = ''; 

    if (items.length === 0) {
        stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No pending items found.</td></tr>'; // Colspan adjusted to 12
        return;
    }

    items.forEach(item => {
        const newRow = stockInTableBody.insertRow();
        newRow.dataset.itemId = item.id; 

        newRow.insertCell().textContent = item.productName || 'N/A';
        newRow.insertCell().textContent = item.productCode || 'N/A';
        newRow.insertCell().textContent = item.productPackaging || 'N/A';

        const threePlDetails = item._3plDetails || {};
        
        // 4. Pallet Type (Select)
        const palletTypeCell = newRow.insertCell();
        let palletTypeSelect = '<select class="form-control form-control-sm pallet-type-select">';
        palletTypeSelect += '<option value="LC" selected>LC</option>'; // Default LC
        palletTypeSelect += '<option value="JD">JD</option>';
        palletTypeSelect += '</select>';
        palletTypeCell.innerHTML = palletTypeSelect;
        // Note: item._3plDetails.palletType was "pending". Defaulting to "LC".
        
        // 5. Location (Select)
        const locationCell = newRow.insertCell();
        let locationSelect = '<select class="form-control form-control-sm location-select">';
        locationSelect += '<option value="LC01" selected>LC01</option>'; // Default LC01
        locationSelect += '<option value="Ala Carte">Ala Carte</option>';
        locationSelect += '</select>';
        locationCell.innerHTML = locationSelect;
        // Note: item._3plDetails.location was "". Defaulting to "LC01".

        // 6. Lot Number (Editable Input) - No change from previous, already editable
        newRow.insertCell().innerHTML = `<input type="text" class="form-control form-control-sm lot-number-input" value="${escapeHtml(threePlDetails.lotNumber || '')}" placeholder="Enter Lot No.">`; // Remains editable input
        
        // 7. Batch Number (Read-only Plain Text)
        newRow.insertCell().textContent = item.batchNo || '';

        // 8. Date Stored (Read-only Plain Text - dd/mm/yyyy)
        newRow.insertCell().textContent = (threePlDetails && threePlDetails.dateStored) ? threePlDetails.dateStored : '';
        
        // 9. Container Number (Read-only Plain Text)
        newRow.insertCell().textContent = item.container || '';
        
        // 10. Ctn(s) (Total Cartons - Read-only Plain Text)
        newRow.insertCell().textContent = item.quantity !== undefined ? item.quantity : 0;
        
        // 11. Plt (Physical Pallets - Read-only Plain Text)
        newRow.insertCell().textContent = (threePlDetails && threePlDetails.pallet !== undefined) ? threePlDetails.pallet : '';
        
        // 12. Mixed Pallet Group ID (Editable Input)
        newRow.insertCell().innerHTML = '<input type="text" class="form-control form-control-sm mixed-pallet-group-id-input" placeholder="Enter Group ID">';
        
        // 13. Actions Column REMOVED
        // const actionsCell = newRow.insertCell();
        // actionsCell.innerHTML = `<button class="btn btn-success btn-sm complete-stock-in-btn" data-item-id="${item.id}">Complete</button>`;
    });
}

// Placeholder for loading inventory summary data - adapt as needed
function loadInventorySummaryData() {
    console.log("loadInventorySummaryData() called - Placeholder for actual implementation.");
    // Example:
    // const summaryContainer = document.getElementById('inventory-summary-content');
    // if(summaryContainer) summaryContainer.innerHTML = "<p>Inventory summary data would be loaded and displayed here.</p>";
}


function initJordonTabs() { // Renamed from initJordonTabsAndStockIn
    console.log("Initializing Jordon tabs and stock-in functionality.");
    const tabContainer = document.querySelector('.jordon-page-container .tabs-container');
    if (!tabContainer) {
        console.error("Jordon tab container not found.");
        return;
    }
    const tabItems = tabContainer.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.jordon-page-container .tab-content');

    function activateTab(tabElement) {
        tabItems.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        tabElement.classList.add('active');
        const targetContentId = tabElement.dataset.tab + '-content';
        const targetContent = document.getElementById(targetContentId);
        if (targetContent) {
            targetContent.classList.add('active');
        } else {
            console.error(`Content panel with ID ${targetContentId} not found.`);
        }
        return targetContentId; // Return the ID of the activated content
    }

    function handleStockInTabActivation() {
        console.log('Stock In tab is active, calling loadPendingJordonStock().');
        const stockInTableBody = document.getElementById('stock-in-table-body');
        if (stockInTableBody) { // Show loading state
            stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Loading pending items...</td></tr>'; // Colspan adjusted to 12
        }
        loadPendingJordonStock()
            .then(items => {
                displayPendingStockInTable(items);
            })
            .catch(error => {
                console.error('Error loading or displaying pending stock:', error);
                if (stockInTableBody) {
                    stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Error loading pending items. See console.</td></tr>'; // Colspan adjusted to 12
                }
            });
    }

    tabItems.forEach(tab => {
        tab.addEventListener('click', function() {
            const activatedContentId = activateTab(this);
            if (this.dataset.tab === 'stock-in') {
                handleStockInTabActivation();
            } else if (this.dataset.tab === 'inventory-summary') {
                console.log('Inventory Summary tab selected, calling loadInventorySummaryData().');
                loadInventorySummaryData(); // Placeholder call
            }
            // Add other 'else if' blocks for other tabs and their specific load functions
        });
    });

    // Handle initial tab activation
    const initiallyActiveTab = tabContainer.querySelector('.tab-item.active');
    if (initiallyActiveTab) {
        activateTab(initiallyActiveTab); // Ensure content is shown
        if (initiallyActiveTab.dataset.tab === 'stock-in') {
            handleStockInTabActivation();
        } else if (initiallyActiveTab.dataset.tab === 'inventory-summary') {
            loadInventorySummaryData();
        }
    } else if (tabItems.length > 0) { // If no tab is initially active, activate the first one
        activateTab(tabItems[0]);
        if (tabItems[0].dataset.tab === 'stock-in') {
            handleStockInTabActivation();
        } else if (tabItems[0].dataset.tab === 'inventory-summary') {
            loadInventorySummaryData();
        }
    }
}

// The call to initJordonTabs() should be made when the Jordon page/section is loaded.
// For example, if app.js handles page loading:
// if (currentPage === 'jordon') { initJordonTabs(); }
// Or, if this script is loaded only on the Jordon page:
// document.addEventListener('DOMContentLoaded', initJordonTabs);
// For now, it's defined. It will be called from app.js or similar.
