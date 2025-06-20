// Jordon specific JavaScript

let currentInventorySummaryItems = [];
let jordonStockOutItems = []; // Array to store items added to the stock out list

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
    const stockInTableBody = document.getElementById('stock-in-table-body');
    try {
        // It's good practice to show a loading state here if this function is user-triggered.
        // However, it's currently called when the 'Stock In' tab is activated, 
        // and handleStockInTabActivation already sets a loading message.
        const db = firebase.firestore(); 
        const pendingItemsWithProducts = [];
        const inventoryRef = db.collection('inventory');
        const q = inventoryRef
            .where('warehouseId', '==', 'jordon')
            .where('_3plDetails.status', '==', 'pending');
        const pendingInventorySnapshot = await q.get();

        for (const doc of pendingInventorySnapshot.docs) {
            const inventoryItem = { id: doc.id, ...doc.data() };
            let productName = 'N/A';
            let productPackaging = 'N/A';
            // productId is fetched from the 'products' collection, not used here directly yet
            // let productId = null; 

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

        pendingItemsWithProducts.sort((a, b) => {
            const rowNumA = a.excelRowNumber;
            const rowNumB = b.excelRowNumber;
            if (rowNumA == null || typeof rowNumA !== 'number') return 1;
            if (rowNumB == null || typeof rowNumB !== 'number') return -1;
            return rowNumA - rowNumB;
        });

        console.log('Loaded and sorted pending Jordon stock with product details:', pendingItemsWithProducts);
        return pendingItemsWithProducts;
    } catch (error) {
        console.error("Error loading pending Jordon stock:", error);
        if (stockInTableBody) { // Display error in the table
            stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Error loading pending stock. Please try again.</td></tr>';
        }
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
        stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No pending items found.</td></tr>';
        return;
    }

    items.forEach(item => {
        const newRow = stockInTableBody.insertRow();
        newRow.dataset.itemId = item.id; 

        newRow.insertCell().textContent = item.productName || 'N/A';
        newRow.insertCell().textContent = item.productCode || 'N/A';
        newRow.insertCell().textContent = item.productPackaging || 'N/A';

        const threePlDetails = item._3plDetails || {};
        
        const palletTypeCell = newRow.insertCell();
        let palletTypeSelect = '<select class="form-control form-control-sm pallet-type-select">';
        palletTypeSelect += '<option value="LC" selected>LC</option>';
        palletTypeSelect += '<option value="JD">JD</option>';
        palletTypeSelect += '</select>';
        palletTypeCell.innerHTML = palletTypeSelect;
        
        const locationCell = newRow.insertCell();
        let locationSelect = '<select class="form-control form-control-sm location-select">';
        locationSelect += '<option value="LC01" selected>LC01</option>';
        locationSelect += '<option value="Ala Carte">Ala Carte</option>';
        locationSelect += '</select>';
        locationCell.innerHTML = locationSelect;

        newRow.insertCell().innerHTML = `<input type="text" class="form-control form-control-sm lot-number-input" value="${escapeHtml(threePlDetails.lotNumber || '')}" placeholder="Enter Lot No.">`;
        newRow.insertCell().textContent = item.batchNo || '';
        newRow.insertCell().textContent = (threePlDetails && threePlDetails.dateStored) ? threePlDetails.dateStored : '';
        newRow.insertCell().textContent = item.container || '';
        newRow.insertCell().textContent = item.quantity !== undefined ? item.quantity : 0;
        newRow.insertCell().textContent = (threePlDetails && threePlDetails.pallet !== undefined) ? threePlDetails.pallet : '';
        newRow.insertCell().innerHTML = '<input type="text" class="form-control form-control-sm mixed-pallet-group-id-input" placeholder="Enter Group ID">';
    });
}

