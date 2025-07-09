// Jordon specific JavaScript

// --- Jordon Inline Editing State ---
let currentlyEditingRowId = null; // Stores the ID of the inventory item whose row is being edited

// Combined click handler for inventory rows (single click for popup, Ctrl+click for edit)
// This function is already being assigned as the 'click' event listener in displayInventorySummary
// We will modify its content further down.
// For now, we just need to ensure makeRowEditable and other helpers are defined before they might be called.

function makeRowEditable(row) {
    const item = currentInventorySummaryItems.find(i => i.id === row.dataset.itemId);
    if (!item) return;

    // Define cell indices based on the established mapping
    const cellsToEdit = [
        { index: 0, property: 'productCode', originalValueKey: 'originalProductCode', type: 'text', style: "width: 100px;" },
        // Skipping Product Description (index 1) and Packing Size (index 2) as they are not directly editable
        { index: 3, property: '_3plDetails.palletType', originalValueKey: 'originalPalletType', type: 'text', style: "width: 80px;" },
        { index: 4, property: '_3plDetails.location', originalValueKey: 'originalLocation', type: 'text', style: "width: 100px;" },
        { index: 5, property: '_3plDetails.lotNumber', originalValueKey: 'originalLotNumber', type: 'text', style: "width: 100px;" },
        { index: 6, property: 'batchNo', originalValueKey: 'originalBatchNo', type: 'text', style: "width: 100px;" },
        { index: 7, property: '_3plDetails.dateStored', originalValueKey: 'originalDateStored', type: 'text', style: "width: 100px;", placeholder: "DD/MM/YYYY" }, // Or type 'date' if direct date input is preferred and parsing handled
        { index: 8, property: 'container', originalValueKey: 'originalContainer', type: 'text', style: "width: 100px;" },
        { index: 9, property: 'quantity', originalValueKey: 'originalQuantity', type: 'number', style: "width: 80px; padding: 2px;", extraAttrs: `min="0"` },
        { index: 10, property: '_3plDetails.pallet', originalValueKey: 'originalPallets', type: 'number', style: "width: 80px; padding: 2px;", extraAttrs: `min="0"` }
    ];

    cellsToEdit.forEach(config => {
        const cell = row.cells[config.index];
        if (!cell) {
            console.error(`Cell at index ${config.index} not found for property ${config.property}`);
            return; // Skip this cell if not found
        }

        // Resolve nested property for fetching current value
        let currentValue = item;
        config.property.split('.').forEach(part => {
            if (currentValue && typeof currentValue === 'object') {
                currentValue = currentValue[part];
            } else {
                currentValue = ''; // Default to empty if path is invalid
            }
        });
        currentValue = (currentValue === null || currentValue === undefined) ? '' : currentValue;

        row.dataset[config.originalValueKey] = cell.textContent; // Store original displayed text
        
        let placeholder = config.placeholder ? `placeholder="${config.placeholder}"` : "";
        let extraAttrs = config.extraAttrs ? config.extraAttrs : "";
        cell.innerHTML = `<input type="${config.type}" class="inline-edit-input" value="${escapeHtml(String(currentValue))}" style="${config.style || 'width: 100%; padding: 2px;'}" ${placeholder} ${extraAttrs}>`;
    });

    // Add Save and Cancel buttons
    let actionsCell = row.querySelector('.inline-actions-cell');
    if (actionsCell) {
        actionsCell.innerHTML = ''; // Clear it before repopulating
    } else {
        actionsCell = row.insertCell(-1); // Add new cell at the end if it doesn't exist
        actionsCell.classList.add('inline-actions-cell');
    }
    
    actionsCell.innerHTML = `
        <button class="btn btn-success btn-sm inline-save-btn" style="margin-right: 5px;">Save</button>
        <button class="btn btn-danger btn-sm inline-cancel-btn">Cancel</button>
    `;

    actionsCell.querySelector('.inline-save-btn').addEventListener('click', () => saveRowChanges(row));
    actionsCell.querySelector('.inline-cancel-btn').addEventListener('click', () => revertRowToStatic(row));
}

function revertRowToStatic(row, fromCancel = true) {
    if (!row) return;
    const itemId = row.dataset.itemId;
    const item = currentInventorySummaryItems.find(i => i.id === itemId);
    
    // Define cell configurations similar to makeRowEditable for consistent access
    const cellsToRevert = [
        { index: 0, property: 'productCode', originalValueKey: 'originalProductCode' },
        // Indices 1 (Product Desc) and 2 (Packing Size) are not edited, so no direct revert action needed for inputs
        { index: 3, property: '_3plDetails.palletType', originalValueKey: 'originalPalletType' },
        { index: 4, property: '_3plDetails.location', originalValueKey: 'originalLocation' },
        { index: 5, property: '_3plDetails.lotNumber', originalValueKey: 'originalLotNumber' },
        { index: 6, property: 'batchNo', originalValueKey: 'originalBatchNo' },
        { index: 7, property: '_3plDetails.dateStored', originalValueKey: 'originalDateStored' },
        { index: 8, property: 'container', originalValueKey: 'originalContainer' },
        { index: 9, property: 'quantity', originalValueKey: 'originalQuantity' },
        { index: 10, property: '_3plDetails.pallet', originalValueKey: 'originalPallets' }
    ];

    cellsToRevert.forEach(config => {
        const cell = row.cells[config.index];
        if (!cell) {
            console.error(`Cell at index ${config.index} for reverting not found in row:`, row);
            return; // Skip if cell doesn't exist
        }

        if (fromCancel && row.dataset[config.originalValueKey] !== undefined) {
            cell.textContent = row.dataset[config.originalValueKey];
        } else if (item) {
            let valueToDisplay = item;
            config.property.split('.').forEach(part => {
                if (valueToDisplay && typeof valueToDisplay === 'object') {
                    valueToDisplay = valueToDisplay[part];
                } else {
                    valueToDisplay = ''; // Default if path is invalid
                }
            });
            cell.textContent = (valueToDisplay === null || valueToDisplay === undefined) ? '' : valueToDisplay;
        } else {
            // Fallback if item not found and not from cancel (should ideally not happen)
            cell.textContent = row.dataset[config.originalValueKey] || 'Error';
            console.warn(`Item not found for reverting ${config.property}, used original dataset value or error for row:`, itemId);
        }
        delete row.dataset[config.originalValueKey]; // Clean up dataset
    });

    const actionsCell = row.querySelector('.inline-actions-cell');
    if (actionsCell) {
        actionsCell.innerHTML = ''; // Remove Save/Cancel buttons
    }

    if (currentlyEditingRowId === itemId) {
        currentlyEditingRowId = null;
    }
}

