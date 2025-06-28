// --- Module-Level State ---
const shipmentModuleState = {
    allExtractedData: {},
    viewDefinitions: [ 
        { name: 'Jordon',    displayName: 'Jordon',    columns: ['A', 'B', 'C'], filterColumnLetter: 'C' },
        { name: 'Lineage',   displayName: 'Lineage',   columns: ['A', 'B', 'D'], filterColumnLetter: 'D' },
        { name: 'Blk15',     displayName: 'Blk15',     columns: ['A', 'B', 'E'], filterColumnLetter: 'E' },
        { name: 'Coldroom6', displayName: 'Coldroom 6',columns: ['A', 'B', 'F'], filterColumnLetter: 'F' },
        { name: 'Coldroom5', displayName: 'Coldroom 5',columns: ['A', 'B', 'G'], filterColumnLetter: 'G' }
    ],
    isInitialized: false, 
    currentResultsContainer: null, 
    currentShipmentTabNav: null,
    updateInventoryBtn: null 
  };
  
  // --- Helper Functions ---
  function getColumnIndex(letter) {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
        index = index * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }
  
  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

function reformatDateToDDMMYYYY(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr; 
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        let [month, day, year] = parts;
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');
        if (year.length === 2) {
            year = '20' + year;
        } else if (year.length === 4) {
            // keep as is
        } else {
             return dateStr;
        }
        return `${day}/${month}/${year}`;
    }
    return dateStr; 
}