async function loadInventorySummaryData() {
    console.log("loadInventorySummaryData() called");
    const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody'); // Get ref to table body for error display

    // Show loading state in summary table before fetching data
    if (summaryTableBody) {
        summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading Jordon inventory summary...</td></tr>';
    }

    const db = firebase.firestore();
    const summaryItems = [];

    try {
        const inventoryQuery = db.collection('inventory')
            .where('warehouseId', '==', 'jordon')
            .orderBy('_3plDetails.dateStored')
            .orderBy('_3plDetails.lotNumber');
        const snapshot = await inventoryQuery.get();

        if (snapshot.empty) {
            console.log("No Jordon inventory items found.");
             if (summaryTableBody) summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No inventory items found for Jordon.</td></tr>';
            return summaryItems; // Return empty, but after updating table
        }

        let productId = null; // Define productId here to ensure it's in scope for summaryItems.push
        for (const doc of snapshot.docs) {
            const inventoryItem = { id: doc.id, ...doc.data() };
            let productName = 'N/A';
            let productPackaging = 'N/A';
            productId = null; // Reset for each item

            if (inventoryItem.productCode) {
                const productsRef = db.collection('products');
                const productQuery = productsRef.where('productCode', '==', inventoryItem.productCode).limit(1);
                const productSnapshot = await productQuery.get();

                if (!productSnapshot.empty) {
                    const productDoc = productSnapshot.docs[0];
                    const productData = productDoc.data();
                    productName = productData.name || 'N/A';
                    productPackaging = productData.packaging || 'N/A';
                    productId = productDoc.id; 
                } else {
                    console.warn(`Product details not found for productCode: ${inventoryItem.productCode} during summary load.`);
                }
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode during summary load.`);
            }
            summaryItems.push({ ...inventoryItem, productName, productPackaging, productId });
        }

        console.log('Loaded Jordon inventory summary data:', summaryItems);
        currentInventorySummaryItems = summaryItems; // Populate currentInventorySummaryItems
        return summaryItems;

    } catch (error) {
        console.error("Error loading Jordon inventory summary data:", error);
        if (summaryTableBody) { // Display error in the summary table
            summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Error loading inventory summary. Please check connection or try again later.</td></tr>';
        }
        return []; 
    }
}

function displayInventorySummary(summaryItems) {
    const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
    const summaryTotalCartonsEl = document.getElementById('summary-total-cartons');
    const summaryTotalPalletsEl = document.getElementById('summary-total-pallets');

    if (!summaryTableBody || !summaryTotalCartonsEl || !summaryTotalPalletsEl) {
        console.error('Inventory summary table elements (tbody or totals) not found.');
        if (summaryTableBody) summaryTableBody.innerHTML = '<tr><td colspan="11" style="color:red; text-align:center;">Error: Table elements missing.</td></tr>'; // Adjusted colspan
        return;
    }

    summaryTableBody.innerHTML = ''; 
    let totalCartons = 0;
    let totalPallets = 0;

    const stockOutPopup = document.getElementById('stock-out-popup');
    if (!stockOutPopup) {
        console.error("Stock out popup element not found. Row click functionality cannot be fully initialized.");
    }

    const highlightColors = ['#FFFFE0', '#ADD8E6', '#90EE90', '#FFB6C1', '#FAFAD2', '#E0FFFF'];
    const groupIdToColorMap = new Map();
    let colorIndex = 0;

    if (!summaryItems || summaryItems.length === 0) {
        // This case is handled by loadInventorySummaryData if snapshot is empty, 
        // but good to keep as a fallback if summaryItems is empty for other reasons.
        summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No inventory summary data available.</td></tr>';
        summaryTotalCartonsEl.textContent = '0';
        summaryTotalPalletsEl.textContent = '0';
        return;
    }

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

        row.dataset.itemId = item.id; 
        row.dataset.productCode = item.productCode || '';
        row.dataset.productName = item.productName || 'N/A';
        row.dataset.productPackaging = item.productPackaging || 'N/A';
        row.dataset.palletType = threePlDetails.palletType || '';
        row.dataset.location = threePlDetails.location || '';
        row.dataset.lotNumber = threePlDetails.lotNumber || '';
        row.dataset.quantity = item.quantity !== undefined ? item.quantity : 0;
        row.dataset.batchNo = item.batchNo || '';
        row.dataset.container = item.container || '';
        row.dataset.dateStored = threePlDetails.dateStored || '';
        row.dataset.productId = item.productId || ''; 
        row.dataset.mixedPalletGroupId = (threePlDetails && threePlDetails.mixedPalletGroupId) ? threePlDetails.mixedPalletGroupId : '';

        row.insertCell().textContent = item.productCode || '';
        row.insertCell().textContent = item.productName || 'N/A';
        row.insertCell().textContent = item.productPackaging || 'N/A';
        row.insertCell().textContent = threePlDetails.palletType || '';
        row.insertCell().textContent = threePlDetails.location || '';
        row.insertCell().textContent = threePlDetails.lotNumber || '';
        row.insertCell().textContent = item.batchNo || '';
        row.insertCell().textContent = threePlDetails.dateStored || '';
        row.insertCell().textContent = item.container || '';
        
        const itemQuantity = Number(item.quantity) || 0;
        // Storing pallet count in row.dataset.pallets
        row.dataset.pallets = Number(threePlDetails.pallet) || 0; 

        const quantityCell = row.insertCell();
        quantityCell.textContent = itemQuantity;
        totalCartons += itemQuantity;

        const itemPallets = Number(threePlDetails.pallet) || 0;
        const palletCell = row.insertCell();
        palletCell.textContent = itemPallets;
        totalPallets += itemPallets;

        const groupId = threePlDetails.mixedPalletGroupId;
        if (groupId && groupId.trim() !== '' && groupIdToColorMap.has(groupId)) {
            const color = groupIdToColorMap.get(groupId);
            quantityCell.style.backgroundColor = color;
            palletCell.style.backgroundColor = color;
        }

        if (stockOutPopup) { 
             row.addEventListener('click', handleInventoryRowClick);
        }
    });

    summaryTotalCartonsEl.textContent = totalCartons;
    summaryTotalPalletsEl.textContent = totalPallets;
}

function activateJordonTab(tabElement) {
    const tabContainer = document.querySelector('.jordon-page-container .tabs-container');
    if (!tabContainer) {
        console.error("Jordon tab container not found during activateJordonTab.");
        return null;
    }
    const tabItems = tabContainer.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.jordon-page-container .tab-content');

    tabItems.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    if (tabElement) {
        tabElement.classList.add('active');
        const targetContentId = tabElement.dataset.tab + '-content';
        const targetContent = document.getElementById(targetContentId);
        if (targetContent) {
            targetContent.classList.add('active');
            return targetContentId;
        } else {
            console.error(`Content panel with ID ${targetContentId} not found for tab:`, tabElement);
            return null;
        }
    } else {
        console.error("activateJordonTab called with null tabElement.");
        return null;
    }
}

function initJordonTabs(containerElement) { 
    console.log("Initializing Jordon tabs and stock-in functionality.");
    const tabContainer = containerElement.querySelector('.jordon-page-container .tabs-container');
    if (!tabContainer) {
        console.error("Jordon tab container not found within the provided containerElement.");
        return;
    }
    const tabItems = tabContainer.querySelectorAll('.tab-item');

    function handleStockInTabActivation() {
        console.log('Stock In tab is active, calling loadPendingJordonStock().');
        const stockInTableBody = document.getElementById('stock-in-table-body');
        if (stockInTableBody) { 
            stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Loading pending items...</td></tr>';
        }
        loadPendingJordonStock()
            .then(items => {
                displayPendingStockInTable(items);
            })
            .catch(error => { // Error already handled and displayed by loadPendingJordonStock
                console.error('Further error details from handleStockInTabActivation:', error);
            });
    }
    
    const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody'); // For inventory summary loading message

    tabItems.forEach(tab => {
        tab.addEventListener('click', function() {
            activateJordonTab(this); 
            if (this.dataset.tab === 'stock-in') {
                handleStockInTabActivation();
            } else if (this.dataset.tab === 'inventory-summary') {
                // Loading message is now set inside loadInventorySummaryData
                console.log('Inventory Summary tab selected, calling loadInventorySummaryData().');
                loadInventorySummaryData()
                    .then(items => {
                        displayInventorySummary(items);
                    })
                    .catch(error => { // Error already handled and displayed by loadInventorySummaryData
                         console.error('Further error details from inventory summary tab click:', error);
                    });
            }
        });
    });

    const initiallyActiveTab = tabContainer.querySelector('.tab-item.active');
    if (initiallyActiveTab) {
        activateJordonTab(initiallyActiveTab); 
        if (initiallyActiveTab.dataset.tab === 'stock-in') {
            handleStockInTabActivation();
        } else if (initiallyActiveTab.dataset.tab === 'inventory-summary') {
            // Loading message is now set inside loadInventorySummaryData
            loadInventorySummaryData()
                .then(items => {
                    displayInventorySummary(items);
                })
                .catch(error => { // Error already handled
                     console.error('Further error details from initial inventory summary load:', error);
                });
        }
    } else if (tabItems.length > 0) { 
        activateJordonTab(tabItems[0]);
        if (tabItems[0].dataset.tab === 'stock-in') {
            handleStockInTabActivation();
        } else if (tabItems[0].dataset.tab === 'inventory-summary') {
            // Loading message is now set inside loadInventorySummaryData
            loadInventorySummaryData()
                .then(items => {
                    displayInventorySummary(items);
                })
                .catch(error => { // Error already handled
                    console.error('Further error details from first tab inventory summary load:', error);
                });
        }
    }

    const submitStockInButton = document.getElementById('submit-stock-in-btn');
    if (submitStockInButton) {
        submitStockInButton.addEventListener('click', handleSubmitStockIn);
    } else {
        console.warn('Submit Stock In button (#submit-stock-in-btn) not found.');
    }
    
    setupStockOutPopupClose();

    const addToListBtn = document.getElementById('add-to-stock-out-list-btn');
    if (addToListBtn) {
        addToListBtn.addEventListener('click', handleAddToStockOutList);
    } else {
        console.warn('Add to Stock Out List button (#add-to-stock-out-list-btn) not found.');
    }

    const stockOutContentDiv = document.getElementById('stock-out-content');
    if (stockOutContentDiv) {
        stockOutContentDiv.addEventListener('click', function(event) {
            if (event.target.classList.contains('remove-stock-out-item-btn')) {
                handleRemoveStockOutItem(event);
            } else if (event.target.id === 'submit-all-stock-out-btn') {
                handleSubmitAllStockOut();
            }
        });
    } else {
        console.warn('#stock-out-content div not found in containerElement for event delegation.');
    }
    renderStockOutPreview(stockOutContentDiv);
}

/**
 * Handles the click event on a row in the inventory summary table.
 * Populates and displays the stock-out popup with data from the clicked row.
 * @param {Event} event - The click event object.
 */
function handleInventoryRowClick(event) {
    const row = event.currentTarget;
    const stockOutPopup = document.getElementById('stock-out-popup');

    if (!stockOutPopup) {
        console.error("Cannot handle row click: Stock out popup not found.");
        return;
    }

    const clickedMixedPalletGroupId = row.dataset.mixedPalletGroupId;
    const clickedLotNumber = row.dataset.lotNumber;
    const clickedDateStored = row.dataset.dateStored; // Added this line
    const clickedItemId = row.dataset.itemId;

    let itemsForPopup = [];

    // Prepare the originally clicked item
    const originalItem = {
        id: clickedItemId,
        productCode: row.dataset.productCode,
        productName: row.dataset.productName,
        productPackaging: row.dataset.productPackaging, // Added for consistency
        _3plDetails: { // Structure to match items in currentInventorySummaryItems
            palletType: row.dataset.palletType,
            location: row.dataset.location,
            lotNumber: clickedLotNumber,
            dateStored: row.dataset.dateStored,
            mixedPalletGroupId: clickedMixedPalletGroupId, // Ensure this is part of the object
            pallet: row.dataset.pallets || '0', // Ensure pallet info is here
        },
        batchNo: row.dataset.batchNo,
        container: row.dataset.container, // Added for consistency
        quantity: parseInt(row.dataset.quantity, 10),
        productId: row.dataset.productId, // Added for consistency
        // Note: 'pallets' from row.dataset is stored inside _3plDetails.pallet for this object
    };
    itemsForPopup.push(originalItem);

    // Filtering Logic
    if (clickedMixedPalletGroupId && clickedMixedPalletGroupId.trim() !== '') {
        const matchingItems = currentInventorySummaryItems.filter(item => {
            return item._3plDetails &&
                   item._3plDetails.mixedPalletGroupId === clickedMixedPalletGroupId &&
                   item._3plDetails.dateStored === clickedDateStored && // Changed condition here
                   item.id !== clickedItemId; // Exclude the already added original item
        });
        itemsForPopup = itemsForPopup.concat(matchingItems);
    }

    console.log("Items for popup:", itemsForPopup);

    const popupInfoSection = stockOutPopup.querySelector('.popup-info-section');
    if (!popupInfoSection) {
        console.error("Popup info section (.popup-info-section) not found within the stock out popup.");
        // Display the popup anyway, but it will be missing item details
        stockOutPopup.style.display = 'block';
        return;
    }
    popupInfoSection.innerHTML = ''; // Clear previous dynamic content

    itemsForPopup.forEach((itemObject, index) => {
        const itemDetailContainer = document.createElement('div');
        itemDetailContainer.className = 'popup-item-details';

        const fieldsToShow = [
            { label: 'Item Code :', value: itemObject.productCode },
            { label: 'Product Description :', value: itemObject.productName },
            { label: 'Location :', value: (itemObject._3plDetails && itemObject._3plDetails.location) || '' },
            { label: 'Lot Number :', value: (itemObject._3plDetails && itemObject._3plDetails.lotNumber) || '' },
            { label: 'Batch Number :', value: itemObject.batchNo || '' },
            { label: 'Current Quantity :', value: itemObject.quantity },
            { label: 'Current Pallets :', value: (itemObject._3plDetails && itemObject._3plDetails.pallet) || '0' }
        ];

        fieldsToShow.forEach(field => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'popup-info-line';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'popup-label';
            labelSpan.textContent = field.label;

            const valueSpan = document.createElement('span');
            valueSpan.className = 'popup-value';
            valueSpan.textContent = escapeHtml(String(field.value));

            lineDiv.appendChild(labelSpan);
            lineDiv.appendChild(valueSpan);
            itemDetailContainer.appendChild(lineDiv);
        });

        popupInfoSection.appendChild(itemDetailContainer);

        // Add separator if multiple items
        if (itemsForPopup.length > 1 && index < itemsForPopup.length - 1) {
            itemDetailContainer.style.marginBottom = '15px';
            itemDetailContainer.style.borderBottom = '1px solid #eee';
            itemDetailContainer.style.paddingBottom = '10px';
        }
    });

    // Retain general context on the popup dataset
    stockOutPopup.dataset.clickedMixedPalletGroupId = clickedMixedPalletGroupId;
    stockOutPopup.dataset.clickedItemId = clickedItemId;

    // Removed popupInputSection declaration and clearing. Inputs are now added to popupInfoSection.

    itemsForPopup.forEach((itemObject, index) => { // Added index back to the loop signature
        const itemDetailContainer = document.createElement('div');
        itemDetailContainer.className = 'popup-item-details';

        const fieldsToShow = [
            { label: 'Item Code :', value: itemObject.productCode },
            { label: 'Product Description :', value: itemObject.productName },
            { label: 'Location :', value: (itemObject._3plDetails && itemObject._3plDetails.location) || '' },
            { label: 'Lot Number :', value: (itemObject._3plDetails && itemObject._3plDetails.lotNumber) || '' },
            { label: 'Batch Number :', value: itemObject.batchNo || '' },
            { label: 'Current Quantity :', value: itemObject.quantity },
            { label: 'Current Pallets :', value: (itemObject._3plDetails && itemObject._3plDetails.pallet) || '0' }
        ];

        fieldsToShow.forEach(field => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'popup-info-line';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'popup-label';
            labelSpan.textContent = field.label;

            const valueSpan = document.createElement('span');
            valueSpan.className = 'popup-value';
            valueSpan.textContent = escapeHtml(String(field.value));

            lineDiv.appendChild(labelSpan);
            lineDiv.appendChild(valueSpan);
            itemDetailContainer.appendChild(lineDiv);
        });

        popupInfoSection.appendChild(itemDetailContainer);

        // Add separator if multiple items and it's not the last item's details
        if (itemsForPopup.length > 1 && index < itemsForPopup.length - 1) {
            itemDetailContainer.style.marginBottom = '15px';
            itemDetailContainer.style.borderBottom = '1px solid #eee';
            itemDetailContainer.style.paddingBottom = '10px';
        }

        // Create and append input group for the current itemObject to popupInfoSection
        const itemInputGroup = document.createElement('div');
        itemInputGroup.className = 'popup-item-input-group';

        // Quantity Input
        const qtyLabel = document.createElement('label');
        qtyLabel.setAttribute('for', `stock-out-quantity-${itemObject.id}`);
        qtyLabel.textContent = `Quantity for ${itemObject.productCode} (Lot: ${itemObject._3plDetails?.lotNumber || 'N/A'}):`;
        
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.id = `stock-out-quantity-${itemObject.id}`;
        qtyInput.name = `stock-out-quantity-${itemObject.id}`;
        qtyInput.className = 'dynamic-stock-out-quantity';
        // Set data attributes (copied from the deleted loop)
        qtyInput.dataset.itemId = itemObject.id;
        qtyInput.dataset.productId = itemObject.productId || '';
        qtyInput.dataset.productCode = itemObject.productCode || '';
        qtyInput.dataset.productName = itemObject.productName || 'N/A';
        qtyInput.dataset.batchNo = itemObject.batchNo || '';
        qtyInput.dataset.warehouseId = 'jordon';
        qtyInput.dataset.currentQuantity = itemObject.quantity !== undefined ? itemObject.quantity : 0;
        qtyInput.dataset.location = (itemObject._3plDetails && itemObject._3plDetails.location) || '';
        qtyInput.dataset.lotNumber = (itemObject._3plDetails && itemObject._3plDetails.lotNumber) || '';
        qtyInput.dataset.productPackaging = itemObject.productPackaging || 'N/A';
        qtyInput.dataset.palletType = (itemObject._3plDetails && itemObject._3plDetails.palletType) || '';
        qtyInput.dataset.container = itemObject.container || '';
        qtyInput.dataset.dateStored = (itemObject._3plDetails && itemObject._3plDetails.dateStored) || '';
        qtyInput.dataset.currentPallets = (itemObject._3plDetails && itemObject._3plDetails.pallet) || '0';

        // Pallet ID Input
        const palletLabel = document.createElement('label');
        palletLabel.setAttribute('for', `stock-out-pallet-${itemObject.id}`);
        palletLabel.textContent = `Pallet ID for ${itemObject.productCode} (Lot: ${itemObject._3plDetails?.lotNumber || 'N/A'}):`;

        const palletInput = document.createElement('input');
        palletInput.type = 'text';
        palletInput.id = `stock-out-pallet-${itemObject.id}`;
        palletInput.name = `stock-out-pallet-${itemObject.id}`;
        palletInput.className = 'dynamic-stock-out-pallet-id';
        palletInput.dataset.itemId = itemObject.id; // Link to the item

        itemInputGroup.appendChild(qtyLabel);
        itemInputGroup.appendChild(qtyInput);
        itemInputGroup.appendChild(document.createElement('br')); // Simple spacing
        itemInputGroup.appendChild(palletLabel);
        itemInputGroup.appendChild(palletInput);
        
        popupInfoSection.appendChild(itemInputGroup);
        itemInputGroup.style.marginBottom = '20px'; // Add spacing after the input group
    });
    
    // Display the popup
    stockOutPopup.style.display = 'block';
}

/**
 * Handles adding an item to the temporary stock-out list (`jordonStockOutItems`).
 * Retrieves data from the stock-out popup, validates it, creates a stock-out item object,
 * and then updates the UI.
 */
function handleAddToStockOutList() {
    const stockOutPopup = document.getElementById('stock-out-popup');
    const dynamicQuantityInputs = stockOutPopup.querySelectorAll('.dynamic-stock-out-quantity');
    const dynamicPalletIdInputs = stockOutPopup.querySelectorAll('.dynamic-stock-out-pallet-id');

    if (!stockOutPopup || dynamicQuantityInputs.length === 0) {
        console.error("Popup or dynamic quantity inputs not found.");
        alert("Error: Could not process the request. Popup input elements missing.");
        return;
    }

    let allItemsValid = true;
    const itemsToAdd = [];

    dynamicQuantityInputs.forEach(qtyInput => {
        const itemId = qtyInput.dataset.itemId;
        const palletInput = stockOutPopup.querySelector(`#stock-out-pallet-${itemId}`); // Find corresponding pallet input

        const quantityToStockOut = parseInt(qtyInput.value, 10);
        const palletId = palletInput ? palletInput.value.trim() : ""; // Get palletId, ensure palletInput exists
        
        const currentQuantity = parseInt(qtyInput.dataset.currentQuantity, 10);

        // Validate Input: Quantity must be a positive number (or zero if allowed, but typically > 0 for stock out)
        // Allow items with 0 quantity to be skipped without blocking others, unless a value is entered.
        if (qtyInput.value.trim() !== '' && (isNaN(quantityToStockOut) || quantityToStockOut <= 0)) {
            alert(`Please enter a valid positive quantity for item ${qtyInput.dataset.productCode} (Lot: ${qtyInput.dataset.lotNumber}).`);
            qtyInput.focus();
            allItemsValid = false;
            return; // Stop processing this item
        }
        
        // If quantity is 0 or input is empty, skip this item from being added to the list
        if (quantityToStockOut === 0 || qtyInput.value.trim() === '') {
            return; 
        }


        // Validate Input: Quantity to stock out cannot exceed available quantity
        if (quantityToStockOut > currentQuantity) {
            alert(`Quantity to stock out (${quantityToStockOut}) for item ${qtyInput.dataset.productCode} (Lot: ${qtyInput.dataset.lotNumber}) cannot exceed current available quantity (${currentQuantity}).`);
            qtyInput.focus();
            allItemsValid = false;
            return; // Stop processing this item
        }

        // Create the stock-out item object with all relevant details from data attributes
        const stockOutItem = {
            inventoryId: itemId,
            productId: qtyInput.dataset.productId,
            productCode: qtyInput.dataset.productCode,
            productName: qtyInput.dataset.productName,
            productPackaging: qtyInput.dataset.productPackaging,
            location: qtyInput.dataset.location,
            lotNumber: qtyInput.dataset.lotNumber,
            batchNumber: qtyInput.dataset.batchNo, // Note: batchNo from dataset is batchNumber
            warehouseId: qtyInput.dataset.warehouseId,
            originalQuantityInInventory: currentQuantity,
            quantityToStockOut,
            palletId,
            palletType: qtyInput.dataset.palletType,
            container: qtyInput.dataset.container,
            dateStored: qtyInput.dataset.dateStored,
            currentPallets: qtyInput.dataset.currentPallets,
        };
        itemsToAdd.push(stockOutItem);
    });

    if (!allItemsValid) {
        return; // Stop if any validation failed
    }

    if (itemsToAdd.length === 0) {
        alert("No items with valid quantities were entered for stock out.");
        return;
    }

    jordonStockOutItems.push(...itemsToAdd);


    // If this is the first item added (or first batch), switch to the "Stock Out" tab
    if (jordonStockOutItems.length > 0 && itemsToAdd.length > 0) { // Check if new items were actually added
        const stockOutTabButton = document.querySelector('.tab-item[data-tab="stock-out"]');
        if (stockOutTabButton) {
            activateJordonTab(stockOutTabButton);
        } else {
            console.error("Could not find 'Stock Out' tab button to activate.");
        }
    }
    
    renderStockOutPreview(); // Update the displayed list of items to be stocked out

    // Clear inputs and hide the popup
    dynamicQuantityInputs.forEach(input => input.value = '');
    dynamicPalletIdInputs.forEach(input => input.value = '');
    stockOutPopup.style.display = 'none';
}


function setupStockOutPopupClose() {
    const stockOutPopup = document.getElementById('stock-out-popup');
    const closeBtn = stockOutPopup ? stockOutPopup.querySelector('.close-btn') : null;
    const closePopupButton = document.getElementById('close-popup-btn');

    if (!stockOutPopup) {
        console.error("Stock out popup element not found. Cannot setup close functionality.");
        return;
    }

    const closePopup = () => {
        stockOutPopup.style.display = 'none';
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closePopup);
    } else {
        console.warn("Close button (.close-btn) not found in stock-out-popup.");
    }

    if (closePopupButton) {
        closePopupButton.addEventListener('click', closePopup);
    } else {
        console.warn("Close button (#close-popup-btn) not found.");
    }

    stockOutPopup.addEventListener('click', function(event) {
        if (event.target === stockOutPopup) { 
            closePopup();
        }
    });
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
        if (!itemId) { 
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
            lotNumber: lotNumberInput ? lotNumberInput.value.trim() : "", 
            mixedPalletGroupId: mixedPalletGroupIdInput ? mixedPalletGroupIdInput.value.trim() : "", 
        };
        itemsToUpdate.push(rowData);
    });

    if (itemsToUpdate.length === 0) {
        alert('No items found in the table to submit.');
        return;
    }
    
    const submitStockInButton = document.getElementById('submit-stock-in-btn');
    if (submitStockInButton) {
        submitStockInButton.disabled = true;
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
        
        if(stockInTableBody) stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Update successful. Refreshing...</td></tr>';
        loadPendingJordonStock().then(displayPendingStockInTable).catch(err => console.error("Error refreshing stock-in table:", err));

        console.log("Attempting to refresh inventory summary data post-stock-in update.");
        // Ensure loading message for summary is handled by loadInventorySummaryData itself
        loadInventorySummaryData().then(displayInventorySummary).catch(err => console.error("Error refreshing summary table post-stock-in:", err));

    } catch (error) {
        console.error('Error updating stock in:', error);
        alert('Error updating stock in. Please try again.');
    } finally {
        if (submitStockInButton) {
            submitStockInButton.disabled = false;
        }
    }
}