async function saveRowChanges(row) {
    const itemId = row.dataset.itemId;
    const itemIndex = currentInventorySummaryItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
        alert("Error: Could not find item to save.");
        revertRowToStatic(row); // Revert UI
        return;
    }

    // Configuration for fields to save, matching makeRowEditable and Firestore structure
    const fieldsToSave = [
        { index: 0, property: 'productCode', type: 'text' },
        { index: 3, property: '_3plDetails.palletType', type: 'text' },
        { index: 4, property: '_3plDetails.location', type: 'text' },
        { index: 5, property: '_3plDetails.lotNumber', type: 'text' },
        { index: 6, property: 'batchNo', type: 'text' },
        { index: 7, property: '_3plDetails.dateStored', type: 'text' }, // Assuming text input for DD/MM/YYYY
        { index: 8, property: 'container', type: 'text' },
        { index: 9, property: 'quantity', type: 'number' },
        { index: 10, property: '_3plDetails.pallet', type: 'number' }
    ];

    const updateDataFirestore = {};
    const updateDataLocal = {};
    let validationFailed = false;

    fieldsToSave.forEach(config => {
        const cell = row.cells[config.index];
        const input = cell ? cell.querySelector('input') : null;
        if (!input) {
            console.error(`Input field not found for property ${config.property} at index ${config.index}.`);
            // This case should ideally not be reached if makeRowEditable worked.
            // If it does, it implies a state mismatch. For now, we'll skip this field.
            return; 
        }

        let value = input.value;
        if (config.type === 'number') {
            value = parseInt(value, 10);
            if (isNaN(value) || value < 0) {
                alert(`Invalid input for ${config.property.split('.').pop()}. Must be a non-negative number.`);
                validationFailed = true;
                return; // Stop processing this field
            }
        }
        // Add more specific validation if needed (e.g., date format for dateStored)

        // For Firestore, use dot notation for nested fields
        updateDataFirestore[config.property] = value;

        // For local update, handle nesting
        const parts = config.property.split('.');
        let currentLocal = updateDataLocal;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!currentLocal[parts[i]]) currentLocal[parts[i]] = {};
            currentLocal = currentLocal[parts[i]];
        }
        currentLocal[parts[parts.length - 1]] = value;
    });

    if (validationFailed) {
        // Do not revert here, allow user to correct.
        return; 
    }

    // Add lastModifiedAt timestamp for Firestore
    updateDataFirestore['lastModifiedAt'] = firebase.firestore.FieldValue.serverTimestamp();

    // Get a deep copy of the original item for potential revert on error
    const originalItemData = JSON.parse(JSON.stringify(currentInventorySummaryItems[itemIndex])); 

    // Show loading/saving indicator
    const saveButton = row.querySelector('.inline-save-btn');
    if (saveButton) {
        saveButton.textContent = 'Saving...';
        saveButton.disabled = true;
    }

    // Update Firestore
    try {
        const db = firebase.firestore();
        const itemRef = db.collection('inventory').doc(itemId);
        await itemRef.update(updateDataFirestore);

        // Update local cache after successful Firestore update
        // Merge updateDataLocal into currentInventorySummaryItems[itemIndex]
        const itemToUpdate = currentInventorySummaryItems[itemIndex];
        Object.keys(updateDataLocal).forEach(key => {
            if (key === '_3plDetails') { // Handle nesting for _3plDetails
                if (!itemToUpdate._3plDetails) itemToUpdate._3plDetails = {};
                Object.assign(itemToUpdate._3plDetails, updateDataLocal._3plDetails);
            } else {
                itemToUpdate[key] = updateDataLocal[key];
            }
        });
        itemToUpdate.lastModifiedAt = new Date(); // Approximate client-side timestamp

        alert('Item updated successfully!');
        revertRowToStatic(row, false); // Revert to static using the new data
        updateSummaryTotals(); 
    } catch (error) {
        console.error("Error updating item in Firestore:", error);
        alert("Error updating item: " + error.message + ". Reverting changes in UI.");
        // No need to revert currentInventorySummaryItems as we haven't modified it directly yet with new values
        // The UI revert should use the original values stored in row.dataset
        revertRowToStatic(row, true); // Revert UI to original values before edit attempt
        
        // Restore save button state
        if (saveButton) {
            saveButton.textContent = 'Save';
            saveButton.disabled = false;
        }
    }
}

// --- Report Tab Functions ---

/**
 * Fetches stock out forms from the 'jordonWithdrawForms' collection in Firestore.
 * Orders them by creation date in descending order.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of form objects, each with an 'id' property.
 */
async function loadStockOutFormsReport() {
    console.log("loadStockOutFormsReport() called");
    const reportContentContainer = document.getElementById('report-content-container');
    if (reportContentContainer) {
        reportContentContainer.innerHTML = '<p>Loading reports...</p>';
    }

    const db = firebase.firestore();
    const forms = [];
    try {
        const formsQuery = db.collection('jordonWithdrawForms')
            .orderBy('createdAt', 'desc'); // Order by creation time, newest first
        const snapshot = await formsQuery.get();

        if (snapshot.empty) {
            console.log("No Jordon stock out forms found.");
            if (reportContentContainer) {
                reportContentContainer.innerHTML = '<p>No stock out forms found.</p>';
            }
            return forms; // Return empty array
        }

        snapshot.forEach(doc => {
            forms.push({ id: doc.id, ...doc.data() });
        });

        console.log('Loaded Jordon stock out forms:', forms);
        return forms;

    } catch (error) {
        console.error("Error loading Jordon stock out forms:", error);
        if (reportContentContainer) {
            reportContentContainer.innerHTML = '<p style="color: red;">Error loading stock out forms. Please try again.</p>';
        }
        throw error; // Re-throw the error to be caught by the caller
    }
}

/**
 * Displays the fetched stock out forms in a table within the "Report" tab.
 * @param {Array<Object>} forms - An array of form objects.
 */
function displayStockOutFormsReport(forms) {
    const reportContentContainer = document.getElementById('report-content-container');
    if (!reportContentContainer) {
        console.error('Report content container (#report-content-container) not found.');
        return;
    }

    if (!forms || forms.length === 0) {
        reportContentContainer.innerHTML = '<p>No stock out forms available to display.</p>';
        return;
    }

    let tableHtml = `
        <h2>Jordon Stock Out Forms</h2>
        <table class="table-styling-class"> <!-- Use a general styling class if available -->
            <thead>
                <tr>
                    <th>Serial Number</th>
                    <th>Withdraw Date</th>
                    <th>Collection Time</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    forms.forEach(form => {
        const withdrawDateParts = form.withdrawDate ? form.withdrawDate.split('-') : [];
        const formattedWithdrawDate = withdrawDateParts.length === 3 ? `${withdrawDateParts[2]}/${withdrawDateParts[1]}/${withdrawDateParts[0]}` : escapeHtml(form.withdrawDate || 'N/A');
        
        let createdAtStr = 'N/A';
        if (form.createdAt && form.createdAt.toDate) {
            try {
                createdAtStr = form.createdAt.toDate().toLocaleString();
            } catch (e) {
                console.warn("Could not format createdAt timestamp for form:", form.id, form.createdAt);
                // Keep 'N/A' or use a fallback string
            }
        } else if (form.createdAt) {
            // If it's already a string or number, display as is, or attempt basic formatting if it's a recognizable timestamp
            createdAtStr = String(form.createdAt); 
        }

        tableHtml += `
            <tr>
                <td>${escapeHtml(form.serialNumber || 'N/A')}</td>
                <td>${formattedWithdrawDate}</td>
                <td>${escapeHtml(form.collectionTime || 'N/A')}</td>
                <td>${escapeHtml(form.status || 'N/A')}</td>
                <td>${escapeHtml(createdAtStr)}</td>
                <td>
                    <button class="btn btn-info btn-sm view-stock-out-form-btn" data-form-id="${escapeHtml(form.id)}">View/Reprint</button>
                </td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    reportContentContainer.innerHTML = tableHtml;
}

/**
 * Handles the click on a "View/Reprint" button for a stock out form.
 * Fetches the specific form data from Firestore and then uses
 * `generatePrintableStockOutHTML` to display it in a new window.
 * @param {string} formId - The ID of the Jordon Withdraw Form document in Firestore.
 */