async function lookupOrCreateProduct(itemCode, excelProductDescription, excelPackingSize, isOnline, firestoreBatchForOnlineAdds = null) {
    if (!itemCode) {
        console.warn("lookupOrCreateProduct: itemCode is missing.");
        return { productName: excelProductDescription, packingSize: excelPackingSize, isNew: false, error: 'Missing itemCode', productId: null };
    }

    if (!window.productAPI) {
        console.error("lookupOrCreateProduct: productAPI is not available.");
        return { productName: excelProductDescription, packingSize: excelPackingSize, isNew: false, error: 'productAPI not available', productId: null };
    }

    try {
        let product = await window.productAPI.getProductByCode(itemCode);

        if (product) {
            return {
                productId: product.id,
                productName: product.name || excelProductDescription,
                packingSize: product.packaging || excelPackingSize,
                isNew: false
            };
        } else {
            const newProductData = {
                productCode: itemCode,
                name: excelProductDescription,
                packaging: excelPackingSize
            };

            if (isOnline && firestoreBatchForOnlineAdds && window.db) { 
                console.log("lookupOrCreateProduct: Online - adding product directly to Firestore batch.");
                const productsRef = window.db.collection('products');
                const newProductRef = productsRef.doc(); 
                firestoreBatchForOnlineAdds.set(newProductRef, {
                    ...newProductData,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const productForIDB = { ...newProductData, id: newProductRef.id, createdAt: new Date().toISOString() };
                // No need to await this if it's just for cache consistency and main flow depends on FS batch
                window.indexedDBManager.updateItem(window.indexedDBManager.STORE_NAMES.PRODUCTS, productForIDB)
                    .catch(err => console.error("Error updating IDB for new product in batch:", err));
                return {
                    productId: newProductRef.id,
                    productName: excelProductDescription,
                    packingSize: excelPackingSize,
                    isNew: true
                };
            } else { // Handles both offline, and online without a pre-existing batch
                console.log(`lookupOrCreateProduct: ${isOnline ? 'Online (no batch)' : 'Offline'} - using productAPI.addProduct.`);
                const addedProduct = await window.productAPI.addProduct(newProductData); 
                return {
                    productId: addedProduct.id, 
                    productName: addedProduct.name,
                    packingSize: addedProduct.packaging,
                    isNew: true,
                    isLocal: !isOnline // Flag if it's a locally created (queued) product
                };
            }
        }
    } catch (error) {
        console.error(`Error in lookupOrCreateProduct for itemCode ${itemCode}:`, error);
        return {
            productName: excelProductDescription,
            packingSize: excelPackingSize,
            isNew: false,
            error: `Product API error: ${error.message}`,
            productId: null
        };
    }
}

async function getWarehouseInfo(db, viewDisplayName) {
    let firestoreWarehouseId = '';
    switch (viewDisplayName) {
        case 'Jordon': firestoreWarehouseId = 'jordon'; break;
        case 'Lineage': firestoreWarehouseId = 'lineage'; break;
        case 'Blk15': firestoreWarehouseId = 'blk15'; break;
        case 'Coldroom 6': firestoreWarehouseId = 'coldroom6'; break;
        case 'Coldroom 5': firestoreWarehouseId = 'coldroom5'; break;
        default:
            return { firestoreWarehouseId: viewDisplayName.toLowerCase().replace(/\s+/g, ''), warehouseType: 'unknown', error: `No mapping for view: ${viewDisplayName}` };
    }

    if (!db) return { firestoreWarehouseId, warehouseType: 'unknown', error: 'Firestore db instance not provided to getWarehouseInfo' };
    
    const warehouseRef = db.collection('warehouses').doc(firestoreWarehouseId);
    try {
        const warehouseDoc = await warehouseRef.get();
        if (warehouseDoc.exists) {
            const warehouseData = warehouseDoc.data();
            return { firestoreWarehouseId, warehouseType: warehouseData.type || 'unknown' };
        } else {
            return { firestoreWarehouseId, warehouseType: 'not_found', error: `Warehouse doc ${firestoreWarehouseId} not found` };
        }
    } catch (error) {
        return { firestoreWarehouseId, warehouseType: 'error', error: `Error fetching warehouse ${firestoreWarehouseId}: ${error.message}` };
    }
}

// ... (extractJordonData, extractDataForView, displayExtractedData, getActiveViewName, handleCellEdit, handleRowRemoveClick remain unchanged for now)
// Assume they are correctly defined as in the previous version. I'll skip pasting them here for brevity
// but they are part of this file.

function extractJordonData(jordonSheet, sheet1LookupMap) {
    const extractedItems = [];
    if (!jordonSheet) return extractedItems;
    const jordonSheetData = XLSX.utils.sheet_to_json(jordonSheet, { header: 1, defval: '' });
    for (let rowIndex = 14; rowIndex < jordonSheetData.length; rowIndex++) {
        const row = jordonSheetData[rowIndex];
        if (!row) continue; 
        const productDescription = row[2] ? String(row[2]).trim() : "";
        if (productDescription === "") break;
        const itemCode = row[8] ? String(row[8]).trim() : "";
        const packingSize = row[3] ? String(row[3]).trim() : "";
        let batchNo = "";
        const batchNoCellAddress = 'G' + (rowIndex + 1); 
        const batchNoCell = jordonSheet[batchNoCellAddress];
        if (batchNoCell && batchNoCell.w) {
            batchNo = String(batchNoCell.w).trim();
            batchNo = reformatDateToDDMMYYYY(batchNo);
        } else if (batchNoCell && batchNoCell.v !== undefined) {
            let potentialDateStr = String(batchNoCell.v).trim();
            if (potentialDateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
                 batchNo = reformatDateToDDMMYYYY(potentialDateStr);
            } else {
                 batchNo = potentialDateStr; 
            }
        }
        const quantity = row[5] ? String(row[5]).trim() : ""; 
        let rawPalletValueFromCell;
        if (row[4] === 0) { 
            rawPalletValueFromCell = "0";
        } else if (row[4]) { 
            rawPalletValueFromCell = String(row[4]).trim();
        } else { 
            rawPalletValueFromCell = "";
        }
        let pallet = rawPalletValueFromCell; 
        const indexOfX = rawPalletValueFromCell.indexOf('x');
        if (indexOfX > -1) { 
            pallet = rawPalletValueFromCell.substring(indexOfX + 1).trim();
        }
        const item = { itemCode, productDescription, packingSize, batchNo, quantity, pallet, excelRowNumber: rowIndex + 1 };
        extractedItems.push(item);
    }
    return extractedItems;
}
  
function extractDataForView(sheetData, viewConfig, sheet1LookupMap) {
    const viewResults = [];
    if (!sheetData || sheetData.length === 0) return viewResults;
    const itemCodeColIndexInConvert = getColumnIndex(viewConfig.columns[0]);
    const descriptionColIndexInConvert = getColumnIndex(viewConfig.columns[1]);
    const quantityColIndexInConvert = getColumnIndex(viewConfig.columns[2]);
    const filterColumnIndex = getColumnIndex(viewConfig.filterColumnLetter);
    for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row) continue;
        const itemCodeValue = row[itemCodeColIndexInConvert];
        const preppedItemCodeForCheck = (itemCodeValue === null || itemCodeValue === undefined) ? "" : String(itemCodeValue).trim();
        if (preppedItemCodeForCheck === '0') break;
        const itemCodeString = String(itemCodeValue || '').trim();
        const filterValueRaw = row[filterColumnIndex];
        const filterValueNumeric = parseFloat(filterValueRaw);
        if (!isNaN(filterValueNumeric) && filterValueNumeric !== 0) {
            const productDescriptionValue = row[descriptionColIndexInConvert];
            const quantityValue = row[quantityColIndexInConvert];
            const enrichmentData = sheet1LookupMap.get(itemCodeString);
            const packingSizeValue = enrichmentData ? enrichmentData.packingSize : '';
            const batchNoValue = enrichmentData ? enrichmentData.batchNo : '';
            viewResults.push({
                itemCode: itemCodeValue !== undefined ? itemCodeValue : '',
                productDescription: productDescriptionValue !== undefined ? productDescriptionValue : '',
                quantity: quantityValue !== undefined ? quantityValue : '',
                packingSize: packingSizeValue,
                batchNo: batchNoValue
            });
        }
    }
    return viewResults;
}
  
