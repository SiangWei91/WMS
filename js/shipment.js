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

// Helper function to reformat date strings from M/D/YY or MM/DD/YY to DD/MM/YYYY
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
             // Unexpected year format, return original
             return dateStr;
        }
        return `${day}/${month}/${year}`;
    }
    return dateStr; // Return original if not in M/D/YY or MM/DD/YY or M/D/YYYY etc.
}

async function lookupOrCreateProduct(db, batch, itemCode, excelProductDescription, excelPackingSize) {
    // Assuming itemCode is already validated as non-empty before this call
    if (!itemCode) {
        console.warn("lookupOrCreateProduct called with empty itemCode. This should be prevented by caller.");
        // Return default values based on Excel, indicating no successful lookup or creation.
        return { 
            productName: excelProductDescription, 
            packingSize: excelPackingSize, 
            isNew: false, // Not new because no attempt to create if itemCode is missing
            error: 'Missing itemCode for lookup/creation' 
        };
    }

    const productsRef = db.collection('products');
    const productQuery = productsRef.where('productCode', '==', itemCode).limit(1);

    try {
        const querySnapshot = await productQuery.get();

        if (!querySnapshot.empty) {
            // Product exists
            const productData = querySnapshot.docs[0].data();
            console.log(`Product found for itemCode ${itemCode}:`, productData);
            return {
                productName: productData.name || excelProductDescription, // Fallback to excel if Firestore field is empty
                packingSize: productData.packaging || excelPackingSize, // Fallback
                isNew: false
            };
        } else {
            // Product does not exist, create new one
            console.log(`Product not found for itemCode ${itemCode}. Creating new product.`);
            // const formattedTimestamp = formatCurrentTimestampUTC8(); // Ensure this helper is accessible - REMOVED
            const newProductData = {
                productCode: itemCode,
                name: excelProductDescription,
                packaging: excelPackingSize,
                createdAt: firebase.firestore.FieldValue.serverTimestamp() // Using Firestore server timestamp
            };
            
            const newProductRef = productsRef.doc(); // Auto-generate ID
            batch.set(newProductRef, newProductData);
            
            return {
                productName: excelProductDescription,
                packingSize: excelPackingSize,
                isNew: true
            };
        }
    } catch (error) {
        console.error(`Error in lookupOrCreateProduct for itemCode ${itemCode}:`, error);
        // In case of an error (e.g., Firestore query fails), return Excel data and flag error
        return {
            productName: excelProductDescription,
            packingSize: excelPackingSize,
            isNew: false, // Can't confirm it's new if there was an error
            error: `Firestore error: ${error.message}`
        };
    }
}

async function getWarehouseInfo(db, viewDisplayName) {
    let firestoreWarehouseId = '';
    // Map viewDisplayName to a standardized Firestore warehouse ID
    switch (viewDisplayName) {
        case 'Jordon':
            firestoreWarehouseId = 'jordon';
            break;
        case 'Lineage':
            firestoreWarehouseId = 'lineage';
            break;
        case 'Blk15':
            firestoreWarehouseId = 'blk15';
            break;
        case 'Coldroom 6':
            firestoreWarehouseId = 'coldroom6';
            break;
        case 'Coldroom 5':
            firestoreWarehouseId = 'coldroom5';
            break;
        default:
            console.warn(`No Firestore warehouse ID mapping for view: ${viewDisplayName}`);
            return { 
                firestoreWarehouseId: viewDisplayName.toLowerCase().replace(/\s+/g, ''), // Basic fallback ID
                warehouseType: 'unknown', 
                error: `No mapping for view display name: ${viewDisplayName}` 
            };
    }

    const warehouseRef = db.collection('warehouses').doc(firestoreWarehouseId);
    try {
        const warehouseDoc = await warehouseRef.get();
        if (warehouseDoc.exists) {
            const warehouseData = warehouseDoc.data();
            const warehouseType = warehouseData.type || 'unknown'; // Default if type field is missing
            console.log(`Warehouse found for ID ${firestoreWarehouseId}: Type - ${warehouseType}`);
            return {
                firestoreWarehouseId: firestoreWarehouseId,
                warehouseType: warehouseType
            };
        } else {
            console.warn(`Warehouse document not found in Firestore for ID: ${firestoreWarehouseId} (mapped from: ${viewDisplayName})`);
            return {
                firestoreWarehouseId: firestoreWarehouseId,
                warehouseType: 'not_found',
                error: `Warehouse document ${firestoreWarehouseId} not found`
            };
        }
    } catch (error) {
        console.error(`Error fetching warehouse ${firestoreWarehouseId}:`, error);
        return {
            firestoreWarehouseId: firestoreWarehouseId,
            warehouseType: 'error',
            error: `Error fetching warehouse: ${error.message}`
        };
    }
}