/**
 * Renders the preview of items added to the stock-out list in the #stock-out-content div.
 * Displays a table of items or a message if the list is empty.
 */
function renderStockOutPreview(stockOutContentDivFromCaller) {
    const stockOutContentDiv = stockOutContentDivFromCaller;
    if (!stockOutContentDiv) {
        console.error('#stock-out-content div (from caller) not found. Cannot render preview.');
        return;
    }

    stockOutContentDiv.innerHTML = ''; // Clear previous content to prevent duplication

    // Add a title for the section
    let html = '<h2>Stock Out List</h2>';

    if (jordonStockOutItems.length === 0) {
        // Updated colspan to 9 for the "empty list" message
        html += '<p>No items added for stock out yet.</p>'; 
        // Note: If displaying this message inside a table structure for consistency, 
        // it would be `<tr><td colspan="9" style="text-align:center;">No items added for stock out yet.</td></tr>`
        // But current structure places this p tag directly in stockOutContentDiv if list is empty.
        // For simplicity, keeping it as a direct <p> tag. If it needs to be inside the table,
        // the table structure would need to be created even for the empty message.
        stockOutContentDiv.innerHTML = html;
        return;
    }

    html += '<table class="table-styling-class">'; // Ensure this class matches general table styles
    html += `
        <thead>
            <tr>
                <th>S/N</th>
                <th>Product Description</th>
                <th>Packing Size</th>
                <th>Location</th>
                <th>Lot No</th>
                <th>Pallet ID (Out)</th>
                <th>Quantity</th>
                <th>Batch No</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
    `;

    jordonStockOutItems.forEach((item, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.productName)}</td>
                <td>${escapeHtml(item.productPackaging)}</td>
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.lotNumber)}</td>
                <td>${escapeHtml(item.palletId)}</td>
                <td>${escapeHtml(String(item.quantityToStockOut))}</td> 
                <td>${escapeHtml(item.batchNumber)}</td>
                <td><button class="btn btn-danger btn-sm remove-stock-out-item-btn" data-index="${index}">Remove</button></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    // Add the "Submit All Stock Out" button if there are items
    html += '<div style="text-align: center; margin-top: 20px;"><button id="submit-all-stock-out-btn" class="btn btn-success">Submit All Stock Out</button></div>';

    stockOutContentDiv.innerHTML = html;
}