function displayExtractedData(data) {
    const shipmentDetailsContainer = document.getElementById('shipmentDetailsContainer');
    if (shipmentDetailsContainer) {
        let detailsHtml = '';
        if (shipmentModuleState.containerNumber) detailsHtml += `<p>Container Number: ${escapeHtml(shipmentModuleState.containerNumber)}</p>`;
        if (shipmentModuleState.storedDate) detailsHtml += `<p>Stored Date: ${escapeHtml(shipmentModuleState.storedDate)}</p>`;
        shipmentDetailsContainer.innerHTML = detailsHtml;
    }
    const resultsEl = shipmentModuleState.currentResultsContainer;
    if (!resultsEl) return;
    let html = '';
    if (!data || data.length === 0) {
        html += '<p>No data to display for this view.</p>';
    } else {
        const activeViewName = getActiveViewName();
        let headers = ['Item Code', 'Product Description', 'Packing Size', 'Batch No', 'Quantity'];
        let currentDataKeys = ['itemCode', 'productDescription', 'packingSize', 'batchNo', 'quantity'];
        if (activeViewName === 'Jordon') {
            headers.splice(headers.indexOf('Quantity') + 1, 0, 'Pallet');
            currentDataKeys.splice(currentDataKeys.indexOf('quantity') + 1, 0, 'pallet');
        }
        headers.push('Remove');
        html += '<table border="1"><thead><tr>';
        headers.forEach(h => {
            let thClass = '';
            if (h === 'Product Description') {
                thClass = ' class="product-description-col"';
            }
            html += `<th${thClass}>${escapeHtml(h)}</th>`;
        });
        html += '</tr></thead><tbody>';
        data.forEach((item, rowIndex) => {
            html += `<tr data-row-index="${rowIndex}">`;
            currentDataKeys.forEach(key => {
                const value = item[key] !== undefined ? item[key] : '';
                let tdClass = '';
                if (key === 'productDescription') {
                    tdClass = ' class="product-description-col"';
                }
                html += `<td${tdClass}><input type="text" class="editable-cell-input" data-row-index="${rowIndex}" data-column-key="${escapeHtml(key)}" value="${escapeHtml(value)}"></td>`;
            });
            html += `<td><button class="remove-row-btn" data-row-index="${rowIndex}">X</button></td>`;
            html += '</tr>';
        });
        html += '</tbody>';

        // Calculate totals
        let totalQuantity = 0;
        let totalPallets = 0;

        data.forEach(item => {
            totalQuantity += parseFloat(item.quantity || 0);
            if (activeViewName === 'Jordon' && item.pallet !== undefined) {
                totalPallets += parseFloat(item.pallet || 0);
            }
        });

        html += '<tfoot><tr>';

        const quantityColIdx = currentDataKeys.indexOf('quantity');
        const palletColIdx = activeViewName === 'Jordon' ? currentDataKeys.indexOf('pallet') : -1;

        // Create an array for footer cells, initialize with empty strings
        const numFooterCells = currentDataKeys.length + 1; // +1 for the remove column placeholder
        const footerCells = new Array(numFooterCells).fill('<td></td>'); 

        // Place "Total Quantity"
        if (quantityColIdx !== -1) {
            let qtyLabelPlaced = false;
            // Try to place label in 'Batch No' column if it exists and is before 'Quantity'
            const batchNoColIdx = currentDataKeys.indexOf('batchNo');
            if (batchNoColIdx !== -1 && batchNoColIdx < quantityColIdx) {
                footerCells[batchNoColIdx] = `<td><strong>Total Quantity:</strong></td>`;
                qtyLabelPlaced = true;
            } else if (quantityColIdx > 0) { // Else, try to place label in the cell immediately to the left of 'Quantity'
                 footerCells[quantityColIdx - 1] = `<td><strong>Total Quantity:</strong></td>`;
                 qtyLabelPlaced = true;
            }
            // Value always goes under the 'Quantity' column header
            footerCells[quantityColIdx] = `<td><strong>${totalQuantity.toLocaleString()}</strong></td>`;
            
            if (!qtyLabelPlaced) { // If 'Quantity' is the first column, combine label and value
                footerCells[quantityColIdx] = `<td><strong>Total Quantity: ${totalQuantity.toLocaleString()}</strong></td>`;
            }
        }

        // Place "Total Pallets" for Jordon view
        if (palletColIdx !== -1) { // Jordon view and pallet column exists
            let palletLabelPlaced = false;
            // Try to place label in 'Packing Size' column if it exists, is before 'Pallet', and cell is empty
            const packingSizeColIdx = currentDataKeys.indexOf('packingSize');
            if (packingSizeColIdx !== -1 && packingSizeColIdx < palletColIdx && footerCells[packingSizeColIdx] === '<td></td>') {
                footerCells[packingSizeColIdx] = `<td><strong>Total Pallets:</strong></td>`;
                palletLabelPlaced = true;
            } else if (palletColIdx > 0 && footerCells[palletColIdx - 1] === '<td></td>') { // Else, try cell to the left if empty
                 footerCells[palletColIdx - 1] = `<td><strong>Total Pallets:</strong></td>`;
                 palletLabelPlaced = true;
            }
            // Value always goes under the 'Pallet' column header
            footerCells[palletColIdx] = `<td><strong>${totalPallets.toLocaleString()}</strong></td>`;

            if (!palletLabelPlaced) { // If no suitable empty cell for label, or 'Pallet' is first column, combine
                footerCells[palletColIdx] = `<td><strong>Total Pallets: ${totalPallets.toLocaleString()}</strong></td>`;
            }
        }
        
        html += footerCells.join('');
        html += '</tr></tfoot></table>';
    }
    resultsEl.innerHTML = html;
}
  
