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

        // Sort by excelRowNumber
        pendingItemsWithProducts.sort((a, b) => {
            const rowNumA = a.excelRowNumber;
            const rowNumB = b.excelRowNumber;

            // Handle cases where excelRowNumber might be missing or not a number
            if (rowNumA == null || typeof rowNumA !== 'number') return 1; // Send items without valid rowNumA to the end
            if (rowNumB == null || typeof rowNumB !== 'number') return -1; // Keep items with valid rowNumB before those without

            return rowNumA - rowNumB; // Ascending order
        });

        console.log('Loaded and sorted pending Jordon stock with product details:', pendingItemsWithProducts);
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
async function loadInventorySummaryData() {
    console.log("loadInventorySummaryData() called");
    const db = firebase.firestore();
    const summaryItems = [];

    try {
        const inventoryQuery = db.collection('inventory')
            .where('warehouseId', '==', 'jordon')
            .orderBy('_3plDetails.dateStored')
            .orderBy('_3plDetails.lotNumber');

        // Note: Adding a second orderBy, e.g., .orderBy('_3plDetails.dateStored'), 
        // would likely require a composite index in Firestore.
        // Example: .orderBy('_3plDetails.dateStored', 'desc')

        const snapshot = await inventoryQuery.get();

        if (snapshot.empty) {
            console.log("No Jordon inventory items found.");
            return summaryItems;
        }

        for (const doc of snapshot.docs) {
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
                    console.warn(`Product details not found for productCode: ${inventoryItem.productCode} during summary load.`);
                }
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode during summary load.`);
            }
            summaryItems.push({ ...inventoryItem, productName, productPackaging });
        }

        console.log('Loaded Jordon inventory summary data:', summaryItems);
        return summaryItems;

    } catch (error) {
        console.error("Error loading Jordon inventory summary data:", error);
        // Optional: Display a user-friendly message on the UI
        // const summaryContainer = document.getElementById('inventory-summary-content');
        // if(summaryContainer) summaryContainer.innerHTML = "<p style='color:red;'>Error loading summary data. Please try again later.</p>";
        return []; // Return empty array on error
    }
}

function displayInventorySummary(summaryItems) {
    const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
    const summaryTotalCartonsEl = document.getElementById('summary-total-cartons');
    const summaryTotalPalletsEl = document.getElementById('summary-total-pallets');

    if (!summaryTableBody || !summaryTotalCartonsEl || !summaryTotalPalletsEl) {
        console.error('Inventory summary table elements (tbody or totals) not found.');
        if (summaryTableBody) summaryTableBody.innerHTML = '<tr><td colspan="12" style="color:red; text-align:center;">Error: Table elements missing.</td></tr>';
        return;
    }

    summaryTableBody.innerHTML = ''; // Clear existing content
    let totalCartons = 0;
    let totalPallets = 0;

    const highlightColors = ['#FFFFE0', '#ADD8E6', '#90EE90', '#FFB6C1', '#FAFAD2', '#E0FFFF'];
    const groupIdToColorMap = new Map();
    let colorIndex = 0;

    if (!summaryItems || summaryItems.length === 0) {
        summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No inventory summary data available.</td></tr>'; // Adjusted colspan to 11
        summaryTotalCartonsEl.textContent = '0';
        summaryTotalPalletsEl.textContent = '0';
        return;
    }

    // Pre-calculate Group ID to Color Mapping
    const uniqueGroupIds = new Set(
        summaryItems
            .map(item => item._3plDetails?.mixedPalletGroupId)
            .filter(id => id && id.trim() !== '')
    );

    uniqueGroupIds.forEach(groupId => {
        groupIdToColorMap.set(groupId, highlightColors[colorIndex % highlightColors.length]);
        colorIndex++;
    });

    summaryItems.forEach(item => {
        const row = summaryTableBody.insertRow();
        const threePlDetails = item._3plDetails || {};

        row.insertCell().textContent = item.productCode || '';
        row.insertCell().textContent = item.productName || 'N/A';
        // Display productPackaging directly to allow apostrophes
        row.insertCell().textContent = item.productPackaging || 'N/A'; 
        row.insertCell().textContent = threePlDetails.palletType || '';
        row.insertCell().textContent = threePlDetails.location || '';
        row.insertCell().textContent = threePlDetails.lotNumber || '';
        row.insertCell().textContent = item.batchNo || '';
        row.insertCell().textContent = threePlDetails.dateStored || '';
        row.insertCell().textContent = item.container || '';
        // Removed Expiry Date cell
        
        const itemQuantity = Number(item.quantity) || 0;
        const quantityCell = row.insertCell();
        quantityCell.textContent = itemQuantity;
        totalCartons += itemQuantity;

        const itemPallets = Number(threePlDetails.pallet) || 0;
        const palletCell = row.insertCell();
        palletCell.textContent = itemPallets;
        totalPallets += itemPallets;

        // Apply highlighting based on mixedPalletGroupId
        const groupId = threePlDetails.mixedPalletGroupId;
        if (groupId && groupId.trim() !== '' && groupIdToColorMap.has(groupId)) { // Check if groupId is valid and in map
            const color = groupIdToColorMap.get(groupId);
            quantityCell.style.backgroundColor = color;
            palletCell.style.backgroundColor = color;
        }
    });

    summaryTotalCartonsEl.textContent = totalCartons;
    summaryTotalPalletsEl.textContent = totalPallets;
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
                const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
                if (summaryTableBody) {
                    summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading summary...</td></tr>'; // Adjusted colspan
                }
                console.log('Inventory Summary tab selected, calling loadInventorySummaryData().');
                loadInventorySummaryData()
                    .then(items => {
                        displayInventorySummary(items);
                    })
                    .catch(error => {
                        console.error('Error loading or displaying inventory summary:', error);
                        if (summaryTableBody) {
                            summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Error loading summary. See console.</td></tr>'; // Adjusted colspan
                        }
                    });
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
            const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
            if (summaryTableBody) {
                summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading summary...</td></tr>'; // Adjusted colspan
            }
            loadInventorySummaryData()
                .then(items => {
                    displayInventorySummary(items);
                })
                .catch(error => {
                    console.error('Error loading or displaying inventory summary on init:', error);
                    if (summaryTableBody) {
                        summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Error loading summary. See console.</td></tr>'; // Adjusted colspan
                    }
                });
        }
    } else if (tabItems.length > 0) { // If no tab is initially active, activate the first one
        activateTab(tabItems[0]);
        if (tabItems[0].dataset.tab === 'stock-in') {
            handleStockInTabActivation();
        } else if (tabItems[0].dataset.tab === 'inventory-summary') {
            const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
            if (summaryTableBody) {
                summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading summary...</td></tr>'; // Adjusted colspan
            }
            loadInventorySummaryData()
                .then(items => {
                    displayInventorySummary(items);
                })
                .catch(error => {
                    console.error('Error loading or displaying inventory summary on init (first tab):', error);
                    if (summaryTableBody) {
                        summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Error loading summary. See console.</td></tr>'; // Adjusted colspan
                    }
                });
        }
    }

    const submitButton = document.getElementById('submit-stock-in-btn');
    if (submitButton) {
        submitButton.addEventListener('click', handleSubmitStockIn);
    } else {
        console.warn('Submit Stock In button (#submit-stock-in-btn) not found.');
    }
}

async function handleSubmitStockIn() {
    console.log('handleSubmitStockIn called');
    const stockInTableBody = document.getElementById('stock-in-table-body');
    if (!stockInTableBody) {
        console.error('Stock In table body (#stock-in-table-body) not found for submission.');
        return;
    }

    const rows = stockInTableBody.querySelectorAll('tr');
    const itemsToUpdate = [];

    rows.forEach(row => {
        const itemId = row.dataset.itemId;
        if (!itemId) { // Skip rows that might be headers or placeholders without an item ID
            return;
        }

        const palletTypeSelect = row.querySelector('.pallet-type-select');
        const locationSelect = row.querySelector('.location-select');
        const lotNumberInput = row.querySelector('.lot-number-input');
        const mixedPalletGroupIdInput = row.querySelector('.mixed-pallet-group-id-input');

        const rowData = {
            itemId: itemId,
            palletType: palletTypeSelect ? palletTypeSelect.value : null,
            location: locationSelect ? locationSelect.value : null,
            lotNumber: lotNumberInput ? lotNumberInput.value.trim() : "", // Default to empty string if null
            mixedPalletGroupId: mixedPalletGroupIdInput ? mixedPalletGroupIdInput.value.trim() : "", // Default to empty string if null
        };
        itemsToUpdate.push(rowData);
    });

    if (itemsToUpdate.length === 0) {
        alert('No items found in the table to submit.');
        return;
    }
    
    const submitButton = document.getElementById('submit-stock-in-btn');
    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        const db = firebase.firestore();
        const batch = db.batch();

        itemsToUpdate.forEach(itemData => {
            const itemRef = db.collection('inventory').doc(itemData.itemId);
            const updateData = {
                '_3plDetails.palletType': itemData.palletType,
                '_3plDetails.location': itemData.location,
                '_3plDetails.lotNumber': itemData.lotNumber,
                '_3plDetails.mixedPalletGroupId': itemData.mixedPalletGroupId,
                '_3plDetails.status': 'Complete'
            };
            batch.update(itemRef, updateData);
        });

        await batch.commit();
        alert('Stock In updated successfully!');
        console.log('Stock In updated successfully for items:', itemsToUpdate.map(item => item.itemId));
        
        // Optionally, reload or clear the table after successful update
        // For example, by calling the function that loads pending stock again:
        // handleStockInTabActivation(); // This would re-trigger loadPendingJordonStock and displayPendingStockInTable
        // Or simply clear the current table:
        if(stockInTableBody) stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Update successful. Refreshing...</td></tr>'; // Colspan to match table
        // A common pattern is to re-fetch the data to show the updated state
        // For simplicity, we'll call the function that handles the tab activation which should reload the data.
        // Need to ensure handleStockInTabActivation is accessible or call its parts directly.
        // Let's assume we want to refresh the current view:
        loadPendingJordonStock().then(displayPendingStockInTable).catch(err => console.error("Error refreshing stock-in table:", err));

        // Also refresh the inventory summary data
        console.log("Attempting to refresh inventory summary data post-stock-in update.");
        loadInventorySummaryData().then(displayInventorySummary).catch(err => console.error("Error refreshing summary table post-stock-in:", err));


    } catch (error) {
        console.error('Error updating stock in:', error);
        alert('Error updating stock in. Please try again.');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

// The call to initJordonTabs() should be made when the Jordon page/section is loaded.
// For example, if app.js handles page loading:
// if (currentPage === 'jordon') { initJordonTabs(); }
// Or, if this script is loaded only on the Jordon page:
// document.addEventListener('DOMContentLoaded', initJordonTabs);
// For now, it's defined. It will be called from app.js or similar.