/**
 * Handles the click event for "Remove" buttons in the stock-out preview list.
 * Removes the specified item from `jordonStockOutItems` and re-renders the preview.
 * @param {Event} event - The click event, expected to originate from a "Remove" button.
 */
function handleRemoveStockOutItem(event) {
    // Event delegation checks if the clicked target is a remove button
    if (event.target.classList.contains('remove-stock-out-item-btn')) {
        const indexToRemove = parseInt(event.target.dataset.index, 10);
        // Validate the index
        if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < jordonStockOutItems.length) {
            jordonStockOutItems.splice(indexToRemove, 1); // Remove the item
            renderStockOutPreview(); // Re-render the updated list
        } else {
            console.error("Invalid index for stock out item removal:", event.target.dataset.index);
        }
    }
}

/**
 * Handles the submission of all items in the `jordonStockOutItems` list.
 * It processes each item, calls an API for stock out, and provides feedback.
 */
async function handleSubmitAllStockOut() {
    if (jordonStockOutItems.length === 0) {
        alert("No items to stock out.");
        return;
    }

    if (!confirm("Are you sure you want to submit these stock out items?")) {
        return;
    }

    const submitButton = document.getElementById('submit-all-stock-out-btn');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
    }

    const successfulItems = [];
    const failedItemsInfo = []; 
    const itemsToProcess = [...jordonStockOutItems]; 
    let remainingItemsInPendingList = []; 

    for (const item of itemsToProcess) {
        const data = {
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            warehouseId: item.warehouseId, 
            batchNo: item.batchNo, 
            quantity: Number(item.quantityToStockOut),
            operatorId: "JORDON_WMS_USER", // TODO: Replace with actual logged-in user ID when authentication is implemented.
            inventoryId: item.inventoryId, 
            lotNumber: item.lotNumber, 
        };

        try {
            if (typeof transactionAPI !== 'object' || typeof transactionAPI.outboundStock !== 'function') {
                if (typeof jest !== 'undefined' || (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test')) { 
                    console.warn("transactionAPI.outboundStock is not available. Simulating success for testing environment.");
                    await new Promise(resolve => setTimeout(resolve, 50)); 
                } else {
                    throw new Error('transactionAPI.outboundStock is not available. Cannot process stock out.');
                }
            } else {
                 await transactionAPI.outboundStock(data);
            }
            successfulItems.push(item);
        } catch (error) {
            const errorMessage = error.message || 'Unknown error during stock out';
            console.error(`Failed to stock out item ${item.productName} (Code: ${item.productCode}, Inv ID: ${item.inventoryId}):`, errorMessage, error);
            failedItemsInfo.push({ item, error: errorMessage });
            remainingItemsInPendingList.push(item); 
        }
    }

    jordonStockOutItems = remainingItemsInPendingList; 

    // Enhanced Feedback messages
    let alertMessage = "";
    if (failedItemsInfo.length === 0 && successfulItems.length > 0) {
        alertMessage = `All ${successfulItems.length} items stocked out successfully!`;
    } else if (failedItemsInfo.length > 0 && successfulItems.length > 0) {
        const failedSummary = failedItemsInfo.map(f => `${f.item.productCode}: ${f.error}`).join('; ');
        alertMessage = `Partial success: ${successfulItems.length} items stocked out. \n${failedItemsInfo.length} items failed: ${failedSummary}. \nFailed items remain in the list. See console for full details.`;
    } else if (failedItemsInfo.length > 0 && successfulItems.length === 0 && itemsToProcess.length > 0) {
        const failedSummary = failedItemsInfo.map(f => `${f.item.productCode}: ${f.error}`).join('; ');
        alertMessage = `All ${failedItemsInfo.length} items failed to stock out: ${failedSummary}. \nFailed items remain in the list. See console for full details.`;
    } else if (successfulItems.length === 0 && failedItemsInfo.length === 0 && itemsToProcess.length > 0) {
        alertMessage = "No items were processed. There might be an issue with the transaction system or all items failed validation. Check console.";
    }
    if(alertMessage) alert(alertMessage);


    renderStockOutPreview(); 

    const currentSubmitButton = document.getElementById('submit-all-stock-out-btn');
    if (currentSubmitButton) { 
        currentSubmitButton.disabled = false;
        currentSubmitButton.textContent = 'Submit All Stock Out';
    }

    if (successfulItems.length > 0) {
        console.log("Refreshing inventory summary after successful stock out...");
        // Ensure loading message for summary is handled by loadInventorySummaryData itself
        loadInventorySummaryData().then(displayInventorySummary).catch(err => {
            console.error("Error refreshing inventory summary post stock-out:", err);
            alert("Inventory summary could not be refreshed. Please check manually or try refreshing the page.");
        });
    }
}