function getActiveViewName() {
    const tabNavEl = shipmentModuleState.currentShipmentTabNav;
    if (!tabNavEl) return shipmentModuleState.viewDefinitions.length > 0 ? shipmentModuleState.viewDefinitions[0].name : null;
    const activeTab = tabNavEl.querySelector('.active-tab');
    return (activeTab && activeTab.dataset.viewName) ? activeTab.dataset.viewName : (shipmentModuleState.viewDefinitions.length > 0 ? shipmentModuleState.viewDefinitions[0].name : null);
}
  
function handleCellEdit(event) {
    if (event.target.classList.contains('editable-cell-input')) {
        const rowIndex = parseInt(event.target.dataset.rowIndex, 10);
        const columnKey = event.target.dataset.columnKey;
        const newValue = event.target.value;
        const activeViewName = getActiveViewName();
        if (activeViewName && shipmentModuleState.allExtractedData[activeViewName] && shipmentModuleState.allExtractedData[activeViewName][rowIndex]) {
            shipmentModuleState.allExtractedData[activeViewName][rowIndex][columnKey] = newValue;
        }
    }
}
  
function handleRowRemoveClick(event) {
    if (event.target.classList.contains('remove-row-btn')) {
        const rowIndex = parseInt(event.target.dataset.rowIndex, 10);
        const activeViewName = getActiveViewName();
        if (activeViewName && shipmentModuleState.allExtractedData[activeViewName]) {
            shipmentModuleState.allExtractedData[activeViewName].splice(rowIndex, 1);
            displayExtractedData(shipmentModuleState.allExtractedData[activeViewName]);
            updateButtonState(); 
        }
    }
}

async function _processShipmentDataOnline(allExtractedData, containerNumber, storedDate) {
    if (typeof firebase === 'undefined' || typeof firebase.firestore === 'undefined') {
        throw new Error('Firebase service is not available.');
    }
    const db = firebase.firestore();
    const batch = db.batch();
    let totalItemsToUpdate = 0;

    for (const viewDef of shipmentModuleState.viewDefinitions) {
        const viewName = viewDef.name;
        const viewDisplayName = viewDef.displayName;
        const dataForThisView = allExtractedData[viewName];

        if (dataForThisView && dataForThisView.length > 0) {
            for (const item of dataForThisView) {
                const currentItemCode = String(item.itemCode || '').trim();
                if (!currentItemCode) {
                    console.warn("Skipping item with empty productCode:", item, "for view:", viewDisplayName);
                    continue;
                }

                const productInfo = await lookupOrCreateProduct(
                    currentItemCode,
                    String(item.productDescription || '').trim(),
                    String(item.packingSize || '').trim(),
                    true, batch 
                );

                if (productInfo.error) console.warn(`Error processing product ${currentItemCode}: ${productInfo.error}.`);
                
                const warehouseDetails = await getWarehouseInfo(db, viewDisplayName);
                if (warehouseDetails.error) console.warn(`[${viewName}] Item: ${currentItemCode}, Warehouse details error: ${warehouseDetails.error}.`);

                const inventoryDoc = {
                    productId: productInfo.productId || null,
                    productCode: currentItemCode,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    quantity: Number(item.quantity || 0),
                    warehouseId: warehouseDetails.firestoreWarehouseId,
                    container: containerNumber || "",
                    batchNo: String(item.batchNo || '').trim()
                };

                if (warehouseDetails.warehouseType === '3pl') {
                    inventoryDoc._3plDetails = {
                        status: "pending", lotNumber: "", palletType: "pending",
                        location: "", dateStored: storedDate || ""
                    };
                    if (viewName === 'Jordon' && item.pallet !== undefined) {
                        let numPallet = Number(String(item.pallet || '0').trim());
                        inventoryDoc._3plDetails.pallet = isNaN(numPallet) ? 0 : numPallet;
                    }
                }
                if (viewName === 'Jordon' && item.hasOwnProperty('excelRowNumber')) {
                    inventoryDoc.excelRowNumber = item.excelRowNumber;
                }
                
                const newInventoryDocRef = db.collection('inventory').doc();
                batch.set(newInventoryDocRef, inventoryDoc);
                totalItemsToUpdate++;

                const operatorName = sessionStorage.getItem('loggedInUser') || 'system_excel_import';
                const transactionDoc = {
                    productId: productInfo.productId || null, 
                    productCode: inventoryDoc.productCode,
                    productName: productInfo.productName, 
                    warehouseId: inventoryDoc.warehouseId,
                    quantity: inventoryDoc.quantity,
                    batchNo: inventoryDoc.batchNo,
                    transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
                    type: 'inbound', operatorId: operatorName, 
                };
                const newTransactionDocRef = db.collection('transactions').doc();
                batch.set(newTransactionDocRef, transactionDoc);
            }
        }
    }
  
    if (totalItemsToUpdate === 0) {
        console.log('_processShipmentDataOnline: No data to update.');
        return { success: true, message: 'No data to update.', itemsUpdated: 0 };
    }
  
    await batch.commit();
    return { success: true, message: `Successfully updated inventory for ${totalItemsToUpdate} items.`, itemsUpdated: totalItemsToUpdate };
}
  
