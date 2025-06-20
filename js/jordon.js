// Jordon specific JavaScript

let currentInventorySummaryItems = [];
let jordonStockOutItems = []; // Array to store items added to the stock out list
let mainWarehouses = []; // Array to store main warehouse data

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

function setDefaultWithdrawDate() {
  const withdrawDateInput = document.getElementById('withdraw-date');
  if (withdrawDateInput) {
    const today = new Date();
    const currentDay = today.getDay(); // 0 (Sunday) to 6 (Saturday)
    let defaultWithdrawDate = new Date(today);

    if (currentDay === 6) { // If today is Saturday
      defaultWithdrawDate.setDate(today.getDate() + 2); // Monday
    } else {
      defaultWithdrawDate.setDate(today.getDate() + 1); // Next day
    }

    // Format date as YYYY-MM-DD for the input field
    const year = defaultWithdrawDate.getFullYear();
    const month = String(defaultWithdrawDate.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(defaultWithdrawDate.getDate()).padStart(2, '0');
    withdrawDateInput.value = `${year}-${month}-${day}`;
  } else {
    // This console.warn might be useful if the function is ever called when the input isn't expected to be there.
    // For initJordonTabs, it should be there if jordon.html is loaded.
    console.warn('#withdraw-date input not found when trying to set default date.');
  }
}

function generatePrintableStockOutHTML(formData) {
    const { serialNumber, withdrawDate, collectionTime, items } = formData;

    const wdParts = withdrawDate && typeof withdrawDate === 'string' ? withdrawDate.split('-') : [];
    const formattedWithdrawDate = wdParts.length === 3 ? `${wdParts[2]}/${wdParts[1]}/${wdParts[0]}` : escapeHtml(withdrawDate || '');

    let tableRowsHtml = '';
    items.forEach((item, index) => {
        tableRowsHtml += `
            <tr>
                <td>${escapeHtml(index + 1)}</td>
                <td>${escapeHtml(item.productName)}</td>
                <td>${escapeHtml(item.productPackaging)}</td>
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.lotNumber)}</td>
                <td>${escapeHtml(item.palletId)}</td> 
                <td>${escapeHtml(item.quantityToStockOut)}</td>
                <td>${escapeHtml(item.batchNumber)}</td>
                <td>${escapeHtml(item.destinationWarehouseName)}</td>
            </tr>
        `;
    });

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Jordon Withdraw Form - ${escapeHtml(serialNumber)}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { text-align: center; font-size: 14pt; margin-top: 20px; margin-bottom:20px; }
                hr { border: none; border-top: 1px solid #000; }
                /* .info-header class is not explicitly used in the new top section, but keeping if other elements might use it */
                .info-header { margin-bottom: 20px; text-align: center; } 
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f2f2f2; font-size: 10pt; } /* TH font size can remain 10pt or match TD */
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                td { font-size: 9pt; } /* TD font size set to 9pt */
                .withdraw-date-styled { font-weight: bold; font-size: 11pt; }
                @media print {
                    body { margin: 0.5in; } /* Adjust print margins */
                    .no-print { display: none; } /* Class for elements to hide during print */
                }
            </style>
        </head>
        <body>
            <div style="text-align: left; font-size: 10pt;">
              <strong>利泉食品私人有限公司</strong><br>
              <strong>LI CHUAN FOOD PRODUCTS PTE LTD</strong><br>
              <hr> 
              40 Woodlands Terrace Singapore 738456<br>
              Tel: 65 6755 7688 &nbsp;&nbsp;&nbsp;&nbsp; Fax: 65 6755 6698
            </div>
            <br>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; font-size: 10pt;">
              <div style="text-align: left;">
                <strong>Jordon Food Industries Pte Ltd</strong><br>
                13 Woodlands Loop, Singapore 738284<br>
                Tel : +65 6551 5083 &nbsp;&nbsp;&nbsp;&nbsp; Fax: +65 6257 8660
              </div>
              <!-- S/N, Date, Time block will be inserted by new logic below -->
            </div>
            
            <div style="font-size: 10pt; padding-top: 10px; padding-bottom: 10px;">
              <div style="text-align: right; margin-bottom: 3px;">
                <strong>S/N:</strong> ${escapeHtml(serialNumber)}
              </div>
              <div style="text-align: right; margin-bottom: 3px;">
                <span class="withdraw-date-styled">Withdraw Date : ${formattedWithdrawDate}</span>
              </div>
              <div style="text-align: right;">
                Collection Time : ${escapeHtml(collectionTime)}
              </div>
            </div>

            <h1 style="text-align: center; font-size: 14pt; margin-top: 20px; margin-bottom:20px;">Jordon Withdraw Form</h1>
            
            <table>
                <thead>
                    <tr>
                        <th>S/N</th>
                        <th>Product Name</th>
                        <th>Packing Size</th>
                        <th>Location</th>
                        <th>Lot No</th>
                        <th>Plts</th>
                        <th>Quantity</th>
                        <th>Batch No</th>
                        <th>WH</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
            <div style="margin-top: 50px; font-size: 10pt; display: flex; justify-content: space-around; padding-top: 30px; border-top: 1px solid #000;">
              <div>
                <p>Regards Issued By :</p>
                <p style="margin-top: 40px;">_________________________</p>
              </div>
              <div>
                <p>Collected By :</p>
                <p style="margin-top: 40px;">_________________________</p>
              </div>
              <div>
                <p>Verified By :</p>
                <p style="margin-top: 40px;">_________________________</p>
              </div>
            </div>
        </body>
        </html>
    `;
}

async function getNextSerialNumber() {
    // IMPORTANT CLIENT-SIDE PLACEHOLDER:
    // This client-side serial number generation is NOT ROBUST for production environments
    // with multiple concurrent users. It is prone to race conditions where two users
    // might fetch the same last serial number and generate duplicates.
    // A robust solution requires a server-side atomic counter, typically using a
    // Cloud Function that performs a transaction/atomic increment on a counter.
    try {
        const now = new Date();
        const yearYY = String(now.getFullYear()).slice(-2);
        const prefix = `LCJD${yearYY}-`;

        const db = firebase.firestore();
        const formsRef = db.collection('jordonWithdrawForms');

        // Query for serial numbers starting with the current year's prefix,
        // order by serialNumber descending, and get only the top one.
        const q = formsRef
            .where('serialNumber', '>=', prefix + '0000')
            .where('serialNumber', '<=', prefix + '9999') // Keep query within the current year's possible range
            .orderBy('serialNumber', 'desc')
            .limit(1);

        const querySnapshot = await q.get();

        let nextSequence = 1;
        if (!querySnapshot.empty) {
            const lastSerialNumber = querySnapshot.docs[0].data().serialNumber;
            if (lastSerialNumber && lastSerialNumber.startsWith(prefix)) {
                const lastSequence = parseInt(lastSerialNumber.substring(prefix.length), 10);
                if (!isNaN(lastSequence)) {
                    nextSequence = lastSequence + 1;
                } else {
                    console.warn(`Could not parse sequence from lastSerialNumber: ${lastSerialNumber}`);
                    // Fallback to 1, or handle error more robustly
                }
            } else {
                 console.warn(`Last serial number ${lastSerialNumber} does not match current prefix ${prefix}`);
                 // Fallback to 1 or handle as new year if prefix mismatch implies year change
            }
        }

        const sequenceNNNN = String(nextSequence).padStart(4, '0');
        const newSerialNumber = prefix + sequenceNNNN;

        console.log(`Generated Serial Number: ${newSerialNumber}`);
        return newSerialNumber;

    } catch (error) {
        console.error("Error generating serial number:", error);
        // Consider returning a specific error code or null to indicate failure
        return `ERROR_SN_${new Date().getTime()}`; // Example error string
    }
}


async function loadWarehouseData() {
    try {
        const db = firebase.firestore();
        const warehousesRef = db.collection('warehouses');
        // Query changed to use '3plpick' field instead of 'type'
        const q = warehousesRef.where('3plpick', '==', 'for_3pl_list').where('active', '==', true);
        const snapshot = await q.get();

        if (snapshot.empty) {
            console.log("No active warehouses found for '3plpick' type 'for_3pl_list'.");
            mainWarehouses = []; // Ensure it's empty if no data
        } else {
            mainWarehouses = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name
            }));
            console.log("Loaded warehouses for '3plpick' type 'for_3pl_list':", mainWarehouses);
        }
    } catch (error) {
        console.error("Error loading warehouse data:", error);
        mainWarehouses = []; // Ensure it's empty on error
    }
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

async function initJordonTabs(containerElement) { 
    await loadWarehouseData(); // Load warehouse data first
    console.log("Initializing Jordon tabs and stock-in functionality.");

    setDefaultWithdrawDate(); // Set default withdraw date using the new helper

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
    renderStockOutPreview();

    const stockOutListContainer = document.getElementById('stock-out-list-container');
    if (stockOutListContainer) {
      stockOutListContainer.addEventListener('change', function(event) {
        // Check if the changed element is a warehouse select dropdown
        if (event.target && event.target.classList.contains('warehouse-select')) {
          const newWarehouseId = event.target.value;
          // The data attribute in HTML is 'data-item-inventory-id'
          // In JavaScript dataset, it becomes itemInventoryId (camelCase)
          const inventoryId = event.target.dataset.itemInventoryId; 

          if (!inventoryId) {
              console.warn('Warehouse select change event: itemInventoryId not found on element:', event.target);
              return;
          }

          const itemToUpdate = jordonStockOutItems.find(stockItem => stockItem.inventoryId === inventoryId);
          if (itemToUpdate) {
            itemToUpdate.selectedDestinationWarehouseId = newWarehouseId;
            // Optional: Update name as well for immediate consistency if any UI part depends on it directly from jordonStockOutItems
            // const selectedWarehouse = mainWarehouses.find(wh => wh.id === newWarehouseId);
            // if (selectedWarehouse) {
            //   itemToUpdate.destinationWarehouseName = selectedWarehouse.name;
            // } else {
            //   itemToUpdate.destinationWarehouseName = 'N/A';
            // }
            console.log(`Item ${inventoryId} warehouse changed to: ${newWarehouseId}. Current item state:`, itemToUpdate); // For debugging
            console.log('Current jordonStockOutItems:', jordonStockOutItems); // For debugging
          } else {
            console.warn(`Could not find item with inventoryId ${inventoryId} in jordonStockOutItems to update warehouse selection.`);
          }
        }
      });
      console.log('Event listener for warehouse select changes has been set up on stockOutListContainer.');
    } else {
      console.warn('#stock-out-list-container not found when trying to set up warehouse select event listener.');
    }
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
        // itemInputGroup.style.marginBottom = '20px'; // Add spacing after the input group - Replaced by separator logic

        // Add separator for the entire item block (details + inputs) if multiple items
        if (itemsForPopup.length > 1 && index < itemsForPopup.length - 1) {
            itemInputGroup.style.paddingBottom = '15px';
            itemInputGroup.style.marginBottom = '15px';
            itemInputGroup.style.borderBottom = '1px solid #ccc';
        }
    });
    
    // Retain general context on the popup dataset
    stockOutPopup.dataset.clickedMixedPalletGroupId = clickedMixedPalletGroupId;
    stockOutPopup.dataset.clickedItemId = clickedItemId;
    
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
            selectedDestinationWarehouseId: null, // Initialize with null
        };

        // Default to the first main warehouse if available
        if (mainWarehouses && mainWarehouses.length > 0) {
            stockOutItem.selectedDestinationWarehouseId = mainWarehouses[0].id;
        }
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
function renderStockOutPreview() {
    const stockOutListContainer = document.getElementById('stock-out-list-container');
    if (!stockOutListContainer) {
        console.error('#stock-out-list-container div not found. Cannot render preview.');
        return;
    }

    stockOutListContainer.innerHTML = ''; // Clear previous content to prevent duplication

    // Add a title for the section (This h2 is now part of static HTML, if needed, it should be there)
    // let html = '<h2>Stock Out List</h2>'; // This was part of the dynamic HTML, but stock-out-list-container is for the table itself

    if (jordonStockOutItems.length === 0) {
        stockOutListContainer.innerHTML = '<p>No items added for stock out yet.</p>';
        return;
    }

    let html = '<table class="table-styling-class">'; // Ensure this class matches general table styles
    html += `
        <thead>
            <tr>
                <th>S/N</th>
                <th>Product Description</th>
                <th>Packing Size</th>
                <th>Location</th>
                <th>Lot No</th>
                <th>Pallet ID (Out)</th>
                <th>Warehouse</th>
                <th>Quantity</th>
                <th>Batch No</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
    `;

    jordonStockOutItems.forEach((item, index) => {
        let warehouseOptionsHtml = '';
        if (mainWarehouses && mainWarehouses.length > 0) {
            mainWarehouses.forEach(warehouse => {
                const isSelected = item.selectedDestinationWarehouseId === warehouse.id;
                warehouseOptionsHtml += `<option value="${escapeHtml(warehouse.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(warehouse.name)}</option>`;
            });
        } else {
            warehouseOptionsHtml = '<option value="" disabled selected>No warehouses</option>';
        }

        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.productName)}</td>
                <td>${escapeHtml(item.productPackaging)}</td>
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.lotNumber)}</td>
                <td>${escapeHtml(item.palletId)}</td>
                <td><select class="form-control form-control-sm warehouse-select" data-item-inventory-id="${escapeHtml(item.inventoryId)}">${warehouseOptionsHtml}</select></td>
                <td>${escapeHtml(String(item.quantityToStockOut))}</td> 
                <td>${escapeHtml(item.batchNumber)}</td>
                <td><button class="btn btn-danger btn-sm remove-stock-out-item-btn" data-index="${index}">Remove</button></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    // Add the "Submit All Stock Out" button if there are items
    html += '<div style="text-align: center; margin-top: 20px;"><button id="submit-all-stock-out-btn" class="btn btn-success">Submit All Stock Out</button></div>';

    stockOutListContainer.innerHTML = html;
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
    const submitButton = document.getElementById('submit-all-stock-out-btn');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Generating Print...'; // Optional text change
    }

    try {
        if (jordonStockOutItems.length === 0) {
            alert("No items to stock out.");
            return; // Return early, but finally block will still execute
        }

        const printableItems = jordonStockOutItems.map((item, index) => {
      let destinationWarehouseName = 'N/A';
      if (item.selectedDestinationWarehouseId && mainWarehouses && mainWarehouses.length > 0) {
        const foundWarehouse = mainWarehouses.find(wh => wh.id === item.selectedDestinationWarehouseId);
        if (foundWarehouse) {
          destinationWarehouseName = foundWarehouse.name;
        }
      }
      return {
        serialNumber: index + 1,
        productName: item.productName || 'N/A',
        productPackaging: item.productPackaging || 'N/A', // For Packing Size
        location: item.location || 'N/A',
        lotNumber: item.lotNumber || 'N/A',
        palletId: item.palletId || 'N/A', // For Pallet ID (Out)
        destinationWarehouseName: destinationWarehouseName,
        quantityToStockOut: item.quantityToStockOut || 0,
        batchNumber: item.batchNumber || 'N/A'
        // Add other fields if they are part of jordonStockOutItems and needed for print
        // e.g., productCode: item.productCode || 'N/A'
      };
    });

    // For verification during development, log this array.
    // This console.log should be removed after the print functionality is complete.
    console.log('Printable Items (for potential print):', printableItems);

    // Get New Field Values
    const withdrawDateInput = document.getElementById('withdraw-date');
    const collectionTimeInput = document.getElementById('collection-time');
    const withdrawDate = withdrawDateInput ? withdrawDateInput.value : '';
    const collectionTime = collectionTimeInput ? collectionTimeInput.value : '';

    // Validation (Basic)
    if (!withdrawDate) {
        alert("Withdraw Date is required.");
        // Button is re-enabled in finally block
        return;
    }

    // Get Serial Number
    const serialNumber = await getNextSerialNumber();
    if (!serialNumber || serialNumber.startsWith('ERROR_SN_')) {
        alert("Could not generate serial number. Please try again. Error: " + serialNumber);
        // Button is re-enabled in finally block
        return;
    }

    // Construct Firestore Object
    const formData = {
        serialNumber: serialNumber,
        withdrawDate: withdrawDate,
        collectionTime: collectionTime,
        status: "Pending", // Default status
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        items: jordonStockOutItems.map(item => ({
            inventoryId: item.inventoryId,
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            productPackaging: item.productPackaging,
            location: item.location,
            lotNumber: item.lotNumber,
            batchNumber: item.batchNumber,
            quantityToStockOut: item.quantityToStockOut,
            palletId: item.palletId || 'N/A', // Ensure palletId is included from jordonStockOutItems
            selectedDestinationWarehouseId: item.selectedDestinationWarehouseId,
            // Resolve destinationWarehouseName at the time of saving
            destinationWarehouseName: (mainWarehouses.find(wh => wh.id === item.selectedDestinationWarehouseId)?.name) || 'N/A'
        })),
        // createdByUserId: firebase.auth().currentUser ? firebase.auth().currentUser.uid : null // Example if auth is used
    };

    // Save to Firestore
    const db = firebase.firestore();
    await db.collection('jordonWithdrawForms').add(formData);
    alert('Withdraw Form saved successfully! Serial Number: ' + serialNumber);

    // --- Print Logic (Moved to after successful save) ---
    // Now formData itself contains all necessary fields for its items, including palletId
    const printableHTML = generatePrintableStockOutHTML(formData);
    const printWindow = window.open('', '_blank', 'height=600,width=800');

    if (printWindow) {
        printWindow.document.write(printableHTML);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    } else {
        alert('Could not open print window. Please check your browser pop-up blocker settings.');
    }
    // --- End Print Logic ---

    // Clear Form and UI
    jordonStockOutItems = [];
    renderStockOutPreview();
    if (collectionTimeInput) collectionTimeInput.value = '';
    setDefaultWithdrawDate(); // Reset withdraw date to default

    // if (!confirm("Are you sure you want to submit these stock out items?")) {
    //     return;
    // }

    // const submitButton = document.getElementById('submit-all-stock-out-btn');
    // if (submitButton) {
    //     submitButton.disabled = true;
    //     submitButton.textContent = 'Processing...';
    // }

    // const successfulItems = [];
    // const failedItemsInfo = []; 
    // const itemsToProcess = [...jordonStockOutItems]; 
    // let remainingItemsInPendingList = []; 

    // for (const item of itemsToProcess) {
    //     const data = {
    //         productId: item.productId,
    //         productCode: item.productCode,
    //         productName: item.productName,
    //         warehouseId: item.warehouseId, 
    //         batchNo: item.batchNo, 
    //         quantity: Number(item.quantityToStockOut),
    //         operatorId: "JORDON_WMS_USER", // TODO: Replace with actual logged-in user ID when authentication is implemented.
    //         inventoryId: item.inventoryId, 
    //         lotNumber: item.lotNumber, 
    //     };

    //     try {
    //         if (typeof transactionAPI !== 'object' || typeof transactionAPI.outboundStock !== 'function') {
    //             if (typeof jest !== 'undefined' || (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test')) { 
    //                 console.warn("transactionAPI.outboundStock is not available. Simulating success for testing environment.");
    //                 await new Promise(resolve => setTimeout(resolve, 50)); 
    //             } else {
    //                 throw new Error('transactionAPI.outboundStock is not available. Cannot process stock out.');
    //             }
    //         } else {
    //              await transactionAPI.outboundStock(data);
    //         }
    //         successfulItems.push(item);
    //     } catch (error) {
    //         const errorMessage = error.message || 'Unknown error during stock out';
    //         console.error(`Failed to stock out item ${item.productName} (Code: ${item.productCode}, Inv ID: ${item.inventoryId}):`, errorMessage, error);
    //         failedItemsInfo.push({ item, error: errorMessage });
    //         remainingItemsInPendingList.push(item); 
    //     }
    // }

    // jordonStockOutItems = remainingItemsInPendingList; 

    // // Enhanced Feedback messages
    // let alertMessage = "";
    // if (failedItemsInfo.length === 0 && successfulItems.length > 0) {
    //     alertMessage = `All ${successfulItems.length} items stocked out successfully!`;
    // } else if (failedItemsInfo.length > 0 && successfulItems.length > 0) {
    //     const failedSummary = failedItemsInfo.map(f => `${f.item.productCode}: ${f.error}`).join('; ');
    //     alertMessage = `Partial success: ${successfulItems.length} items stocked out. \n${failedItemsInfo.length} items failed: ${failedSummary}. \nFailed items remain in the list. See console for full details.`;
    // } else if (failedItemsInfo.length > 0 && successfulItems.length === 0 && itemsToProcess.length > 0) {
    //     const failedSummary = failedItemsInfo.map(f => `${f.item.productCode}: ${f.error}`).join('; ');
    //     alertMessage = `All ${failedItemsInfo.length} items failed to stock out: ${failedSummary}. \nFailed items remain in the list. See console for full details.`;
    // } else if (successfulItems.length === 0 && failedItemsInfo.length === 0 && itemsToProcess.length > 0) {
    //     alertMessage = "No items were processed. There might be an issue with the transaction system or all items failed validation. Check console.";
    // }
    // if(alertMessage) alert(alertMessage);


    // renderStockOutPreview(); 

    // const currentSubmitButton = document.getElementById('submit-all-stock-out-btn');
    // if (currentSubmitButton) { 
    //     currentSubmitButton.disabled = false;
    //     currentSubmitButton.textContent = 'Submit All Stock Out';
    // }

    // if (successfulItems.length > 0) {
    //     console.log("Refreshing inventory summary after successful stock out...");
    //     // Ensure loading message for summary is handled by loadInventorySummaryData itself
    //     loadInventorySummaryData().then(displayInventorySummary).catch(err => {
    //         console.error("Error refreshing inventory summary post stock-out:", err);
    //         alert("Inventory summary could not be refreshed. Please check manually or try refreshing the page.");
    //     });
    // }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit All Stock Out'; // Optional: revert text
        }
    }
}