function extractJordonData(jordonSheet, sheet1LookupMap) {
    const extractedItems = [];
    if (!jordonSheet) return extractedItems;

    // Use XLSX.utils.sheet_to_json to convert the sheet to an array of arrays.
    // defval: '' ensures empty cells become empty strings.
    // Removed blankrows: false to preserve all rows for correct indexing from Excel row 15.
    const jordonSheetData = XLSX.utils.sheet_to_json(jordonSheet, { header: 1, defval: '' });

    // Data starts from row 15 (index 14 in 0-indexed array)
    for (let rowIndex = 14; rowIndex < jordonSheetData.length; rowIndex++) {
        const row = jordonSheetData[rowIndex];
        if (!row) continue; // Should not happen with blankrows: false, but good practice

        // Product Description from column C (index 2)
        const productDescription = row[2] ? String(row[2]).trim() : "";

        // If Product Description is empty, stop processing (end of data)
        if (productDescription === "") {
            break;
        }

        // Item Code (Column I, index 8)
        const itemCode = row[8] ? String(row[8]).trim() : "";
        // Packing Size (Column D, index 3)
        const packingSize = row[3] ? String(row[3]).trim() : "";
        
        // Batch No (Column G, index 6) - Applying date reformatting
        let batchNo = "";
        const batchNoCellAddress = 'G' + (rowIndex + 1); 
        const batchNoCell = jordonSheet[batchNoCellAddress];
        if (batchNoCell && batchNoCell.w) {
            batchNo = String(batchNoCell.w).trim();
            batchNo = reformatDateToDDMMYYYY(batchNo); // Reformat the date string
        } else if (batchNoCell && batchNoCell.v !== undefined) {
            let potentialDateStr = String(batchNoCell.v).trim();
            // Check if it's a date-like string before attempting to reformat
            if (potentialDateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
                 batchNo = reformatDateToDDMMYYYY(potentialDateStr);
            } else {
                 batchNo = potentialDateStr; // Use as is if not M/D/YY format
            }
        }
        // If cell is completely empty or not found, batchNo remains ""

        // Quantity (Column F, index 5)
        const quantity = row[5] ? String(row[5]).trim() : ""; // Stored as string
        
        // Pallet (Column E, index 4) - Ensuring "0" is handled as a string
        let rawPalletValueFromCell;
        if (row[4] === 0) { // Check for number 0 specifically
            rawPalletValueFromCell = "0";
        } else if (row[4]) { // Check for other truthy values (non-empty strings, other numbers)
            rawPalletValueFromCell = String(row[4]).trim();
        } else { // Cell is empty or defval kicked in as ''
            rawPalletValueFromCell = "";
        }

        let pallet = rawPalletValueFromCell; 
        const indexOfX = rawPalletValueFromCell.indexOf('x');
        if (indexOfX > -1) { 
            pallet = rawPalletValueFromCell.substring(indexOfX + 1).trim();
        }
        // This logic means:
        // "48x4" -> "4"
        // "123"  -> "123"
        // "0"    -> "0" (because rawPalletValueFromCell will be "0", indexOfX is -1)
        // "48x"  -> ""
        // "48x " -> ""
        
        // Optional: Enrichment using sheet1LookupMap if needed.
        // For now, direct extraction is prioritized as per the requirements.
        // Example:
        // let finalPackingSize = packingSize;
        // if (!finalPackingSize && itemCode && sheet1LookupMap.has(itemCode)) {
        //     const lookup = sheet1LookupMap.get(itemCode);
        //     if (lookup && lookup.packingSize) {
        //         finalPackingSize = lookup.packingSize;
        //     }
        // }
        // let finalBatchNo = batchNo;
        // if (!finalBatchNo && itemCode && sheet1LookupMap.has(itemCode)) {
        //     const lookup = sheet1LookupMap.get(itemCode);
        //     if (lookup && lookup.batchNo) {
        //         finalBatchNo = lookup.batchNo;
        //     }
        // }

        const item = {
            itemCode: itemCode,
            productDescription: productDescription,
            packingSize: packingSize, // Using direct extraction: finalPackingSize
            batchNo: batchNo,         // Using direct extraction: finalBatchNo
            quantity: quantity,
            pallet: pallet,
            excelRowNumber: rowIndex + 1
        };
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
        if (shipmentModuleState.containerNumber) {
            detailsHtml += `<p>Container Number: ${escapeHtml(shipmentModuleState.containerNumber)}</p>`;
        }
        if (shipmentModuleState.storedDate) {
            detailsHtml += `<p>Stored Date: ${escapeHtml(shipmentModuleState.storedDate)}</p>`;
        }
        shipmentDetailsContainer.innerHTML = detailsHtml;
    }
  
    const resultsEl = shipmentModuleState.currentResultsContainer;
    if (!resultsEl) return;
    let html = '';
    if (!data || data.length === 0) {
        html += '<p>No data to display for this view.</p>';
        // If there's no table data for the current view, also clear shipment details
        // or display a specific message if preferred.
        // For now, if detailsHtml was populated above, it will remain.
        // If no container number/date even if there's no table data, clear it:
        if (shipmentDetailsContainer && shipmentDetailsContainer.innerHTML !== '' && !(shipmentModuleState.containerNumber || shipmentModuleState.storedDate)) {
          // This condition is a bit complex. Simpler: if no data for table, and no global details, ensure details div is empty.
          // The previous logic already handles setting detailsHtml. If it's empty, details div will be empty.
          // If data is empty for *this specific view*, but global container/date info *exists*, it should still be shown.
          // So, the logic at the top of the function is likely sufficient.
        }
    } else {
        const activeViewName = getActiveViewName();
        let headers = ['Item Code', 'Product Description', 'Packing Size', 'Batch No', 'Quantity'];
        let currentDataKeys = ['itemCode', 'productDescription', 'packingSize', 'batchNo', 'quantity'];

        if (activeViewName === 'Jordon') {
            const quantityIndex = headers.indexOf('Quantity');
            if (quantityIndex !== -1) {
                headers.splice(quantityIndex + 1, 0, 'Pallet');
            } else { 
                headers.push('Pallet'); // Fallback
            }
            
            const quantityKeyIndex = currentDataKeys.indexOf('quantity');
            if (quantityKeyIndex !== -1) {
                currentDataKeys.splice(quantityKeyIndex + 1, 0, 'pallet');
            } else {
                currentDataKeys.push('pallet'); // Fallback
            }
        }
        headers.push('Remove'); // 'Remove' is always the last header

        html += '<table border="1"><thead><tr>';
        headers.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
        html += '</tr></thead><tbody>';

        data.forEach((item, rowIndex) => {
            html += `<tr data-row-index="${rowIndex}">`;
            currentDataKeys.forEach(key => {
                const value = item[key] !== undefined ? item[key] : '';
                html += `<td><input type="text" class="editable-cell-input" data-row-index="${rowIndex}" data-column-key="${escapeHtml(key)}" value="${escapeHtml(value)}"></td>`;
            });
            html += `<td><button class="remove-row-btn" data-row-index="${rowIndex}">X</button></td>`;
            html += '</tr>';
        });
        html += '</tbody></table>';
    }
    resultsEl.innerHTML = html;
  }
  
  function getActiveViewName() {
    const tabNavEl = shipmentModuleState.currentShipmentTabNav;
    if (!tabNavEl) return shipmentModuleState.viewDefinitions.length > 0 ? shipmentModuleState.viewDefinitions[0].name : null;
    const activeTab = tabNavEl.querySelector('.active-tab');
    if (activeTab && activeTab.dataset.viewName) {
        return activeTab.dataset.viewName;
    }
    return shipmentModuleState.viewDefinitions.length > 0 ? shipmentModuleState.viewDefinitions[0].name : null;
  }
  
  // getActiveViewDisplayName is not strictly needed by handleUpdateInventoryClick anymore if processing all views
  // but can be kept if other parts use it.
  
  function handleCellEdit(event) {
    if (event.target.classList.contains('editable-cell-input')) {
        const rowIndex = parseInt(event.target.dataset.rowIndex, 10);
        const columnKey = event.target.dataset.columnKey;
        const newValue = event.target.value;
        const activeViewName = getActiveViewName();
        if (activeViewName && shipmentModuleState.allExtractedData[activeViewName] && shipmentModuleState.allExtractedData[activeViewName][rowIndex]) {
            shipmentModuleState.allExtractedData[activeViewName][rowIndex][columnKey] = newValue;
            console.log(`Updated data for ${activeViewName}, row ${rowIndex}, column ${columnKey}:`, newValue);
        } else {
            console.error('Could not update data.');
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
            console.log(`Removed row ${rowIndex} from ${activeViewName}.`);
            updateButtonState(); 
        } else {
            console.error('Could not remove row.');
        }
    }
  }
  