async function handleUpdateInventoryClick() {
    const btn = shipmentModuleState.updateInventoryBtn;
    const resultsEl = shipmentModuleState.currentResultsContainer;
    clearAllPageMessages(); // Clear previous messages

    // Validate for blank item codes
    let firstBlankItemCodeView = null;
    let blankItemCodeFound = false;
    for (const viewName in shipmentModuleState.allExtractedData) {
        const dataForView = shipmentModuleState.allExtractedData[viewName];
        if (dataForView && dataForView.some(item => !(item.itemCode && String(item.itemCode).trim()))) {
            blankItemCodeFound = true;
            firstBlankItemCodeView = shipmentModuleState.viewDefinitions.find(v => v.name === viewName)?.displayName || viewName;
            break;
        }
    }

    if (blankItemCodeFound) {
        const message = `Error: One or more items in the '${firstBlankItemCodeView}' view (and possibly others) have a blank Item Code. Please correct this before updating inventory.`;
        displayPageMessage(message, 'error');
        // Restore the currently active view's display - this might not be necessary if the table is still visible
        // const activeViewName = getActiveViewName();
        // if (activeViewName && shipmentModuleState.allExtractedData[activeViewName]) {
        //     displayExtractedData(shipmentModuleState.allExtractedData[activeViewName]);
        // } else if (resultsEl) { 
        //     resultsEl.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>';
        // }
        if (btn) btn.disabled = false; // Re-enable the button
        return; // Stop processing
    }
  
    if (btn) btn.disabled = true;
    // Display processing message using the new system, perhaps as 'info' type.
    // For now, let's keep the resultsEl update for this specific "Processing..." message,
    // as it's more of a status update within the results area.
    // Or, we could use: displayPageMessage('Processing shipment... Please wait.', 'info');
    if (resultsEl) resultsEl.innerHTML = `<p>Processing shipment... Please wait.</p>`; 
    else console.log(`Processing shipment... Please wait.`);


    const isOnline = navigator.onLine;

    if (!isOnline) {
        console.log("Offline: Queuing shipment file data for processing when online.");
        if (!window.indexedDBManager || typeof window.indexedDBManager.addItem !== 'function') {
            displayPageMessage("Offline processing error: IndexedDB manager not available.", 'error');
            if (resultsEl && getActiveViewName()) displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]);
            if (btn) btn.disabled = false;
            return;
        }
        try {
            await window.indexedDBManager.addItem(window.indexedDBManager.STORE_NAMES.OFFLINE_QUEUE, {
                storeName: 'shipment_excel_file', 
                operation: 'process_excel_shipment',
                payload: { 
                    allExtractedData: shipmentModuleState.allExtractedData,
                    containerNumber: shipmentModuleState.containerNumber,
                    storedDate: shipmentModuleState.storedDate
                },
                timestamp: new Date().toISOString()
            });
            displayPageMessage('Shipment data saved for processing when online.', 'success', 5000); // Auto-dismiss after 5s
            Object.keys(shipmentModuleState.allExtractedData).forEach(key => shipmentModuleState.allExtractedData[key] = []);
            shipmentModuleState.containerNumber = null;
            shipmentModuleState.storedDate = null;
            redisplayCurrentData(); 
        } catch (queueError) {
            console.error("Error queueing shipment data for offline processing:", queueError);
            displayPageMessage("Error saving shipment data for offline processing. Please try again when online.", 'error');
            if (resultsEl && getActiveViewName()) displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]);
        } finally {
            if (btn) btn.disabled = false;
        }
        return;
    }

    // Online processing
    try {
        const result = await _processShipmentDataOnline(
            shipmentModuleState.allExtractedData,
            shipmentModuleState.containerNumber,
            shipmentModuleState.storedDate
        );
        // Determine message type based on result.success and itemsUpdated
        let messageType = 'info';
        if (result.success) {
            messageType = result.itemsUpdated > 0 ? 'success' : 'info';
        } else { // Should ideally not happen if result.success is the flag, but as a fallback
            messageType = 'error'; 
        }
        displayPageMessage(result.message, messageType, messageType === 'success' ? 5000 : 0);

        if (result.success && result.itemsUpdated > 0) {
            Object.keys(shipmentModuleState.allExtractedData).forEach(key => shipmentModuleState.allExtractedData[key] = []);
            shipmentModuleState.containerNumber = null;
            shipmentModuleState.storedDate = null;
            redisplayCurrentData(); 
        } else if (resultsEl && getActiveViewName()) { // Restore view if no items were updated but no error
             displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]);
        }
    } catch (error) {
        console.error('Error processing shipment online: ', error);
        displayPageMessage(`Error updating inventory: ${error.message}`, 'error');
        if (resultsEl && getActiveViewName()) displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]);
    } finally {
        if (btn) btn.disabled = false;
    }
}
  