async function handleViewStockOutForm(formId) {
    console.log("handleViewStockOutForm called for form ID:", formId);
    if (!formId) {
        alert("Error: Form ID is missing. Cannot display form.");
        return;
    }

    try {
        const db = firebase.firestore();
        const formRef = db.collection('jordonWithdrawForms').doc(formId);
        const doc = await formRef.get();

        if (!doc.exists) {
            console.error("No such document with ID:", formId);
            alert("Error: Could not find the specified stock out form. It may have been deleted.");
            return;
        }

        const formData = { id: doc.id, ...doc.data() };

        // The formData should now have the same structure as expected by generatePrintableStockOutHTML
        // (serialNumber, withdrawDate, collectionTime, items array)
        // If items within formData are structured differently than what generatePrintableStockOutHTML expects,
        // you might need to transform them here. Assuming the structure is compatible.

        let itemsArray = formData.items;
        // Check if items is an object (map) and not an array, then convert
        if (formData.items && typeof formData.items === 'object' && !Array.isArray(formData.items)) {
            // console.log("formData.items is an object/map, converting to array for printing.");
            // Attempt to convert, assuming keys are somewhat ordered or order isn't critical for display here.
            // If keys are numerical strings "0", "1", "2", sorting might be better.
            itemsArray = Object.keys(formData.items)
                .sort((a, b) => parseInt(a) - parseInt(b)) // Sort by numerical key "0", "1", ...
                .map(key => formData.items[key]);
        }

        if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
            console.error("Form data 'items' is not a valid array or is empty after potential conversion:", itemsArray, "Original formData.items:", formData.items);
            alert("Error: The form data (items) is incomplete, corrupted, or empty. Cannot display items.");
            return;
        }
        
        // Create a new formData object for printing that definitely has 'items' as an array
        const formDataForPrint = { ...formData, items: itemsArray };

        // console.log("Data being sent to generatePrintableStockOutHTML:", JSON.stringify(formDataForPrint, null, 2));
        
        // Ensure withdrawDate is in 'YYYY-MM-DD' format if generatePrintableStockOutHTML expects that for splitting.
        // Firestore timestamps might need conversion. Assuming it's stored as a string 'YYYY-MM-DD' or compatible.
        // If `formData.withdrawDate` is a Firestore Timestamp object, convert it:
        // if (formData.withdrawDate && typeof formData.withdrawDate.toDate === 'function') {
        //     const dateObj = formData.withdrawDate.toDate();
        //     const year = dateObj.getFullYear();
        //     const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        //     const day = String(dateObj.getDate()).padStart(2, '0');
        //     formData.withdrawDate = `${year}-${month}-${day}`;
        // }


        const printableHTML = generatePrintableStockOutHTML(formDataForPrint); // Use the modified formData
        const printWindow = window.open('', '_blank', 'height=600,width=800');

        if (printWindow) {
            printWindow.document.write(printableHTML);
            printWindow.document.close();
            printWindow.focus();
            // Some browsers might block print() if called too quickly or without user interaction.
            // For re-printing, it's generally fine.
            printWindow.print();
        } else {
            alert('Could not open print window. Please check your browser pop-up blocker settings.');
        }

    } catch (error) {
        console.error("Error fetching or displaying stock out form:", error);
        alert("An error occurred while trying to display the form: " + error.message);
    }
}

function updateSummaryTotals() {
    const summaryTotalCartonsEl = document.getElementById('summary-total-cartons');
    const summaryTotalPalletsEl = document.getElementById('summary-total-pallets');
    if (!summaryTotalCartonsEl || !summaryTotalPalletsEl) return;

    let totalCartons = 0;
    let totalPallets = 0;
    currentInventorySummaryItems.forEach(item => {
        totalCartons += Number(item.quantity) || 0;
        totalPallets += (item._3plDetails && item._3plDetails.pallet !== undefined ? Number(item._3plDetails.pallet) : 0);
    });
    summaryTotalCartonsEl.textContent = totalCartons;
    summaryTotalPalletsEl.textContent = totalPallets;
}
// End of Inline Editing Functions

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
                <td style="font-size: 9pt;">${escapeHtml(item.productPackaging)}</td> <!-- Smaller packing size font -->
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.lotNumber)}</td>
                <td>${escapeHtml(item.palletsToStockOut)}</td> <!-- Changed from palletId to palletsToStockOut -->
                <td>${escapeHtml(item.quantityToStockOut)}</td>
                <td>${escapeHtml(item.batchNumber)}</td>
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
                @page { size: A4; margin: 0; }
                body { 
                    font-family: Arial, sans-serif; 
                    font-size: 12pt; 
                    margin: 0; 
                    line-height: 1.3;
                }
                .content {
                    margin: 30px;
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    margin-top: 20px; 
                    margin-bottom: 20px;
                    font-size: 10pt; /* Smaller font size for table */
                }
                th, td { 
                    border: 1px solid black; 
                    padding: 6px; /* Reduced padding for smaller text */
                    text-align: left; 
                }
                th { 
                    background-color: #f2f2f2; 
                    font-size: 10pt; /* Match header font size with table */
                }
                .header { margin-bottom: 20px; }
                .header p { margin: 3px 0; }
                .company-name-container {
                    margin-top: 30px;
                }
                .company-name { 
                    font-weight: bold; 
                    text-decoration: underline; 
                    font-size: 16pt; 
                    margin-bottom: 5px;
                }
                .date-container {
                    margin: 40px 0;
                }
                .date { 
                    font-weight: bold; 
                    font-size: 14pt; 
                }
                .bold { font-weight: bold; }
                .right-align { 
                    text-align: right; 
                    margin-top: 10px;
                }
                .header-row { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-start;
                }
                .header-left { flex: 1; }
                .header-right { text-align: right; }
                h2 { 
                    font-size: 14pt; 
                    margin-top: 20px;
                    margin-bottom: 10px;
                    text-align: center;
                }
                .footer { margin-top: 20px; }
                .footer-row { 
                    display: flex; 
                    justify-content: space-between; 
                    margin-top: 40px;
                }
                .footer-item { 
                    flex: 1; 
                    text-align: left; 
                    margin-right: 30px;
                }
                .footer-line { 
                    border-top: 1px solid black; 
                    margin-top: 60px;
                    width: 100%;
                }
                .withdraw-date-styled { 
                    font-weight: bold; 
                    font-size: 14pt; 
                }
            </style>
        </head>
        <body>
            <div class="content">
                <div class="header">
                    <div class="header-row">
                        <div class="header-left">
                            <div class="company-name-container">
                                <p class="company-name">Li Chuan Food Product Pte Ltd</p>
                                <p>40 Woodlands Terrace 738456</p>
                                <p>Tel 65 6755 7688 Fax 65 6755 6698</p>
                            </div>
                        </div>
                        <div class="header-right">
                            <p class="bold">S/N: ${escapeHtml(serialNumber)}</p>
                        </div>
                    </div>
                    <div class="date-container">
                        <p class="date">Withdraw Date: ${formattedWithdrawDate}</p>
                    </div>
                    <p class="attn">Attn: Jordon Food Industries Pte Ltd</p>
                    <p>13 Woodlands Loop, Singapore 738284</p>
                    <p>Tel: +65 6551 5083 Fax: +65 6257 8660</p>
                    <p class="right-align"><span class="bold">Collection Time: ${escapeHtml(collectionTime)}</span></p>
                </div>
                <h2>Jordon Withdraw Form</h2>
                <table>
                    <thead>
                        <tr>
                            <th>No.</th>
                            <th>Product Name</th>
                            <th>Packing Size</th>
                            <th>Loc</th> <!-- Changed from "Location" to "Loc" -->
                            <th>Lot No</th>
                            <th>Plts</th>
                            <th>Qty</th> <!-- Changed from "Quantity" to "Qty" -->
                            <th>Batch No</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
                <div class="footer">
                    <p>Regards,</p>
                    <div class="footer-row">
                        <div class="footer-item">
                            <p>Issue By:</p>
                            <div class="footer-line"></div>
                        </div>
                        <div class="footer-item">
                            <p>Collected By:</p>
                            <div class="footer-line"></div>
                        </div>
                        <div class="footer-item">
                            <p>Verified By:</p>
                            <div class="footer-line"></div>
                        </div>
                    </div>
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