async function handleUpdateInventoryClick() { // Made async
    const btn = shipmentModuleState.updateInventoryBtn;
    const resultsEl = shipmentModuleState.currentResultsContainer;
  
    if (btn) btn.disabled = true;
    
    let originalResultsHTML = "";
    if (resultsEl) {
        originalResultsHTML = resultsEl.innerHTML; // Save current view for potential restore
        resultsEl.innerHTML = `<p>Updating all inventory views... Please wait.</p>`;
    } else {
        console.log(`Updating all inventory views... Please wait.`);
    }
  
    if (typeof firebase === 'undefined' || typeof firebase.firestore === 'undefined') {
        console.error('Firebase or Firestore is not available.');
        alert('Error: Firebase service is not available. Cannot update inventory.');
        if (resultsEl && getActiveViewName()) displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]); // Restore current view
        if (btn) btn.disabled = false;
        return;
    }
  
    const db = firebase.firestore();
    const batch = db.batch();
    let totalItemsToUpdate = 0;
  
    // Changed outer loop to for...of to support await within nested loops
    for (const viewDef of shipmentModuleState.viewDefinitions) { 
        const viewName = viewDef.name;
        const viewDisplayName = viewDef.displayName; // Used for warehouse mapping later
        // Removed: console.log(`Processing view: Name='${viewName}', DisplayName='${viewDisplayName}'`);
        const dataForThisView = shipmentModuleState.allExtractedData[viewName];

        if (dataForThisView && dataForThisView.length > 0) {
            for (const item of dataForThisView) { // item is from Excel data - Inner loop is already for...of
                // --- START NEW LOGIC PER ITEM (Structure for upcoming async operations) ---
                
                // 1. Product Lookup/Creation
                const currentItemCode = String(item.itemCode || '').trim();
                if (!currentItemCode) {
                    console.warn("Skipping item with empty productCode (pre-lookup):", item, "for warehouse:", viewDisplayName);
                    continue; // Skip this item and go to the next in the loop
                }

                const productInfo = await lookupOrCreateProduct(
                    db,
                    batch,
                    currentItemCode,
                    String(item.productDescription || '').trim(),
                    String(item.packingSize || '').trim()
                );

                // If product lookup/creation had an error, productInfo might contain an error flag/message.
                // Decide if processing should stop for this item or continue with Excel data.
                // For now, we'll log if there's an error and proceed; the inventoryDoc will use productName/packingSize from productInfo.
                if (productInfo.error) {
                    console.warn(`Error processing product ${currentItemCode}: ${productInfo.error}. Inventory record will use Excel data for product name/packing size if applicable.`);
                }
                // productDetails will be effectively productInfo for Step 5 logic

                // 2. Warehouse ID Mapping and Type Lookup
                const warehouseDetails = await getWarehouseInfo(db, viewDisplayName);
                // Removed: console.log(`[${viewName}] Item: ${currentItemCode}, WarehouseDetails:`, JSON.stringify(warehouseDetails));

                if (warehouseDetails.error) {
                    console.warn(`[${viewName}] Item: ${currentItemCode}, Could not retrieve warehouse details for ${viewDisplayName}: ${warehouseDetails.error}. Inventory processing for this item might use defaults or fail if warehouseId is critical.`);
                    // Depending on strictness, might 'continue' here to skip item if warehouse info is essential
                }
                // warehouseInfo is now warehouseDetails for Step 5 logic (contains firestoreWarehouseId, warehouseType)

                // 3. Construct Final Inventory Document
                const finalProductCode = String(item.itemCode || '').trim(); // Already validated as currentItemCode

                const inventoryDoc = {
                    productCode: finalProductCode,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    quantity: Number(item.quantity || 0),
                    warehouseId: warehouseDetails.firestoreWarehouseId, // From getWarehouseInfo
                    container: shipmentModuleState.containerNumber || "",    // From global state
                    batchNo: String(item.batchNo || '').trim() // ADDED top-level batchNo
                    // Top-level status removed
                };

                // Note: productName and packingSize from productInfo are intentionally NOT added to inventoryDoc
                // as per user requirement: "inventory collection只需要保存 item code,created at(time stamp),quantity,warehouseid,container."

                if (warehouseDetails.warehouseType === '3pl') {
                    // Removed: console.log(`[${viewName}] Item: ${currentItemCode}, Warehouse type is '3pl'. Adding _3plDetails.`);
                    inventoryDoc._3plDetails = {
                        status: "pending",                            // Moved status here
                        lotNumber: "",                                // CHANGED back to empty string
                        palletType: "pending",                        // Remains "pending"
                        location: "",                                 // Changed to empty string
                        dateStored: shipmentModuleState.storedDate || "" // Remains the same
                    };

                    // Add pallet information specifically for Jordon view if it's a 3PL and pallet data exists
                    if (viewName === 'Jordon' && item.pallet !== undefined) {
                        let numericPalletCount = 0;
                        const palletStringValue = String(item.pallet || '').trim();
                        if (palletStringValue !== "") {
                            numericPalletCount = Number(palletStringValue);
                            if (isNaN(numericPalletCount)) {
                                console.warn(`[${viewName}] Item: ${currentItemCode}, Jordon view, could not parse pallet value '${palletStringValue}' to number. Defaulting to 0.`);
                                numericPalletCount = 0;
                            }
                        }
                        inventoryDoc._3plDetails.pallet = numericPalletCount; // Assign numeric value
                    }
                } else {
                    // Removed: console.log(`[${viewName}] Item: ${currentItemCode}, Warehouse type is '${warehouseDetails.warehouseType}'. Skipping _3plDetails.`);
                }
                
                // The productCode was already validated as currentItemCode before calling lookupOrCreateProduct.
                // No further validation for inventoryDoc.productCode needed here as it uses that validated code.
                // Removed: if (viewName === 'Jordon') { console.log(...); }

                if (viewName === 'Jordon' && item.hasOwnProperty('excelRowNumber')) {
                    inventoryDoc.excelRowNumber = item.excelRowNumber;
                }
                
                // Add to batch (Inventory item)
                const newInventoryDocRef = db.collection('inventory').doc(); // Creates a new unique ID for the doc
                batch.set(newInventoryDocRef, inventoryDoc);
                totalItemsToUpdate++;

                // --- ADD TRANSACTION DOC ---
                const transactionDoc = {
                    productCode: inventoryDoc.productCode,
                    productName: productInfo.productName, // From lookupOrCreateProduct
                    warehouseId: inventoryDoc.warehouseId,
                    quantity: inventoryDoc.quantity,
                    batchNo: inventoryDoc.batchNo, // Added batchNo to transaction
                    transactionDate: firebase.firestore.FieldValue.serverTimestamp(),
                    type: 'inbound', // Assuming new shipments are 'inbound'
                    operatorId: 'system', // Placeholder for operator
                    // Other fields like 'details' or 'referenceId' can be added if needed
                };
                const newTransactionDocRef = db.collection('transactions').doc();
                batch.set(newTransactionDocRef, transactionDoc);
                // --- END ADD TRANSACTION DOC ---

                // --- END NEW LOGIC PER ITEM ---
            } // End of for...of loop for items
        } // End of if (dataForThisView && dataForThisView.length > 0)
    } // End of for...of loop for viewDefinitions
  
    if (totalItemsToUpdate === 0) {
        alert('No data across all views to update.');
        if (resultsEl && getActiveViewName()) displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]); // Restore
        else if (resultsEl) resultsEl.innerHTML = '<p>No data to update.</p>'; // Fallback if no active view somehow
        if (btn) btn.disabled = false;
        return;
    }
  
    batch.commit()
        .then(() => {
            console.log('Batch Firestore update successful for all views!');
            alert(`Successfully updated inventory for ${totalItemsToUpdate} items from all views.`);
            // Optionally clear all data after successful update for all views
            // Object.keys(shipmentModuleState.allExtractedData).forEach(key => {
            //     shipmentModuleState.allExtractedData[key] = [];
            // });
            // redisplayCurrentData(); // This will show "No data" for all views and hide button
        })
        .catch((error) => {
            console.error('Error writing batch to Firestore: ', error);
            alert(`Error updating inventory: ${error.message}`);
        })
        .finally(() => {
            if (btn) btn.disabled = false;
            // Re-render the currently active view's data.
            // If data was cleared on success, this will show "No data".
            if (getActiveViewName() && shipmentModuleState.allExtractedData[getActiveViewName()]) {
                 displayExtractedData(shipmentModuleState.allExtractedData[getActiveViewName()]);
            } else if (resultsEl) { // If active view somehow became invalid, show a generic message
                 resultsEl.innerHTML = "<p>Operation complete. Current view data may have changed.</p>";
            }
        });
  }
  
  
  function updateButtonState() { 
    if (!shipmentModuleState.updateInventoryBtn) return;
    let hasDataInAnyView = false; // Check if any view has data to enable the button
    if (shipmentModuleState.allExtractedData) {
        hasDataInAnyView = Object.keys(shipmentModuleState.allExtractedData).some(
            viewName => shipmentModuleState.allExtractedData[viewName] && shipmentModuleState.allExtractedData[viewName].length > 0
        );
    }
    
    if (hasDataInAnyView) {
        shipmentModuleState.updateInventoryBtn.style.display = 'inline-block';
        shipmentModuleState.updateInventoryBtn.disabled = false;
    } else {
        shipmentModuleState.updateInventoryBtn.style.display = 'none';
        shipmentModuleState.updateInventoryBtn.disabled = true;
    }
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
        if (shipmentDetailsContainer) {
            shipmentDetailsContainer.innerHTML = ''; // Clear details if no data overall
        }
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
                const viewName = this.getAttribute('data-view-name');
                displayExtractedData(shipmentModuleState.allExtractedData[viewName]);
                // updateButtonState(); // No longer needed here, button reflects all data
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
    // Initialize containerNumber and storedDate at the beginning
    shipmentModuleState.containerNumber = null;
    shipmentModuleState.storedDate = null;
  
    const resultsEl = shipmentModuleState.currentResultsContainer; 
    const tabNavEl = shipmentModuleState.currentShipmentTabNav;   
    
    // Clear shipment details container at the beginning of processing a new file
    const shipmentDetailsContainerGlobal = document.getElementById('shipmentDetailsContainer');
    if (shipmentDetailsContainerGlobal) {
        shipmentDetailsContainerGlobal.innerHTML = '';
    }
  
    if (!file) {
        if (resultsEl) resultsEl.innerHTML = '<p style="color: orange;">No file selected.</p>';
        if (tabNavEl) tabNavEl.style.display = 'none';
        updateButtonState();
        return;
    }
    const validExtensions = ['.xlsx', '.xlsm'];
    const fileName = file.name.toLowerCase();
    const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    if (!isValidExtension) { 
        if (resultsEl) resultsEl.innerHTML = '<p style="color: red;">Invalid file type. Please select an .xlsx or .xlsm file.</p>';
        if (tabNavEl) tabNavEl.style.display = 'none';
        updateButtonState();
        return; 
    }
  
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // Clear details container again just before reading, as a safeguard.
            // This might be redundant if the one above always executes, but good for safety.
            if (shipmentDetailsContainerGlobal) {
                shipmentDetailsContainerGlobal.innerHTML = '';
            }
            if (typeof XLSX === 'undefined') { throw new Error("SheetJS library (XLSX) not loaded.");}
            const fileData = new Uint8Array(e.target.result);
            const workbook = XLSX.read(fileData, { type: 'array' });

            // Jordon sheet check - Step 2
            const jordonSheetName = 'Jordon';
            const jordonSheet = workbook.Sheets[jordonSheetName];
  
            // Access "sheet 1" for container number and stored date
            const sheet1Name = 'sheet 1'; // Use lowercase 's' as specified
            const sheet1 = workbook.Sheets[sheet1Name];
  
            if (sheet1) {
                console.log('Sheet1 object full content:', sheet1); 
                const cellJ2 = sheet1['J2'];
                shipmentModuleState.containerNumber = (cellJ2 && cellJ2.v !== undefined) ? cellJ2.v : null;
                // Stored Date is no longer sourced from sheet1 C2. It will be handled by Jordon sheet D10.
                // The initial console.log for C2 and subsequent processing for storedDate from sheet1 are removed.
                console.log(`Container Number (from sheet 1 J2): ${shipmentModuleState.containerNumber}`);
            } else {
                console.warn(`Sheet "${sheet1Name}" not found. Container number will be null.`);
                shipmentModuleState.containerNumber = null;
                // shipmentModuleState.storedDate will remain null as initialized if sheet1 is not found,
                // and will be processed later by Jordon sheet logic.
            }
  
            // New logic for Stored Date from "Jordon" sheet, cell D10
            // shipmentModuleState.storedDate is already initialized to null at the top of processNewFile
            // const jordonSheetName = 'Jordon'; // Already defined above
            // const jordonSheet = workbook.Sheets[jordonSheetName]; // Already defined above
  
            if (jordonSheet) {
                const cellD10 = jordonSheet['D10'];
                console.log('Raw D10 cell object (Jordon sheet):', cellD10);
                let rawStoredDate = (cellD10 && cellD10.v !== undefined) ? cellD10.v : null;
                console.log('Stored Date initial value (Jordon D10):', rawStoredDate, 'Type:', typeof rawStoredDate);
  
                if (rawStoredDate !== null && rawStoredDate !== undefined) {
                    if (typeof rawStoredDate === 'number') {
                        if (rawStoredDate > 0) { // Check for positive Excel serial date
                            try {
                                const formattedDate = XLSX.SSF.format('dd/mm/yyyy', rawStoredDate); // Changed format to dd/mm/yyyy
                                if (typeof formattedDate === 'string' && formattedDate.includes('/')) { // Changed validation to check for /
                                    shipmentModuleState.storedDate = formattedDate;
                                    console.log('Stored Date (Jordon D10) successfully converted (number to dd/mm/yyyy string):', shipmentModuleState.storedDate);
                                } else {
                                    console.warn('Stored Date (Jordon D10, number) could not be formatted by XLSX.SSF.format to dd/mm/yyyy or format was unexpected:', formattedDate, 'Original value:', rawStoredDate);
                                }
                            } catch (ex) {
                                console.error('Error during XLSX.SSF.format for Stored Date (Jordon D10):', ex);
                            }
                        } else {
                            console.log('Stored Date (Jordon D10) is a number but not a typical positive Excel serial date:', rawStoredDate);
                        }
                    } else if (typeof rawStoredDate === 'string') {
                        // Check if it's in YYYY-MM-DD format and convert it
                        if (/^\d{4}-\d{2}-\d{2}$/.test(rawStoredDate)) {
                            try {
                                const parts = rawStoredDate.split('-');
                                shipmentModuleState.storedDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // Convert YYYY-MM-DD to DD/MM/YYYY
                                console.log('Stored Date (Jordon D10) successfully reformatted (YYYY-MM-DD string to DD/MM/YYYY):', shipmentModuleState.storedDate);
                            } catch (reformatEx) {
                                 console.error('Error reformatting YYYY-MM-DD string date (Jordon D10):', reformatEx);
                                 shipmentModuleState.storedDate = rawStoredDate; // Fallback to original string
                            }
                        } else {
                            // If it's any other string (could be already dd/mm/yyyy or non-date string), use as is.
                            shipmentModuleState.storedDate = rawStoredDate;
                            console.log('Stored Date (Jordon D10) is a string, not in YYYY-MM-DD format, using as is:', shipmentModuleState.storedDate);
                        }
                    } else {
                        console.log('Stored Date (Jordon D10) is not a number or string. Type:', typeof rawStoredDate, 'Value:', rawStoredDate);
                    }
                }
                // If rawStoredDate is null/undefined, or conversion fails and doesn't set shipmentModuleState.storedDate, it remains null.
            } else {
                console.warn(`Sheet "${jordonSheetName}" not found. Stored date will be null.`);
                // shipmentModuleState.storedDate remains null as initialized at the function top.
            }
            
            // Log final derived values for both container number and stored date after all processing
            console.log(`FINAL - Container Number: ${shipmentModuleState.containerNumber}, Stored Date: ${shipmentModuleState.storedDate}`);
  
            const convertSheet = workbook.Sheets['Convert'];
            if (!convertSheet) { throw new Error("Sheet 'Convert' not found.");}
            const convertSheetData = XLSX.utils.sheet_to_json(convertSheet, { header: 1, blankrows: false });
            if (convertSheetData.length === 0) { throw new Error("The 'Convert' sheet is empty.");}
            
            // Existing logic for sheet1LookupMap (for packingSize and batchNo)
            // This part seems to refer to a different "Sheet 1" or has a different purpose.
            // For now, I'll keep it but ensure it uses a different variable name if it's truly different.
            // Based on the original code, it seems 'sheet 1' (lowercase) is for J2/C2, and 'Sheet 1' (uppercase) was for lookup.
            // The original code already uses `workbook.Sheets['sheet 1']` for the lookup map, which is consistent.
            // So, the `sheet1` variable used for J2/C2 is the same as the one for the lookup map.
  
            const sheet1LookupMap = new Map();
            // The original code used: `const sheet1 = workbook.Sheets['sheet 1'];`
            // This is the same sheet from which we are trying to get J2 and C2.
            // So, we can reuse the `sheet1` variable.
            if (sheet1) { // Check if sheet1 (lowercase s) exists, as done for J2/C2
                const sheet1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1, blankrows: false });
                if (sheet1Data.length > 0) {
                    for (let i = 0; i < sheet1Data.length - 1; i++) { 
                        const currentRow = sheet1Data[i]; const nextRow = sheet1Data[i+1];
                        const itemCode = currentRow[1]; const packingSize = nextRow[2]; const batchNo = nextRow[3]; 
                        if (itemCode != null && String(itemCode).trim() !== "") { 
                            sheet1LookupMap.set(String(itemCode).trim(), { 
                                packingSize: (packingSize !== undefined ? packingSize : ''), 
                                batchNo: (batchNo !== undefined ? batchNo : '') 
                            });
                        }
                    }
                } else { console.warn(`"${sheet1Name}" is empty. Lookup map will be empty.`); }
            } else { console.warn(`"${sheet1Name}" not found. Lookup map will be empty.`);}
            console.log('Sheet 1 Lookup Map:', sheet1LookupMap);
            // End of existing sheet1LookupMap logic

            shipmentModuleState.allExtractedData = {}; 

            // Conditional Jordon Extraction - Step 3
            if (jordonSheet) {
                // Placeholder: extractJordonData will be implemented in the next step
                if (typeof extractJordonData === 'function') {
                    try {
                        // The sheet1LookupMap might still be needed for enrichment if Jordon sheet is sparse
                        // For now, assume extractJordonData handles what it needs from jordonSheet directly
                        // and potentially uses sheet1LookupMap if passed.
                        shipmentModuleState.allExtractedData['Jordon'] = extractJordonData(jordonSheet, sheet1LookupMap); // Pass sheet1LookupMap
                        console.log("Processed Jordon data using extractJordonData.");
                    } catch (jordonError) {
                        console.error('Error during Jordon-specific extraction:', jordonError);
                        // Fallback or error display for Jordon view can be handled here or in redisplayCurrentData
                        shipmentModuleState.allExtractedData['Jordon'] = []; // Ensure it's an empty array on error
                    }
                } else {
                    console.warn('extractJordonData function is not defined. Jordon data will not be specifically processed.');
                    shipmentModuleState.allExtractedData['Jordon'] = []; // Ensure it's an empty array
                }
            }
            
            // Modify Existing "Convert" Sheet Processing - Step 4
            shipmentModuleState.viewDefinitions.forEach(viewDef => {
                if (viewDef.name === 'Jordon' && jordonSheet) {
                    // Jordon data is already handled by extractJordonData if jordonSheet exists.
                    // Ensure allExtractedData['Jordon'] is populated (or initialized as [] by extractJordonData).
                    // If extractJordonData wasn't defined or failed, it should have initialized it.
                    if (!shipmentModuleState.allExtractedData['Jordon']) {
                         shipmentModuleState.allExtractedData['Jordon'] = []; // Initialize if somehow missed
                    }
                    console.log('Skipping Jordon view in standard loop as it was handled by extractJordonData.');
                } else {
                    // Process other views, or Jordon if jordonSheet was not found (fallback)
                    shipmentModuleState.allExtractedData[viewDef.name] = extractDataForView(convertSheetData, viewDef, sheet1LookupMap);
                }
            });
            console.log("Processed new file. All Extracted Data:", shipmentModuleState.allExtractedData);
            redisplayCurrentData();
  
        } catch (error) {
            console.error('Error processing file:', error);
            if (resultsEl) resultsEl.innerHTML = `<p style="color: red;">An error occurred: ${error.message}</p>`;
            if (tabNavEl) tabNavEl.style.display = 'none';
            // Clear shipment details on error
            const shipmentDetailsContainer = document.getElementById('shipmentDetailsContainer');
            if (shipmentDetailsContainer) {
                shipmentDetailsContainer.innerHTML = '';
            }
            updateButtonState(); 
        }
    };
    reader.onerror = function(error) { 
        console.error('FileReader error:', error);
        if (resultsEl) resultsEl.innerHTML = '<p style="color: red;">Error reading file.</p>';
        if (tabNavEl) tabNavEl.style.display = 'none';
        // Clear shipment details on error
        const shipmentDetailsContainer = document.getElementById('shipmentDetailsContainer');
        if (shipmentDetailsContainer) {
            shipmentDetailsContainer.innerHTML = '';
        }
        updateButtonState();
    };
    // Ensure this is the last call before reader operations start
    // The clearing at the very top of processNewFile should handle this,
    // but if any early return (like invalid extension) happens, details might remain.
    // Re-evaluating: The clear at the very top is the most encompassing for "new file selection process".
    reader.readAsArrayBuffer(file);
  }
  
  
  function initializeShipmentFeature() {
    console.log('Initializing Shipment Feature...');
    const fileInput = document.getElementById('excelFileInput');
    shipmentModuleState.currentResultsContainer = document.getElementById('resultsContainer');
    shipmentModuleState.currentShipmentTabNav = document.getElementById('shipmentTabNav');
    shipmentModuleState.updateInventoryBtn = document.getElementById('updateInventoryBtn'); 
  
    if (!fileInput || !shipmentModuleState.currentResultsContainer || !shipmentModuleState.currentShipmentTabNav) {
        console.error('Shipment Error: Essential DOM elements not found. Cannot initialize.');
        if (shipmentModuleState.currentResultsContainer) {
            shipmentModuleState.currentResultsContainer.innerHTML = '<p style="color: red;">Error: Core page elements missing. Feature disabled.</p>';
        }
        return;
    }
    if (!shipmentModuleState.updateInventoryBtn) {
        console.warn('Shipment Warning: updateInventoryBtn not found. Update functionality will be unavailable.');
    }
    
    fileInput.onchange = function(event) { 
        processNewFile(event.target.files[0]); 
    };
  
    if (!shipmentModuleState.isInitialized) {
        console.log('Attaching one-time event listeners.');
        shipmentModuleState.currentResultsContainer.addEventListener('change', handleCellEdit);
        shipmentModuleState.currentResultsContainer.addEventListener('click', handleRowRemoveClick);
        if (shipmentModuleState.updateInventoryBtn) {
            shipmentModuleState.updateInventoryBtn.addEventListener('click', handleUpdateInventoryClick);
        }
        shipmentModuleState.isInitialized = true;
    }
  
    if (Object.keys(shipmentModuleState.allExtractedData).length > 0) {
        console.log('Previous data found, redisplaying...');
        redisplayCurrentData(); 
    } else {
        shipmentModuleState.currentResultsContainer.innerHTML = '<p>Upload an Excel file (.xlsx or .xlsm) to see results.</p>';
        if (shipmentModuleState.currentShipmentTabNav) shipmentModuleState.currentShipmentTabNav.style.display = 'none';
        updateButtonState(); 
    }
    
    console.log('Shipment feature initialization complete.');
  }
  // DO NOT call initializeShipmentFeature() here.
  