function updateButtonState() { 
    if (!shipmentModuleState.updateInventoryBtn) return;
    let hasDataInAnyView = false; 
    if (shipmentModuleState.allExtractedData) {
        hasDataInAnyView = Object.keys(shipmentModuleState.allExtractedData).some(
            viewName => shipmentModuleState.allExtractedData[viewName] && shipmentModuleState.allExtractedData[viewName].length > 0
        );
    }
    shipmentModuleState.updateInventoryBtn.style.display = hasDataInAnyView ? 'inline-block' : 'none';
    shipmentModuleState.updateInventoryBtn.disabled = !hasDataInAnyView;
}
  
function redisplayCurrentData() {
    const tabNavEl = shipmentModuleState.currentShipmentTabNav;
    const resultsEl = shipmentModuleState.currentResultsContainer;
    if (!tabNavEl || !resultsEl) { console.error("DOM elements not found for redisplay."); return; }
    tabNavEl.innerHTML = ''; 
    let firstTabButton = null;
    let dataExistsOverall = Object.keys(shipmentModuleState.allExtractedData).some(
        key => shipmentModuleState.allExtractedData[key] && shipmentModuleState.allExtractedData[key].length > 0
    );
    if (!dataExistsOverall) { 
        resultsEl.innerHTML = '<p>No data processed or all views are empty. Upload a file.</p>';
        tabNavEl.style.display = 'none';
        const shipmentDetailsContainer = document.getElementById('shipmentDetailsContainer');
        if (shipmentDetailsContainer) shipmentDetailsContainer.innerHTML = '';
        updateButtonState(); 
        return;
    }
    shipmentModuleState.viewDefinitions.forEach(viewDef => {
        if (shipmentModuleState.allExtractedData.hasOwnProperty(viewDef.name)) {
            const tabButton = document.createElement('button');
            tabButton.textContent = viewDef.displayName;
            tabButton.setAttribute('data-view-name', viewDef.name);
            tabButton.classList.add('shipment-tab');
            tabButton.addEventListener('click', function() {
                Array.from(tabNavEl.children).forEach(child => child.classList.remove('active-tab'));
                this.classList.add('active-tab');
                displayExtractedData(shipmentModuleState.allExtractedData[this.getAttribute('data-view-name')]);
            });
            tabNavEl.appendChild(tabButton);
            if (!firstTabButton) firstTabButton = tabButton;
        }
    });
    if (firstTabButton) {
        tabNavEl.style.display = 'flex';
        firstTabButton.click(); 
    } else {
        resultsEl.innerHTML = '<p>No views defined or no data to display tabs for.</p>';
        tabNavEl.style.display = 'none';
    }
    updateButtonState(); 
}
  