async function fetchProductDetailsByCodes(productCodes) { // Removed db parameter, not needed
    const productDetailsMap = new Map();
    if (!productCodes || productCodes.length === 0) {
        return productDetailsMap;
    }

    if (!window.productAPI || typeof window.productAPI.getProductByCode !== 'function') {
        console.error("Jordon: window.productAPI.getProductByCode is not available. Cannot fetch product details.");
        return productDetailsMap;
    }

    const uniqueProductCodes = [...new Set(productCodes)]; // Process unique codes

    for (const code of uniqueProductCodes) {
        try {
            const product = await window.productAPI.getProductByCode(code);
            if (product) {
                productDetailsMap.set(code, {
                    name: product.name || 'N/A',
                    packaging: product.packaging || 'N/A',
                    productId: product.id 
                });
            } else {
                // console.warn(`Jordon: Product details not found via productAPI for code: ${code}`);
                // No need to explicitly warn here, the calling function will handle fallbacks or final warnings.
            }
        } catch (error) {
            console.error(`Jordon: Error fetching product details for code ${code} via productAPI:`, error);
        }
    }
    // console.log("Jordon: fetchProductDetailsByCodes completed. Map size:", productDetailsMap.size);
    return productDetailsMap;
}

async function loadPendingJordonStock() {
    const stockInTableBody = document.getElementById('stock-in-table-body');
    if (!window.supabaseClient) {
        console.error("Supabase client not initialized.");
        if (stockInTableBody) {
            stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Error: Supabase client not available.</td></tr>';
        }
        return [];
    }

    try {
        const { data: inventoryItems, error } = await window.supabaseClient
            .from('inventory')
            .select('*')
            .eq('warehouse_id', 'jordon')
            .eq('_3pl_details->>status', 'pending'); // Query JSONB status, CORRECTED COLUMN NAME

        if (error) {
            console.error("Error loading pending Jordon stock from Supabase:", error);
            throw error;
        }

        if (!inventoryItems || inventoryItems.length === 0) {
            console.log("No pending Jordon stock found in Supabase.");
            return [];
        }

        // Map Supabase data (snake_case to camelCase if needed by subsequent functions)
        // For now, assuming downstream functions can handle original Supabase column names or _3pl_details structure.
        // id, productCode, _3pl_details, batchNo, container, quantity, excelRowNumber are expected.
        // Supabase returns columns as they are in the DB. If they are product_code, we need to map.
        // Assuming productCode, batchNo, container, quantity, excelRowNumber are direct column names.
        const mappedInventoryItems = inventoryItems.map(item => ({
            id: item.id, // Assuming 'id' is the primary key
            productCode: item.product_code, // Assuming 'product_code' from Supabase
            _3plDetails: item._3pl_details, // CORRECTED COLUMN NAME, mapped to _3plDetails for JS consistency
            batchNo: item.batch_no, // Assuming 'batch_no'
            container: item.container, // Assuming 'container'
            quantity: item.quantity,
            excelRowNumber: item.excel_row_number, // Assuming 'excel_row_number'
            warehouseId: item.warehouse_id // Keep for consistency if needed elsewhere
        }));
        
        const originalJordonCodes = mappedInventoryItems
            .map(item => item.productCode)
            .filter(code => code);

        const codesToActuallyFetch = new Set();
        originalJordonCodes.forEach(code => {
            codesToActuallyFetch.add(code);
            if (code.endsWith('.1')) {
                codesToActuallyFetch.add(code.slice(0, -2));
            } else {
                codesToActuallyFetch.add(code + '.1');
            }
        });
        const productCodesForDbQuery = Array.from(codesToActuallyFetch);

        const productDetailsMap = await fetchProductDetailsByCodes(productCodesForDbQuery);

        const pendingItemsWithProducts = mappedInventoryItems.map(inventoryItem => {
            let productName = 'N/A';
            let productPackaging = 'N/A';
            let details;

            if (inventoryItem.productCode) {
                details = productDetailsMap.get(inventoryItem.productCode);
                if (!details) {
                    if (inventoryItem.productCode.endsWith('.1')) {
                        const trimmedCode = inventoryItem.productCode.slice(0, -2);
                        details = productDetailsMap.get(trimmedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${trimmedCode} in pending stock`);
                    } else {
                        const suffixedCode = inventoryItem.productCode + '.1';
                        details = productDetailsMap.get(suffixedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${suffixedCode} in pending stock`);
                    }
                }
            }

            if (details) {
                productName = details.name;
                productPackaging = details.packaging;
            } else if (inventoryItem.productCode) {
                console.warn(`Product details not found for ${inventoryItem.productCode} (after all fallbacks) in pending stock.`);
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode.`);
            }
            return { ...inventoryItem, productName, productPackaging };
        });

        pendingItemsWithProducts.sort((a, b) => {
            const rowNumA = a.excelRowNumber;
            const rowNumB = b.excelRowNumber;
            if (rowNumA == null || typeof rowNumA !== 'number') return 1;
            if (rowNumB == null || typeof rowNumB !== 'number') return -1;
            return rowNumA - rowNumB;
        });

        console.log('Loaded and sorted pending Jordon stock with product details from Supabase:', pendingItemsWithProducts);
        return pendingItemsWithProducts;

    } catch (error) {
        console.error("Error processing pending Jordon stock from Supabase:", error.message);
        if (stockInTableBody) {
            stockInTableBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:red;">Error loading pending stock: ${error.message}. Please try again.</td></tr>`;
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
        
        // Format and display Date Stored
        const dateStoredCell = newRow.insertCell();
        if (threePlDetails && threePlDetails.dateStored) {
            try {
                const dateObj = new Date(threePlDetails.dateStored);
                const day = String(dateObj.getUTCDate()).padStart(2, '0');
                const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-indexed
                const year = dateObj.getUTCFullYear();
                dateStoredCell.textContent = `${day}/${month}/${year}`;
            } catch (e) {
                console.warn("Error formatting dateStored in displayPendingStockInTable:", threePlDetails.dateStored, e);
                dateStoredCell.textContent = threePlDetails.dateStored; // Fallback to original string
            }
        } else {
            dateStoredCell.textContent = '';
        }

        newRow.insertCell().textContent = item.container || '';
        newRow.insertCell().textContent = item.quantity !== undefined ? item.quantity : 0;
        newRow.insertCell().textContent = (threePlDetails && threePlDetails.pallet !== undefined) ? threePlDetails.pallet : '';
        newRow.insertCell().innerHTML = '<input type="text" class="form-control form-control-sm mixed-pallet-group-id-input" placeholder="Enter Group ID">';
    });
}

async function loadInventorySummaryData() {
    console.log("loadInventorySummaryData() called");
    const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody');
    if (summaryTableBody) {
        summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading Jordon inventory summary from Supabase...</td></tr>';
    }

    if (!window.supabaseClient) {
        console.error("Supabase client not initialized for Inventory Summary.");
        if (summaryTableBody) {
            summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Error: Supabase client not available.</td></tr>';
        }
        currentInventorySummaryItems = [];
        return [];
    }

    try {
        const { data: inventoryItems, error } = await window.supabaseClient
            .from('inventory')
            .select('*')
            .eq('warehouse_id', 'jordon')
            .order('_3pl_details->>dateStored', { ascending: true }) // CORRECTED COLUMN NAME
            .order('_3pl_details->>lotNumber', { ascending: true }); // CORRECTED COLUMN NAME

        if (error) {
            console.error("Error loading Jordon inventory summary from Supabase:", error);
            throw error;
        }

        if (!inventoryItems || inventoryItems.length === 0) {
            console.log("No Jordon inventory items found in Supabase for summary.");
            if (summaryTableBody) summaryTableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No inventory items found for Jordon.</td></tr>';
            currentInventorySummaryItems = [];
            return [];
        }

        // Map Supabase data (snake_case to camelCase if needed by subsequent functions)
        const mappedInventoryItems = inventoryItems.map(item => ({
            id: item.id,
            productCode: item.product_code, // Assuming 'product_code'
            _3plDetails: item._3pl_details, // CORRECTED COLUMN NAME, mapped to _3plDetails for JS consistency
            batchNo: item.batch_no, // Assuming 'batch_no'
            container: item.container,
            quantity: item.quantity,
            // warehouseId: item.warehouse_id // Not strictly needed by displayInventorySummary but good for consistency
        }));

        const originalJordonCodes = mappedInventoryItems
            .map(item => item.productCode)
            .filter(code => code);
        
        const codesToActuallyFetch = new Set();
        originalJordonCodes.forEach(code => {
            codesToActuallyFetch.add(code);
            if (code.endsWith('.1')) {
                codesToActuallyFetch.add(code.slice(0, -2));
            } else {
                codesToActuallyFetch.add(code + '.1');
            }
        });
        const productCodesForDbQuery = Array.from(codesToActuallyFetch);

        const productDetailsMap = await fetchProductDetailsByCodes(productCodesForDbQuery);

        const summaryItems = mappedInventoryItems.map(inventoryItem => {
            let productName = 'N/A';
            let productPackaging = 'N/A';
            let productId = null; 
            let details;

            if (inventoryItem.productCode) {
                details = productDetailsMap.get(inventoryItem.productCode);
                if (!details) {
                    if (inventoryItem.productCode.endsWith('.1')) {
                        const trimmedCode = inventoryItem.productCode.slice(0, -2);
                        details = productDetailsMap.get(trimmedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${trimmedCode} in Jordon summary`);
                    } else {
                        const suffixedCode = inventoryItem.productCode + '.1';
                        details = productDetailsMap.get(suffixedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${suffixedCode} in Jordon summary`);
                    }
                }
            }

            if (details) {
                productName = details.name;
                productPackaging = details.packaging;
                productId = details.productId; 
            } else if (inventoryItem.productCode) {
                console.warn(`Product details not found for ${inventoryItem.productCode} (after all fallbacks) in Jordon summary`);
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode during summary load.`);
            }
            // Ensure all fields expected by displayInventorySummary are present
            // displayInventorySummary expects: id, productCode, productName, productPackaging, _3plDetails, batchNo, container, quantity, productId
            return { 
                ...inventoryItem, // Contains id, productCode, _3plDetails, batchNo, container, quantity
                productName, 
                productPackaging, 
                productId 
            };
        });
        
        console.log('Loaded Jordon inventory summary data from Supabase:', summaryItems);
        currentInventorySummaryItems = summaryItems; // Update global cache
        return summaryItems;

    } catch (error) {
        console.error("Error processing Jordon inventory summary from Supabase:", error.message);
        if (summaryTableBody) {
            summaryTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:red;">Error loading inventory summary: ${error.message}. Please check connection or try again later.</td></tr>`;
        }
        currentInventorySummaryItems = [];
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
        
        // Format and display Date Stored
        const dateStoredCell = row.insertCell();
        if (threePlDetails && threePlDetails.dateStored) {
            try {
                const dateObj = new Date(threePlDetails.dateStored);
                const day = String(dateObj.getUTCDate()).padStart(2, '0');
                const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-indexed
                const year = dateObj.getUTCFullYear();
                dateStoredCell.textContent = `${day}/${month}/${year}`;
            } catch (e) {
                console.warn("Error formatting dateStored in displayInventorySummary:", threePlDetails.dateStored, e);
                dateStoredCell.textContent = threePlDetails.dateStored; // Fallback to original string
            }
        } else {
            dateStoredCell.textContent = '';
        }

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
             row.addEventListener('click', handleInventoryRowClick); // Changed: This will now handle both single and Ctrl+click
             // row.addEventListener('dblclick', handleInventoryRowDoubleClick); // Removed dblclick listener
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

export async function initJordonTabs(containerElement) { 
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

    function handleReportTabActivation() {
        console.log('Report tab is active, calling loadStockOutFormsReport().');
        const reportContentContainer = document.getElementById('report-content-container'); // Assuming this ID exists or will be created in HTML
        if (reportContentContainer) {
            reportContentContainer.innerHTML = '<p>Loading reports...</p>'; // Show loading message
        }
        loadStockOutFormsReport()
            .then(forms => {
                displayStockOutFormsReport(forms);
            })
            .catch(error => {
                console.error('Error loading or displaying stock out forms report:', error);
                if (reportContentContainer) {
                    reportContentContainer.innerHTML = '<p style="color: red;">Failed to load reports. Please try again.</p>';
                }
            });
    }
    
    const summaryTableBody = document.getElementById('jordon-inventory-summary-tbody'); // For inventory summary loading message

    tabItems.forEach(tab => {
        tab.addEventListener('click', function() {
            activateJordonTab(this); 
            const activeTab = this.dataset.tab;
            if (activeTab === 'stock-in') {
                handleStockInTabActivation();
            } else if (activeTab === 'inventory-summary') {
                console.log('Inventory Summary tab selected, calling loadInventorySummaryData().');
                loadInventorySummaryData()
                    .then(displayInventorySummary)
                    .catch(error => console.error('Error details from inventory summary tab click:', error));
            } else if (activeTab === 'report') {
                handleReportTabActivation();
            }
        });
    });

    const initiallyActiveTab = tabContainer.querySelector('.tab-item.active');
    if (initiallyActiveTab) {
        const activeTabName = activateJordonTab(initiallyActiveTab);
        if (activeTabName) { // activateJordonTab returns the content ID string or null
            const tabType = initiallyActiveTab.dataset.tab;
            if (tabType === 'stock-in') {
                handleStockInTabActivation();
            } else if (tabType === 'inventory-summary') {
                loadInventorySummaryData().then(displayInventorySummary).catch(console.error);
            } else if (tabType === 'report') {
                handleReportTabActivation();
            }
        }
    } else if (tabItems.length > 0) { 
        const firstTabName = activateJordonTab(tabItems[0]);
        if (firstTabName) {
            const tabType = tabItems[0].dataset.tab;
            if (tabType === 'stock-in') {
                handleStockInTabActivation();
            } else if (tabType === 'inventory-summary') {
                loadInventorySummaryData().then(displayInventorySummary).catch(console.error);
            } else if (tabType === 'report') {
                handleReportTabActivation();
            }
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

    // Event listener for report content section
    const reportContentDiv = document.getElementById('report-content');
    if (reportContentDiv) {
        reportContentDiv.addEventListener('click', function(event) {
            if (event.target.classList.contains('view-stock-out-form-btn')) {
                const formId = event.target.dataset.formId;
                if (formId) {
                    handleViewStockOutForm(formId);
                } else {
                    console.warn('View button clicked but form ID was missing.');
                    alert('Could not retrieve form details: ID missing.');
                }
            }
        });
    } else {
        console.warn('#report-content div not found for event delegation.');
    }

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
    const itemId = row.dataset.itemId;

    if (event.ctrlKey) {
        // Ctrl+Click: Enter or manage edit mode
        event.preventDefault(); // Prevent any default ctrl+click behavior (like opening context menu on some systems)

        if (currentlyEditingRowId === itemId) {
            return; // Row is already in edit mode, do nothing further on ctrl+click
        }
        if (currentlyEditingRowId && currentlyEditingRowId !== itemId) {
            // Another row is being edited, revert it first
            const previousEditingRow = document.querySelector(`#jordon-inventory-summary-tbody tr[data-item-id="${currentlyEditingRowId}"]`);
            if (previousEditingRow) {
                revertRowToStatic(previousEditingRow);
            }
        }
        currentlyEditingRowId = itemId;
        makeRowEditable(row);

    } else {
        // Single Click (no Ctrl): Show stock-out popup
        // Ensure row is not in edit mode before showing popup
        if (currentlyEditingRowId === itemId) {
             // If the clicked row is the one being edited, do not show the popup.
             // User should save or cancel edit mode first.
            return;
        }
        // If another row is being edited, revert it before showing popup for the current row.
        if (currentlyEditingRowId && currentlyEditingRowId !== itemId) {
            const previousEditingRow = document.querySelector(`#jordon-inventory-summary-tbody tr[data-item-id="${currentlyEditingRowId}"]`);
            if (previousEditingRow) {
                revertRowToStatic(previousEditingRow);
            }
        }


        const stockOutPopup = document.getElementById('stock-out-popup');
        if (!stockOutPopup) {
            console.error("Cannot handle row click: Stock out popup not found.");
            return;
        }

        const clickedMixedPalletGroupId = row.dataset.mixedPalletGroupId;
        const clickedLotNumber = row.dataset.lotNumber;
        const clickedDateStored = row.dataset.dateStored;
        const clickedItemId = itemId; // Use itemId from the top

        let itemsForPopup = [];
        const originalItem = {
            id: clickedItemId,
            productCode: row.dataset.productCode,
            productName: row.dataset.productName,
            productPackaging: row.dataset.productPackaging,
            _3plDetails: {
                palletType: row.dataset.palletType,
                location: row.dataset.location,
                lotNumber: clickedLotNumber,
                dateStored: clickedDateStored,
                mixedPalletGroupId: clickedMixedPalletGroupId,
                pallet: row.dataset.pallets || '0',
            },
            batchNo: row.dataset.batchNo,
            container: row.dataset.container,
            quantity: parseInt(row.dataset.quantity, 10),
            productId: row.dataset.productId,
        };
        itemsForPopup.push(originalItem);

        if (clickedMixedPalletGroupId && clickedMixedPalletGroupId.trim() !== '') {
            const matchingItems = currentInventorySummaryItems.filter(item => {
                return item._3plDetails &&
                       item._3plDetails.mixedPalletGroupId === clickedMixedPalletGroupId &&
                       item._3plDetails.dateStored === clickedDateStored &&
                       item.id !== clickedItemId;
            });
            itemsForPopup = itemsForPopup.concat(matchingItems);
        }

        const popupInfoSection = stockOutPopup.querySelector('.popup-info-section');
        if (!popupInfoSection) {
            stockOutPopup.style.display = 'block';
            return;
        }
        popupInfoSection.innerHTML = '';

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

            const itemInputGroup = document.createElement('div');
            itemInputGroup.className = 'popup-item-input-group';
            const qtyLabel = document.createElement('label');
            qtyLabel.setAttribute('for', `stock-out-quantity-${itemObject.id}`);
            qtyLabel.textContent = `Quantity for ${itemObject.productCode} (Lot: ${itemObject._3plDetails?.lotNumber || 'N/A'}):`;
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.id = `stock-out-quantity-${itemObject.id}`;
            qtyInput.name = `stock-out-quantity-${itemObject.id}`;
            qtyInput.className = 'dynamic-stock-out-quantity';
            Object.assign(qtyInput.dataset, {
                itemId: itemObject.id,
                productId: itemObject.productId || '',
                productCode: itemObject.productCode || '',
                productName: itemObject.productName || 'N/A',
                batchNo: itemObject.batchNo || '',
                warehouseId: 'jordon',
                currentQuantity: itemObject.quantity !== undefined ? itemObject.quantity : 0,
                location: (itemObject._3plDetails && itemObject._3plDetails.location) || '',
                lotNumber: (itemObject._3plDetails && itemObject._3plDetails.lotNumber) || '',
                productPackaging: itemObject.productPackaging || 'N/A',
                palletType: (itemObject._3plDetails && itemObject._3plDetails.palletType) || '',
                container: itemObject.container || '',
                dateStored: (itemObject._3plDetails && itemObject._3plDetails.dateStored) || '',
                currentPallets: (itemObject._3plDetails && itemObject._3plDetails.pallet) || '0'
            });
            const palletLabel = document.createElement('label');
            palletLabel.setAttribute('for', `stock-out-pallet-quantity-${itemObject.id}`); // Changed ID reference
            palletLabel.textContent = `Pallets to Stock Out (for ${itemObject.productCode}, Lot: ${itemObject._3plDetails?.lotNumber || 'N/A'}):`; // Changed label
            const palletInput = document.createElement('input');
            palletInput.type = 'number'; // Changed type to number
            palletInput.id = `stock-out-pallet-quantity-${itemObject.id}`; // Changed ID
            palletInput.name = `stock-out-pallet-quantity-${itemObject.id}`; // Changed name
            palletInput.className = 'dynamic-stock-out-pallet-quantity'; // Changed class name
            palletInput.min = "0"; // Prevent negative numbers
            // We might want to set a max based on currentPallets later, or validate in handleAddToStockOutList
            palletInput.dataset.itemId = itemObject.id; 
            // Add current pallets info to dataset for validation access later if needed, though currentPallets is on qtyInput.dataset
            // palletInput.dataset.currentPallets = qtyInput.dataset.currentPallets; 

            itemInputGroup.append(qtyLabel, qtyInput, document.createElement('br'), palletLabel, palletInput);
            popupInfoSection.appendChild(itemInputGroup);
            if (itemsForPopup.length > 1 && index < itemsForPopup.length - 1) {
                itemInputGroup.style.paddingBottom = '15px';
                itemInputGroup.style.marginBottom = '15px';
                itemInputGroup.style.borderBottom = '1px solid #ccc';
            }
        });
        
        stockOutPopup.dataset.clickedMixedPalletGroupId = clickedMixedPalletGroupId;
        stockOutPopup.dataset.clickedItemId = clickedItemId;
        stockOutPopup.style.display = 'block';
        const firstQtyInput = stockOutPopup.querySelector('.dynamic-stock-out-quantity');
        if (firstQtyInput) {
            firstQtyInput.focus();
        }
    }
}

/**
 * Handles adding an item to the temporary stock-out list (`jordonStockOutItems`).
 * Retrieves data from the stock-out popup, validates it, creates a stock-out item object,
 * and then updates the UI.
 */
function handleAddToStockOutList() {
    const stockOutPopup = document.getElementById('stock-out-popup');
    const dynamicQuantityInputs = stockOutPopup.querySelectorAll('.dynamic-stock-out-quantity');
    // Query for the new class name for pallet quantity inputs
    const dynamicPalletQuantityInputs = stockOutPopup.querySelectorAll('.dynamic-stock-out-pallet-quantity');

    if (!stockOutPopup || dynamicQuantityInputs.length === 0) {
        console.error("Popup or dynamic quantity inputs not found.");
        alert("Error: Could not process the request. Popup input elements missing.");
        return;
    }
    // Ensure we have a corresponding pallet quantity input for each quantity input
    if (dynamicQuantityInputs.length !== dynamicPalletQuantityInputs.length) {
        console.error("Mismatch between quantity inputs and pallet quantity inputs.");
        alert("Error: UI inconsistency for stock out inputs. Please refresh.");
        return;
    }

    let allItemsValid = true;
    const itemsToAdd = [];

    dynamicQuantityInputs.forEach((qtyInput, index) => {
        const itemId = qtyInput.dataset.itemId;
        // Get the corresponding pallet quantity input using the index or by matching itemId if IDs are consistent
        const palletQtyInput = stockOutPopup.querySelector(`#stock-out-pallet-quantity-${itemId}`); 

        const quantityToStockOut = parseInt(qtyInput.value, 10);
        let palletsToStockOut = 0; // Default to 0 if input is empty or invalid initially
        if (palletQtyInput && palletQtyInput.value.trim() !== '') {
            palletsToStockOut = parseInt(palletQtyInput.value, 10);
        }
        
        const currentQuantity = parseInt(qtyInput.dataset.currentQuantity, 10);
        const currentPallets = parseInt(qtyInput.dataset.currentPallets, 10);

        // Skip item if quantity input is empty (treat as no stock out for this item in multi-item popup)
        if (qtyInput.value.trim() === '') {
            // If pallet quantity is also empty or zero, it's fine to skip.
            // If pallet quantity has a value but carton quantity is zero/empty, it's ambiguous.
            // For now, primarily driven by carton quantity.
            if (!palletQtyInput || palletQtyInput.value.trim() === '' || palletsToStockOut === 0) {
                return; // Skip this item entirely
            }
            // If pallet quantity is specified but carton quantity is not, this might be an issue.
            // For now, we require carton quantity to be > 0 if any stock out is happening.
        }
        
        // Validate Carton Quantity
        if (isNaN(quantityToStockOut) || quantityToStockOut < 0) {
            alert(`Please enter a valid non-negative quantity for item ${qtyInput.dataset.productCode} (Lot: ${qtyInput.dataset.lotNumber}).`);
            qtyInput.focus();
            allItemsValid = false;
            return; 
        }
        if (quantityToStockOut > currentQuantity) {
            alert(`Carton quantity to stock out (${quantityToStockOut}) for item ${qtyInput.dataset.productCode} (Lot: ${qtyInput.dataset.lotNumber}) cannot exceed current available quantity (${currentQuantity}).`);
            qtyInput.focus();
            allItemsValid = false;
            return; 
        }

        // Validate Pallet Quantity
        if (isNaN(palletsToStockOut) || palletsToStockOut < 0) {
            alert(`Please enter a valid non-negative pallet quantity for item ${qtyInput.dataset.productCode} (Lot: ${qtyInput.dataset.lotNumber}).`);
            if (palletQtyInput) palletQtyInput.focus();
            allItemsValid = false;
            return;
        }
        if (palletsToStockOut > currentPallets) {
            alert(`Pallet quantity to stock out (${palletsToStockOut}) for item ${qtyInput.dataset.productCode} (Lot: ${qtyInput.dataset.lotNumber}) cannot exceed current available pallets (${currentPallets}).`);
            if (palletQtyInput) palletQtyInput.focus();
            allItemsValid = false;
            return;
        }

        // If both are 0, skip (unless user explicitly entered 0 for an item they want to clear from list later - current logic skips)
        if (quantityToStockOut === 0 && palletsToStockOut === 0 && qtyInput.value.trim() === '' && (!palletQtyInput || palletQtyInput.value.trim() === '')) {
            return;
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
            palletsToStockOut: palletsToStockOut, // Corrected: was 'palletId,'
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
        alert("No items with valid quantities or pallet quantities were entered for stock out.");
        return;
    }

    jordonStockOutItems.push(...itemsToAdd);
    
    renderStockOutPreview(); // Update the displayed list of items to be stocked out

    // Clear inputs and hide the popup
    dynamicQuantityInputs.forEach(input => input.value = '');
    // Also clear the new pallet quantity inputs
    dynamicPalletQuantityInputs.forEach(input => input.value = ''); 
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

    if (!window.supabaseClient) {
        console.error("Supabase client not initialized for handleSubmitStockIn.");
        alert("Error: Supabase client not available. Cannot submit stock in.");
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

        // Find the original item from currentInventorySummaryItems or loadPendingJordonStock's result
        // to get the existing _3plDetails. This is crucial for Supabase JSONB updates.
        // For simplicity, we'll assume loadPendingJordonStock was called and its results are available
        // or we refetch the specific item if necessary.
        // However, the current structure of displayPendingStockInTable doesn't store the full original item easily.
        // A better approach would be to have access to the full item data used to populate the row.
        // For now, we construct the new _3plDetails based on inputs.
        // This means any other fields in _3plDetails not touched by this form will be overwritten if we just set it.
        // A true partial update of JSONB requires fetching the existing JSONB value first.

        const rowData = {
            itemId: itemId, // This should be the actual primary key value for the row in 'inventory' table
            _3plDetailsUpdate: { // This will be merged with existing _3pl_details or form the new value
                palletType: palletTypeSelect ? palletTypeSelect.value : null,
                location: locationSelect ? locationSelect.value : null,
                lotNumber: lotNumberInput ? lotNumberInput.value.trim() : "",
                mixedPalletGroupId: mixedPalletGroupIdInput ? mixedPalletGroupIdInput.value.trim() : "",
                status: 'Complete' // Set status to Complete
            }
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
        submitStockInButton.textContent = 'Submitting...';
    }

    try {
        const updatePromises = itemsToUpdate.map(async (itemData) => {
            // Fetch the current _3pl_details for the item
            const { data: currentItem, error: fetchError } = await window.supabaseClient
                .from('inventory')
                .select('_3pl_details') // CORRECTED COLUMN NAME
                .eq('id', itemData.itemId)
                .single();

            if (fetchError) {
                console.error(`Error fetching item ${itemData.itemId} for update:`, fetchError);
                throw new Error(`Failed to fetch current details for item ID ${itemData.itemId}.`);
            }

            const existing3plDetails = currentItem._3pl_details || {}; // CORRECTED COLUMN NAME
            const new3plDetails = { ...existing3plDetails, ...itemData._3plDetailsUpdate };

            const { error } = await window.supabaseClient
                .from('inventory')
                .update({ _3pl_details: new3plDetails }) // CORRECTED COLUMN NAME
                .eq('id', itemData.itemId); // Ensure 'id' is the correct primary key column name

            if (error) {
                console.error(`Error updating item ${itemData.itemId} in Supabase:`, error);
                throw error; // This will be caught by the Promise.all catch block
            }
            return { itemId: itemData.itemId, success: true };
        });

        await Promise.all(updatePromises);

        alert('Stock In updated successfully via Supabase!');
        console.log('Stock In updated successfully for items:', itemsToUpdate.map(item => item.itemId));

        if (stockInTableBody) stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Update successful. Refreshing...</td></tr>';
        loadPendingJordonStock().then(displayPendingStockInTable).catch(err => console.error("Error refreshing stock-in table:", err));

        console.log("Attempting to refresh inventory summary data post-stock-in update.");
        loadInventorySummaryData().then(displayInventorySummary).catch(err => console.error("Error refreshing summary table post-stock-in:", err));

    } catch (error) {
        console.error('Error updating stock in via Supabase:', error.message);
        alert(`Error updating stock in: ${error.message}. Please try again.`);
    } finally {
        if (submitStockInButton) {
            submitStockInButton.disabled = false;
            submitStockInButton.textContent = 'Submit Stock In';
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
                <td>${escapeHtml(String(item.palletsToStockOut))}</td> <!-- Corrected: was item.palletId -->
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
        submitButton.textContent = 'Processing...';
    }

    try {
        if (jordonStockOutItems.length === 0) {
            alert("No items to stock out.");
            return;
        }

        const withdrawDateInput = document.getElementById('withdraw-date');
        const withdrawDate = withdrawDateInput ? withdrawDateInput.value : '';
        const hhInput = document.getElementById('collection-time-hh');
        const mmInput = document.getElementById('collection-time-mm');
        const ampmInput = document.getElementById('collection-time-ampm');
        const hh = hhInput ? hhInput.value : '';
        const mm = mmInput ? mmInput.value : '';
        const ampm = ampmInput ? ampmInput.value : '';

        if (!withdrawDate) {
            alert("Withdraw Date is required.");
            return;
        }
        if (!hh || !mm) {
            alert("Please select a valid Collection Time (HH:MM).");
            return;
        }
        const collectionTime = `${hh}:${mm} ${ampm}`;

        const serialNumber = await getNextSerialNumber();
        if (!serialNumber || serialNumber.startsWith('ERROR_SN_')) {
            alert("Could not generate serial number. Please try again. Error: " + serialNumber);
            return;
        }

        // This operatorId should ideally come from an authentication system
        const operatorId = firebase.auth().currentUser ? firebase.auth().currentUser.uid : "JORDON_WMS_USER_FALLBACK";


        const formDataForFirestore = {
            serialNumber: serialNumber,
            withdrawDate: withdrawDate,
            collectionTime: collectionTime,
            status: "Processing", // Initial status before inventory transactions
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
                quantityToStockOut: item.quantityToStockOut, // Cartons
                palletsToStockOut: item.palletsToStockOut,  // Pallets - new field
                // palletId: item.palletId || 'N/A', // This field is now effectively palletsToStockOut
                selectedDestinationWarehouseId: item.selectedDestinationWarehouseId,
                destinationWarehouseName: (mainWarehouses.find(wh => wh.id === item.selectedDestinationWarehouseId)?.name) || 'N/A',
                transferStatus: 'Pending' 
            })),
            operatorId: operatorId
        };

        const db = firebase.firestore();
        // Initial save of the form
        const formDocRef = await db.collection('jordonWithdrawForms').add(formDataForFirestore);
        console.log('Withdraw Form saved with ID: ' + formDocRef.id + '. Serial Number: ' + serialNumber + '. Now processing inventory transactions.');
        
        if (submitButton) {
            submitButton.textContent = 'Updating Inventory...';
        }

        let allTransactionsSuccessful = true;
        const transactionResults = [];
        // Keep a mutable copy of items to update statuses
        let processedItemsArray = JSON.parse(JSON.stringify(formDataForFirestore.items)); 

        for (let i = 0; i < processedItemsArray.length; i++) {
            const item = processedItemsArray[i]; 
            let outboundSuccess = false;
            let inboundSuccess = false; // Declare inboundSuccess here

            try {
                // 1. Outbound from Jordon
                const outboundData = {
                    inventoryId: item.inventoryId,
                    quantityToDecrement: item.quantityToStockOut, // Cartons
                    palletsToDecrement: item.palletsToStockOut,  // Pallets - new field to pass
                    productCode: item.productCode, 
                    productName: item.productName, 
                    productId: item.productId, 
                    operatorId: operatorId
                };
                // console.log(`Attempting outbound for item ${item.productCode}, invId: ${item.inventoryId}, qty: ${item.quantityToStockOut}, pallets: ${item.palletsToStockOut}, productId: ${item.productId}`);
                await window.transactionAPI.outboundStockByInventoryId(outboundData);
                outboundSuccess = true;
                // console.log(`Outbound success for ${item.productCode}`);

                // 2. Inbound to Destination Warehouse
                // Note: Inbound logic does not currently handle pallets explicitly for destination.
                // It creates/updates inventory based on carton quantity. If destination also tracks pallets,
                // inboundStock would need similar modification or the destination warehouse has its own pallet logic.
                // For now, only Jordon outbound is explicitly handling pallet quantity deduction from _3plDetails.pallet.
                const inboundData = {
                    productId: item.productId,
                    productCode: item.productCode,
                    productName: item.productName,
                    warehouseId: item.selectedDestinationWarehouseId, // Destination
                    batchNo: item.batchNumber, // Assuming batch number carries over
                    quantity: item.quantityToStockOut,
                    operatorId: operatorId,
                    // Potentially add other details like original lot number, palletId if needed for destination's records
                };
                // console.log(`Attempting inbound for item ${item.productCode} to warehouse ${item.selectedDestinationWarehouseId}, qty: ${item.quantityToStockOut}`);
                await window.transactionAPI.inboundStock(inboundData);
                inboundSuccess = true;
                // console.log(`Inbound success for ${item.productCode} to ${item.selectedDestinationWarehouseId}`);
                
                processedItemsArray[i].transferStatus = 'Completed';
                delete processedItemsArray[i].errorMessage; // Remove error message if successful
                transactionResults.push({ item: item.productCode, status: 'Transferred Successfully' });

            } catch (error) {
                allTransactionsSuccessful = false;
                const currentItemError = error.message || "Unknown error during inventory transaction.";
                console.error(`Error processing item ${item.productCode} (Inv ID: ${item.inventoryId}):`, currentItemError, error);
                
                transactionResults.push({ item: item.productCode, status: `Failed: ${currentItemError}` });

                let failureStage = 'Unknown';
                if (outboundSuccess) failureStage = 'Inbound Failed after Outbound Succeeded';
                else failureStage = 'Outbound Failed';
                
                processedItemsArray[i].transferStatus = `Failed - ${failureStage}`;
                processedItemsArray[i].errorMessage = currentItemError;
            }
        }

        // Update overall form status and the entire items array in one go
        await formDocRef.update({
            status: allTransactionsSuccessful ? "Completed" : "Partially Completed / Failed",
            items: processedItemsArray // Save the full items array with updated statuses
        });

        let finalMessage = `Withdraw Form ${serialNumber} processed.\n`;
        transactionResults.forEach(res => {
            finalMessage += `\n- ${res.item}: ${res.status}`;
        });
        
        if (!allTransactionsSuccessful) {
            finalMessage += "\n\nSome inventory transactions failed. Please check the form details and system logs.";
        }
        alert(finalMessage);

        // Generate and show print version
        const printableHTML = generatePrintableStockOutHTML(formDataForFirestore); // Use formDataForFirestore as it has all details
        const printWindow = window.open('', '_blank', 'height=600,width=800');
        if (printWindow) {
            printWindow.document.write(printableHTML);
            printWindow.document.close();
            printWindow.focus();
            // printWindow.print(); // Comment out for now to avoid immediate print during dev
        } else {
            alert('Could not open print window. Please check your browser pop-up blocker settings.');
        }

        // Clear UI and refresh data
        jordonStockOutItems = [];
        renderStockOutPreview();
        if (hhInput) hhInput.value = '';
        if (mmInput) mmInput.value = '';
        if (ampmInput) ampmInput.value = 'AM';
        setDefaultWithdrawDate();
        
        // Refresh inventory summary view as stock levels have changed
        console.log("Refreshing inventory summary data after stock out processing.");
        loadInventorySummaryData().then(displayInventorySummary).catch(err => {
            console.error("Error refreshing Jordon inventory summary post stock-out:", err);
            // Potentially alert user that summary might be stale
        });


    } catch (error) {
        console.error("Error in handleSubmitAllStockOut:", error);
        alert("An unexpected error occurred: " + error.message);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit All Stock Out';
        }
    }
}