function processNewFile(file) { 
    shipmentModuleState.containerNumber = null;
    shipmentModuleState.storedDate = null;
    const resultsEl = shipmentModuleState.currentResultsContainer; 
    const tabNavEl = shipmentModuleState.currentShipmentTabNav;   
    const shipmentDetailsContainerGlobal = document.getElementById('shipmentDetailsContainer');
    
    clearAllPageMessages(); // Clear previous messages on new file selection
    if (shipmentDetailsContainerGlobal) shipmentDetailsContainerGlobal.innerHTML = '';
  
    if (!file) {
        displayPageMessage('No file selected.', 'warning');
        if (resultsEl) resultsEl.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>'; // Keep default message in results area
        if (tabNavEl) tabNavEl.style.display = 'none';
        updateButtonState(); return;
    }
    const validExtensions = ['.xlsx', '.xlsm'];
    if (!validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) { 
        displayPageMessage('Invalid file type. Please select an .xlsx or .xlsm file.', 'error');
        if (resultsEl) resultsEl.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>'; // Keep default message
        if (tabNavEl) tabNavEl.style.display = 'none';
        updateButtonState(); return; 
    }
  
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            clearAllPageMessages(); // Clear any previous messages like "invalid file type" if this stage is reached
            if (shipmentDetailsContainerGlobal) shipmentDetailsContainerGlobal.innerHTML = '';
            if (typeof XLSX === 'undefined') throw new Error("SheetJS library (XLSX) not loaded.");
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const jordonSheet = workbook.Sheets['Jordon'];
            const sheet1 = workbook.Sheets['sheet 1']; // lowercase 's'
  
            if (sheet1) {
                const cellJ2 = sheet1['J2'];
                shipmentModuleState.containerNumber = (cellJ2 && cellJ2.v !== undefined) ? cellJ2.v : null;
            } else { shipmentModuleState.containerNumber = null; }
  
            if (jordonSheet) {
                const cellD10 = jordonSheet['D10'];
                let rawStoredDate = (cellD10 && cellD10.v !== undefined) ? cellD10.v : null;
                if (rawStoredDate !== null) {
                    if (typeof rawStoredDate === 'number' && rawStoredDate > 0) {
                        const fmtDate = XLSX.SSF.format('dd/mm/yyyy', rawStoredDate);
                        if (typeof fmtDate === 'string' && fmtDate.includes('/')) shipmentModuleState.storedDate = fmtDate;
                    } else if (typeof rawStoredDate === 'string') {
                        if (/^\d{4}-\d{2}-\d{2}$/.test(rawStoredDate)) {
                            const parts = rawStoredDate.split('-');
                            shipmentModuleState.storedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                        } else { shipmentModuleState.storedDate = rawStoredDate; }
                    }
                }
            }
            console.log(`FINAL - Container Number: ${shipmentModuleState.containerNumber}, Stored Date: ${shipmentModuleState.storedDate}`);
  
            const convertSheet = workbook.Sheets['Convert'];
            if (!convertSheet) throw new Error("Sheet 'Convert' not found in the Excel file.");
            const convertSheetData = XLSX.utils.sheet_to_json(convertSheet, { header: 1, blankrows: false });
            if (convertSheetData.length === 0) throw new Error("The 'Convert' sheet in the Excel file is empty.");
            
            const sheet1LookupMap = new Map();
            if (sheet1) {
                const sheet1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1, blankrows: false });
                if (sheet1Data.length > 0) {
                    for (let i = 0; i < sheet1Data.length - 1; i++) { 
                        const itemCode = sheet1Data[i][1]; const packingSize = sheet1Data[i+1][2]; const batchNo = sheet1Data[i+1][3]; 
                        if (itemCode != null && String(itemCode).trim() !== "") { 
                            sheet1LookupMap.set(String(itemCode).trim(), { packingSize: (packingSize !== undefined ? packingSize : ''), batchNo: (batchNo !== undefined ? batchNo : '') });
                        }
                    }
                }
            }
            shipmentModuleState.allExtractedData = {}; 
            if (jordonSheet && typeof extractJordonData === 'function') {
                try {
                    shipmentModuleState.allExtractedData['Jordon'] = extractJordonData(jordonSheet, sheet1LookupMap);
                } catch (jordonError) {
                    console.error('Error during Jordon-specific extraction:', jordonError);
                    // Optionally display this error to the user if it's critical for Jordon view
                    displayPageMessage(`Error processing Jordon sheet data: ${jordonError.message}`, 'warning');
                    shipmentModuleState.allExtractedData['Jordon'] = [];
                }
            }
            shipmentModuleState.viewDefinitions.forEach(viewDef => {
                if (!(viewDef.name === 'Jordon' && jordonSheet)) { // Don't re-process Jordon if already done
                    try {
                        shipmentModuleState.allExtractedData[viewDef.name] = extractDataForView(convertSheetData, viewDef, sheet1LookupMap);
                    } catch (viewError) {
                        console.error(`Error processing data for view ${viewDef.displayName}:`, viewError);
                        displayPageMessage(`Error processing data for ${viewDef.displayName}: ${viewError.message}`, 'warning');
                        shipmentModuleState.allExtractedData[viewDef.name] = []; // Ensure it's an empty array on error
                    }
                }
            });
            redisplayCurrentData();
            if (Object.values(shipmentModuleState.allExtractedData).every(data => data.length === 0)) {
                displayPageMessage('Successfully processed the file, but no data was extracted for any view. Please check the file content and sheet names (e.g., Jordon, Convert, sheet 1).', 'warning');
            } else {
                displayPageMessage('Excel file processed successfully.', 'success', 3000); // Auto-dismiss after 3s
            }

        } catch (error) {
            console.error('Error processing file:', error);
            displayPageMessage(`An error occurred while processing the file: ${error.message}`, 'error');
            if (resultsEl) resultsEl.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>'; // Reset results area
            if (tabNavEl) tabNavEl.style.display = 'none';
            if (shipmentDetailsContainerGlobal) shipmentDetailsContainerGlobal.innerHTML = '';
            updateButtonState(); 
        }
    };
    reader.onerror = function(error) { 
        console.error('FileReader error:', error);
        displayPageMessage('Error reading file. It might be corrupted or your browser had an issue accessing it.', 'error');
        if (resultsEl) resultsEl.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>'; // Reset
        if (tabNavEl) tabNavEl.style.display = 'none';
        if (shipmentDetailsContainerGlobal) shipmentDetailsContainerGlobal.innerHTML = '';
        updateButtonState();
    };
    reader.readAsArrayBuffer(file);
}
  
export function initializeShipmentFeature() {
    console.log('Initializing Shipment Feature...');
    const fileInput = document.getElementById('excelFileInput');
    shipmentModuleState.currentResultsContainer = document.getElementById('resultsContainer');
    shipmentModuleState.currentShipmentTabNav = document.getElementById('shipmentTabNav');
    shipmentModuleState.updateInventoryBtn = document.getElementById('updateInventoryBtn'); 
  
    if (!fileInput || !shipmentModuleState.currentResultsContainer || !shipmentModuleState.currentShipmentTabNav) {
        console.error('Shipment Error: Essential DOM elements not found. Cannot initialize.');
        if (shipmentModuleState.currentResultsContainer) shipmentModuleState.currentResultsContainer.innerHTML = '<p style="color: red;">Error: Core page elements missing. Feature disabled.</p>';
        return;
    }
    if (!shipmentModuleState.updateInventoryBtn) console.warn('Shipment Warning: updateInventoryBtn not found.');
    
    fileInput.onchange = function(event) { processNewFile(event.target.files[0]); };
  
    if (!shipmentModuleState.isInitialized) {
        console.log('Attaching one-time event listeners.');
        shipmentModuleState.currentResultsContainer.addEventListener('change', handleCellEdit);
        shipmentModuleState.currentResultsContainer.addEventListener('click', handleRowRemoveClick);
        if (shipmentModuleState.updateInventoryBtn) shipmentModuleState.updateInventoryBtn.addEventListener('click', handleUpdateInventoryClick);
        shipmentModuleState.isInitialized = true;
    }
  
    if (Object.keys(shipmentModuleState.allExtractedData).length > 0) {
        redisplayCurrentData(); 
    } else {
        shipmentModuleState.currentResultsContainer.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>';
        if (shipmentModuleState.currentShipmentTabNav) shipmentModuleState.currentShipmentTabNav.style.display = 'none';
        updateButtonState(); 
    }
    console.log('Shipment feature initialization complete.');
}

// Expose the processing function for the sync mechanism
window.shipmentProcessor = {
    processQueuedShipmentData: _processShipmentDataOnline 
};
  
// DO NOT call initializeShipmentFeature() here.

// --- Page Message Display Function ---
function displayPageMessage(message, type = 'info', duration = 0) {
    const container = document.getElementById('pageMessages');
    if (!container) {
        console.error('Page messages container (#pageMessages) not found. Falling back to alert.');
        alert(message); // Fallback if container is missing
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `page-message ${type}`; // e.g., page-message error
    messageDiv.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.className = 'close-message-btn';
    closeButton.innerHTML = '&times;'; // '×' symbol
    closeButton.setAttribute('aria-label', 'Close message');
    closeButton.onclick = () => {
        messageDiv.remove();
    };

    messageDiv.appendChild(closeButton);
    container.appendChild(messageDiv); // Add new message to the end

    // Optional: Auto-dismiss after a duration
    if (duration > 0) {
        setTimeout(() => {
            messageDiv.remove();
        }, duration);
    }
}

// Helper to clear all messages if needed, e.g., before a new file upload
function clearAllPageMessages() {
    const container = document.getElementById('pageMessages');
    if (container) {
        container.innerHTML = '';
    }
}

// Make functions globally accessible for other scripts
window.displayPageMessage = displayPageMessage;
window.clearAllPageMessages = clearAllPageMessages;
