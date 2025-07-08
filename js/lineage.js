// Lineage specific JavaScript

// --- Lineage Inline Editing State ---
let currentlyEditingRowId = null; // Stores the ID of the inventory item whose row is being edited

// Combined click handler for inventory rows (single click for popup, Ctrl+click for edit)
// This function is already being assigned as the 'click' event listener in displayInventorySummary
// We will modify its content further down.
// For now, we just need to ensure makeRowEditable and other helpers are defined before they might be called.

function makeRowEditable(row) {
    const item = currentLineageInventorySummaryItems.find(i => i.id === row.dataset.itemId); // Changed variable name
    if (!item) return;

    // Define cell indices based on the established mapping for Lineage (LLM Item Code is new at index 2)
    // ProductCode (0), ProdDesc (1), LLMItemCode (2), PackingSize (3), PalletType (4), Location (5), LotNum (6), BatchNo (7), DateStored (8), Container (9), Qty (10), Pallets (11)
    const cellsToEdit = [
        { index: 0, property: 'productCode', originalValueKey: 'originalProductCode', type: 'text', style: "width: 100px;" },
        // Skipping Product Description (index 1)
        // LLM Item Code (index 2) - Assuming not directly editable for now, like Product Description. If editable, add config here.
        // Skipping Packing Size (index 3)
        { index: 4, property: '_3plDetails.palletType', originalValueKey: 'originalPalletType', type: 'text', style: "width: 80px;" },
        { index: 5, property: '_3plDetails.location', originalValueKey: 'originalLocation', type: 'text', style: "width: 100px;" },
        { index: 6, property: '_3plDetails.lotNumber', originalValueKey: 'originalLotNumber', type: 'text', style: "width: 100px;" },
        { index: 7, property: 'batchNo', originalValueKey: 'originalBatchNo', type: 'text', style: "width: 100px;" },
        { index: 8, property: '_3plDetails.dateStored', originalValueKey: 'originalDateStored', type: 'text', style: "width: 100px;", placeholder: "DD/MM/YYYY" },
        { index: 9, property: 'container', originalValueKey: 'originalContainer', type: 'text', style: "width: 100px;" },
        { index: 10, property: 'quantity', originalValueKey: 'originalQuantity', type: 'number', style: "width: 80px; padding: 2px;", extraAttrs: `min="0"` },
        { index: 11, property: '_3plDetails.pallet', originalValueKey: 'originalPallets', type: 'number', style: "width: 80px; padding: 2px;", extraAttrs: `min="0"` }
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

function revertRowToStatic(row, fromCancel = true) { // Lineage: Added LLM Item Code at index 2, adjust subsequent indices
    if (!row) return;
    const itemId = row.dataset.itemId;
    const item = currentLineageInventorySummaryItems.find(i => i.id === itemId); // Changed variable name
    
    // Define cell configurations similar to makeRowEditable for consistent access
    // ProductCode (0), ProdDesc (1), LLMItemCode (2), PackingSize (3), PalletType (4), Location (5), LotNum (6), BatchNo (7), DateStored (8), Container (9), Qty (10), Pallets (11)
    const cellsToRevert = [
        { index: 0, property: 'productCode', originalValueKey: 'originalProductCode' },
        // Indices 1 (ProdDesc), 2 (LLMItemCode), 3 (PackingSize) are not edited directly in this version
        { index: 4, property: '_3plDetails.palletType', originalValueKey: 'originalPalletType' },
        { index: 5, property: '_3plDetails.location', originalValueKey: 'originalLocation' },
        { index: 6, property: '_3plDetails.lotNumber', originalValueKey: 'originalLotNumber' },
        { index: 7, property: 'batchNo', originalValueKey: 'originalBatchNo' },
        { index: 8, property: '_3plDetails.dateStored', originalValueKey: 'originalDateStored' },
        { index: 9, property: 'container', originalValueKey: 'originalContainer' },
        { index: 10, property: 'quantity', originalValueKey: 'originalQuantity' },
        { index: 11, property: '_3plDetails.pallet', originalValueKey: 'originalPallets' }
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

async function saveRowChanges(row) { // Lineage: Adjust indices for LLM Item Code
    const itemId = row.dataset.itemId;
    const itemIndex = currentLineageInventorySummaryItems.findIndex(i => i.id === itemId); // Changed variable name
    if (itemIndex === -1) {
        alert("Error: Could not find item to save.");
        revertRowToStatic(row); // Revert UI
        return;
    }

    // Configuration for fields to save, matching makeRowEditable and Firestore structure
    // ProductCode (0), ProdDesc (1), LLMItemCode (2), PackingSize (3), PalletType (4), Location (5), LotNum (6), BatchNo (7), DateStored (8), Container (9), Qty (10), Pallets (11)
    const fieldsToSave = [
        { index: 0, property: 'productCode', type: 'text' },
        // LLM Item Code (index 2) is not saved via inline edit in this version. If it needs to be, add config here.
        { index: 4, property: '_3plDetails.palletType', type: 'text' },
        { index: 5, property: '_3plDetails.location', type: 'text' },
        { index: 6, property: '_3plDetails.lotNumber', type: 'text' },
        { index: 7, property: 'batchNo', type: 'text' },
        { index: 8, property: '_3plDetails.dateStored', type: 'text' }, 
        { index: 9, property: 'container', type: 'text' },
        { index: 10, property: 'quantity', type: 'number' },
        { index: 11, property: '_3plDetails.pallet', type: 'number' }
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
    updateDataFirestore['lastModifiedAt'] = firebase.firestore.FieldValue.serverTimestamp(); // Assuming Firebase is still used here

    // Get a deep copy of the original item for potential revert on error
    const originalItemData = JSON.parse(JSON.stringify(currentLineageInventorySummaryItems[itemIndex])); // Changed variable name

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
        await itemRef.update(updateDataFirestore); // Assuming Firebase is still used here

        // Update local cache after successful Firestore update
        // Merge updateDataLocal into currentLineageInventorySummaryItems[itemIndex]
        const itemToUpdate = currentLineageInventorySummaryItems[itemIndex]; // Changed variable name
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
        updateLineageSummaryTotals(); // Changed function call
    } catch (error) {
        console.error("Error updating item in Firestore:", error); // Assuming Firebase
        alert("Error updating item: " + error.message + ". Reverting changes in UI.");
        // No need to revert currentLineageInventorySummaryItems as we haven't modified it directly yet with new values
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
 * Fetches stock out forms from the 'lineageWithdrawForms' collection in Firestore.
 * Orders them by creation date in descending order.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of form objects, each with an 'id' property.
 */
async function loadLineageStockOutFormsReport() { // Renamed function
    console.log("loadLineageStockOutFormsReport() called"); // Changed log
    const reportContentContainer = document.getElementById('lineage-report-content-container'); // Changed ID
    if (reportContentContainer) {
        reportContentContainer.innerHTML = '<p>Loading reports...</p>';
    }

    const db = firebase.firestore(); // Assuming Firebase
    const forms = [];
    try {
        const formsQuery = db.collection('lineageWithdrawForms') // Changed collection name
            .orderBy('createdAt', 'desc'); 
        const snapshot = await formsQuery.get();

        if (snapshot.empty) {
            console.log("No Lineage stock out forms found."); // Changed log
            if (reportContentContainer) {
                reportContentContainer.innerHTML = '<p>No stock out forms found.</p>';
            }
            return forms; 
        }

        snapshot.forEach(doc => {
            forms.push({ id: doc.id, ...doc.data() });
        });

        console.log('Loaded Lineage stock out forms:', forms); // Changed log
        return forms;

    } catch (error) {
        console.error("Error loading Lineage stock out forms:", error); // Changed log
        if (reportContentContainer) {
            reportContentContainer.innerHTML = '<p style="color: red;">Error loading stock out forms. Please try again.</p>';
        }
        throw error; 
    }
}

/**
 * Displays the fetched stock out forms in a table within the "Report" tab.
 * @param {Array<Object>} forms - An array of form objects.
 */
function displayLineageStockOutFormsReport(forms) { // Renamed function
    const reportContentContainer = document.getElementById('lineage-report-content-container'); // Changed ID
    if (!reportContentContainer) {
        console.error('Report content container (#lineage-report-content-container) not found.'); // Changed ID
        return;
    }

    if (!forms || forms.length === 0) {
        reportContentContainer.innerHTML = '<p>No stock out forms available to display.</p>';
        return;
    }

    let tableHtml = `
        <h2>Lineage Stock Out Forms</h2> // Changed Title
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
 * `generateLineagePrintableStockOutHTML` to display it in a new window.
 * @param {string} formId - The ID of the Lineage Withdraw Form document in Firestore.
 */
async function handleViewLineageStockOutForm(formId) { // Renamed function
    console.log("handleViewLineageStockOutForm called for form ID:", formId); // Changed log
    if (!formId) {
        alert("Error: Form ID is missing. Cannot display form.");
        return;
    }

    try {
        const db = firebase.firestore(); // Assuming Firebase
        const formRef = db.collection('lineageWithdrawForms').doc(formId); // Changed collection
        const doc = await formRef.get();

        if (!doc.exists) {
            console.error("No such document with ID:", formId);
            alert("Error: Could not find the specified stock out form. It may have been deleted.");
            return;
        }

        const formData = { id: doc.id, ...doc.data() };

        let itemsArray = formData.items;
        if (formData.items && typeof formData.items === 'object' && !Array.isArray(formData.items)) {
            itemsArray = Object.keys(formData.items)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map(key => formData.items[key]);
        }

        if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
            console.error("Form data 'items' is not a valid array or is empty for Lineage form:", itemsArray, "Original:", formData.items); // Changed log
            alert("Error: The form data (items) is incomplete, corrupted, or empty. Cannot display items.");
            return;
        }
        
        const formDataForPrint = { ...formData, items: itemsArray };

        // LLM Item Code specific logic: Ensure it's available in items if needed by generateLineagePrintableStockOutHTML
        // formDataForPrint.items.forEach(item => {
        //   if (item.llmItemCode === undefined && item._3plDetails && item._3plDetails.llm_item_code) {
        //     item.llmItemCode = item._3plDetails.llm_item_code; // Or however it's stored if fetched differently
        //   }
        // });

        const printableHTML = generateLineagePrintableStockOutHTML(formDataForPrint); // Changed function call
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

function updateLineageSummaryTotals() { // Renamed function
    const summaryTotalCartonsEl = document.getElementById('lineage-summary-total-cartons'); // Changed ID
    const summaryTotalPalletsEl = document.getElementById('lineage-summary-total-pallets'); // Changed ID
    if (!summaryTotalCartonsEl || !summaryTotalPalletsEl) return;

    let totalCartons = 0;
    let totalPallets = 0;
    currentLineageInventorySummaryItems.forEach(item => { // Changed variable name
        totalCartons += Number(item.quantity) || 0;
        totalPallets += (item._3plDetails && item._3plDetails.pallet !== undefined ? Number(item._3plDetails.pallet) : 0);
    });
    summaryTotalCartonsEl.textContent = totalCartons;
    summaryTotalPalletsEl.textContent = totalPallets;
}
// End of Inline Editing Functions

let currentLineageInventorySummaryItems = []; // Changed variable name
let lineageStockOutItems = []; // Changed variable name
let mainWarehouses = []; // This can remain generic if it's truly shared data

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

function setDefaultLineageWithdrawDate() { // Renamed function
  const withdrawDateInput = document.getElementById('lineage-withdraw-date'); // Changed ID
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
    console.warn('#lineage-withdraw-date input not found when trying to set default date.'); // Changed ID
  }
}

function generateLineagePrintableStockOutHTML(formData) { // Renamed function
    const { serialNumber, withdrawDate, collectionTime, items } = formData;

    const wdParts = withdrawDate && typeof withdrawDate === 'string' ? withdrawDate.split('-') : [];
    const formattedWithdrawDate = wdParts.length === 3 ? `${wdParts[2]}/${wdParts[1]}/${wdParts[0]}` : escapeHtml(withdrawDate || '');

    let tableRowsHtml = '';
    items.forEach((item, index) => {
        // Lineage specific: Add LLM Item Code to the printed form
        const llmItemCodeDisplay = item.llmItemCode || (item._3plDetails && item._3plDetails.llm_item_code) || ''; // Fallback if needed
        tableRowsHtml += `
            <tr>
                <td>${escapeHtml(index + 1)}</td>
                <td>${escapeHtml(item.productName)}</td>
                <td>${escapeHtml(llmItemCodeDisplay)}</td> <!-- LLM Item Code Added -->
                <td style="font-size: 9pt;">${escapeHtml(item.productPackaging)}</td> 
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.lotNumber)}</td>
                <td>${escapeHtml(item.palletsToStockOut)}</td> 
                <td>${escapeHtml(item.quantityToStockOut)}</td>
                <td>${escapeHtml(item.batchNumber)}</td>
            </tr>
        `;
    });

    // Note: Adjust column headers in the HTML below for the new LLM Item Code column
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lineage Withdraw Form - ${escapeHtml(serialNumber)}</title> <!-- Changed Title -->
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
                    <p>Tel 65 6755 7688 Fax 65 6755 6698</p> <!-- Keep Li Chuan as issuer -->
                            </div>
                        </div>
                        <div class="header-right">
                            <p class="bold">S/N: ${escapeHtml(serialNumber)}</p>
                        </div>
                    </div>
                    <div class="date-container">
                        <p class="date">Withdraw Date: ${formattedWithdrawDate}</p>
                    </div>
                    <p class="attn">Attn: Lineage Public Warehouse</p> <!-- Changed Attn -->
                    <p>Lineage Address Line 1, Singapore XXXXXX</p> <!-- Placeholder Address -->
                    <p>Tel: +65 XXXX XXXX Fax: +65 YYYY YYYY</p> <!-- Placeholder Tel/Fax -->
                    <p class="right-align"><span class="bold">Collection Time: ${escapeHtml(collectionTime)}</span></p>
                </div>
                <h2>Lineage Withdraw Form</h2> <!-- Changed Title -->
                <table>
                    <thead>
                        <tr>
                            <th>No.</th>
                            <th>Product Name</th>
                            <th>LLM Code</th> <!-- Added LLM Code Header -->
                            <th>Packing Size</th>
                            <th>Loc</th> 
                            <th>Lot No</th>
                            <th>Plts</th>
                            <th>Qty</th> 
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
        const prefix = `LCLG${yearYY}-`; // Changed prefix for Lineage (LiChuan LineaGe)

        const db = firebase.firestore(); // Assuming Firebase
        const formsRef = db.collection('lineageWithdrawForms'); // Changed collection name

        // Query for serial numbers starting with the current year's prefix,
        // order by serialNumber descending, and get only the top one.
        const q = formsRef
            .where('serialNumber', '>=', prefix + '0000')
            .where('serialNumber', '<=', prefix + '9999') 
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
                    console.warn(`Could not parse sequence from lastSerialNumber for Lineage: ${lastSerialNumber}`); // Changed log
                }
            } else {
                 console.warn(`Last Lineage serial number ${lastSerialNumber} does not match current prefix ${prefix}`); // Changed log
            }
        }

        const sequenceNNNN = String(nextSequence).padStart(4, '0');
        const newSerialNumber = prefix + sequenceNNNN;

        console.log(`Generated Lineage Serial Number: ${newSerialNumber}`); // Changed log
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
        console.error("Lineage: window.productAPI.getProductByCode is not available. Cannot fetch product details."); // Changed log
        return productDetailsMap;
    }

    const uniqueProductCodes = [...new Set(productCodes)]; 

    for (const code of uniqueProductCodes) {
        try {
            const product = await window.productAPI.getProductByCode(code);
            if (product) {
                productDetailsMap.set(code, {
                    name: product.name || 'N/A',
                    packaging: product.packaging || 'N/A',
                    productId: product.id 
                });
            }
        } catch (error) {
            console.error(`Lineage: Error fetching product details for code ${code} via productAPI:`, error); // Changed log
        }
    }
    return productDetailsMap;
}

async function loadPendingLineageStock() { // Renamed function
    const stockInTableBody = document.getElementById('lineage-stock-in-table-body'); // Changed ID
    try {
        const db = firebase.firestore(); // Assuming Firebase
        const inventoryRef = db.collection('inventory');
        const q = inventoryRef
            .where('warehouseId', '==', 'lineage') // Changed warehouseId
            .where('_3plDetails.status', '==', 'pending');
        const pendingInventorySnapshot = await q.get();

        if (pendingInventorySnapshot.empty) {
            console.log("No pending Lineage stock found."); // Changed log
            return [];
        }

        const inventoryItems = pendingInventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const originalLineageCodes = inventoryItems // Renamed variable
            .map(item => item.productCode)
            .filter(code => code); 

        const codesToActuallyFetch = new Set();
        originalLineageCodes.forEach(code => { // Changed variable name
            codesToActuallyFetch.add(code); // Add original code
            if (code.endsWith('.1')) {
                codesToActuallyFetch.add(code.slice(0, -2)); // Add trimmed version if original ends with .1
            } else {
                codesToActuallyFetch.add(code + '.1'); // Add suffixed version if original does not end with .1
            }
        });
        const productCodesForDbQuery = Array.from(codesToActuallyFetch);

        // Fetch product details for all potential variations
        const productDetailsMap = await fetchProductDetailsByCodes(productCodesForDbQuery);

        const pendingItemsWithProducts = inventoryItems.map(inventoryItem => {
            let productName = 'N/A';
            let productPackaging = 'N/A';

            let details;
            if (inventoryItem.productCode) {
                details = productDetailsMap.get(inventoryItem.productCode); // Primary lookup
                if (!details) {
                    // Symmetrical Fallback logic
                    if (inventoryItem.productCode.endsWith('.1')) {
                        const trimmedCode = inventoryItem.productCode.slice(0, -2);
                        details = productDetailsMap.get(trimmedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${trimmedCode} in Lineage pending stock`); // Changed log
                    } else {
                        const suffixedCode = inventoryItem.productCode + '.1';
                        details = productDetailsMap.get(suffixedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${suffixedCode} in Lineage pending stock`); // Changed log
                    }
                }
            }

            if (details) {
                productName = details.name;
                productPackaging = details.packaging;
            } else if (inventoryItem.productCode) {
                console.warn(`Product details not found for ${inventoryItem.productCode} (after all fallbacks) in Lineage pending stock.`); // Changed log
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode for Lineage pending stock.`); // Changed log
            }
            // Add llm_item_code to the object if it exists in _3plDetails
            const llmItemCode = inventoryItem._3plDetails && inventoryItem._3plDetails.llm_item_code 
                ? inventoryItem._3plDetails.llm_item_code 
                : '';
            return { ...inventoryItem, productName, productPackaging, llmItemCode };
        });

        pendingItemsWithProducts.sort((a, b) => {
            const rowNumA = a.excelRowNumber;
            const rowNumB = b.excelRowNumber;
            if (rowNumA == null || typeof rowNumA !== 'number') return 1;
            if (rowNumB == null || typeof rowNumB !== 'number') return -1;
            return rowNumA - rowNumB;
        });

        console.log('Loaded and sorted pending Lineage stock with product details:', pendingItemsWithProducts); // Changed log
        return pendingItemsWithProducts;
    } catch (error) {
        console.error("Error loading pending Lineage stock:", error); // Changed log
        if (stockInTableBody) { 
            stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Error loading pending stock. Please try again.</td></tr>';
        }
        return []; 
    }
}

function displayPendingLineageStockInTable(items) { // Renamed function
    const stockInTableBody = document.getElementById('lineage-stock-in-table-body'); // Changed ID
    if (!stockInTableBody) {
        console.error('Stock In table body (#lineage-stock-in-table-body) not found.'); // Changed ID
        return;
    }
    stockInTableBody.innerHTML = ''; 

    if (items.length === 0) {
        // Consider if colspan needs adjustment if LLM Item Code is added to Stock In table
        stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No pending items found.</td></tr>';
        return;
    }

    items.forEach(item => {
        const newRow = stockInTableBody.insertRow();
        newRow.dataset.itemId = item.id; 

        newRow.insertCell().textContent = item.productName || 'N/A';
        newRow.insertCell().textContent = item.productCode || 'N/A';
        // LLM Item Code is not currently in the Stock In table HTML structure for Jordon,
        // so not adding it for Lineage here unless HTML is also changed.
        // If lineage.html's stock-in table gets an LLM Item Code column, add:
        // newRow.insertCell().textContent = item.llmItemCode || ''; 
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
    console.log("loadLineageInventorySummaryData() called"); // Renamed log
    const summaryTableBody = document.getElementById('lineage-inventory-summary-tbody'); // Changed ID
    if (summaryTableBody) {
        // Adjusted colspan for the new LLM Item Code column (11 original + 1 = 12)
        summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Loading Lineage inventory summary...</td></tr>'; // Changed log & colspan
    }

    const db = firebase.firestore(); // Assuming Firebase
    try {
        const inventoryQuery = db.collection('inventory')
            .where('warehouseId', '==', 'lineage') // Changed warehouseId
            .orderBy('_3plDetails.dateStored')
            .orderBy('_3plDetails.lotNumber');
        const snapshot = await inventoryQuery.get();

        if (snapshot.empty) {
            console.log("No Lineage inventory items found."); // Changed log
            if (summaryTableBody) summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No inventory items found for Lineage.</td></tr>'; // Changed log & colspan
            currentLineageInventorySummaryItems = []; // Changed variable
            return [];
        }

        const inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const originalLineageCodes = inventoryItems // Renamed variable
            .map(item => item.productCode)
            .filter(code => code); 
        
        const codesToActuallyFetch = new Set();
        originalLineageCodes.forEach(code => { // Changed variable
            codesToActuallyFetch.add(code); // Add original code
            if (code.endsWith('.1')) {
                codesToActuallyFetch.add(code.slice(0, -2)); // Add trimmed version if original ends with .1
            } else {
                codesToActuallyFetch.add(code + '.1'); // Add suffixed version if original does not end with .1
            }
        });
        const productCodesForDbQuery = Array.from(codesToActuallyFetch);

        // Fetch product details for all potential variations
        const productDetailsMap = await fetchProductDetailsByCodes(productCodesForDbQuery);

        const summaryItems = inventoryItems.map(inventoryItem => {
            let productName = 'N/A';
            let productPackaging = 'N/A';
            let productId = null; 
            let details;

            if (inventoryItem.productCode) {
                details = productDetailsMap.get(inventoryItem.productCode); // Primary lookup
                if (!details) {
                    // Symmetrical Fallback logic
                    if (inventoryItem.productCode.endsWith('.1')) {
                        const trimmedCode = inventoryItem.productCode.slice(0, -2);
                        details = productDetailsMap.get(trimmedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${trimmedCode} in Lineage summary`); // Changed log
                    } else {
                        const suffixedCode = inventoryItem.productCode + '.1';
                        details = productDetailsMap.get(suffixedCode);
                        if (details) console.log(`Fallback success for ${inventoryItem.productCode} as ${suffixedCode} in Lineage summary`); // Changed log
                    }
                }
            }

            if (details) {
                productName = details.name;
                productPackaging = details.packaging;
                productId = details.productId; 
            } else if (inventoryItem.productCode) {
                console.warn(`Product details not found for ${inventoryItem.productCode} (after all fallbacks) in Lineage summary`); // Changed log
            } else {
                console.warn(`Inventory item ${inventoryItem.id} missing productCode during Lineage summary load.`); // Changed log
            }
             // Add llm_item_code to the object if it exists in _3plDetails
            const llmItemCode = inventoryItem._3plDetails && inventoryItem._3plDetails.llm_item_code 
                ? inventoryItem._3plDetails.llm_item_code 
                : '';
            return { ...inventoryItem, productName, productPackaging, productId, llmItemCode }; // Added llmItemCode
        });
        
        console.log('Loaded Lineage inventory summary data:', summaryItems); // Changed log
        currentLineageInventorySummaryItems = summaryItems; // Changed variable
        return summaryItems;

    } catch (error) {
        console.error("Error loading Lineage inventory summary data:", error); // Changed log
        if (summaryTableBody) {
            summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:red;">Error loading inventory summary. Please check connection or try again later.</td></tr>'; // Changed colspan
        }
        currentLineageInventorySummaryItems = []; // Changed variable
        return [];
    }
}

function displayLineageInventorySummary(summaryItems) { // Renamed function
    const summaryTableBody = document.getElementById('lineage-inventory-summary-tbody'); // Changed ID
    const summaryTotalCartonsEl = document.getElementById('lineage-summary-total-cartons'); // Changed ID
    const summaryTotalPalletsEl = document.getElementById('lineage-summary-total-pallets'); // Changed ID

    if (!summaryTableBody || !summaryTotalCartonsEl || !summaryTotalPalletsEl) {
        console.error('Lineage inventory summary table elements (tbody or totals) not found.'); // Changed log
        if (summaryTableBody) summaryTableBody.innerHTML = '<tr><td colspan="12" style="color:red; text-align:center;">Error: Table elements missing.</td></tr>'; // Changed colspan
        return;
    }

    summaryTableBody.innerHTML = ''; 
    let totalCartons = 0;
    let totalPallets = 0;

    const stockOutPopup = document.getElementById('lineage-stock-out-popup'); // Changed ID
    if (!stockOutPopup) {
        console.error("Stock out popup element not found. Row click functionality cannot be fully initialized.");
    }

    const highlightColors = ['#FFFFE0', '#ADD8E6', '#90EE90', '#FFB6C1', '#FAFAD2', '#E0FFFF'];
    const groupIdToColorMap = new Map();
    let colorIndex = 0;

    if (!summaryItems || summaryItems.length === 0) {
        summaryTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No inventory summary data available.</td></tr>'; // Changed colspan
        summaryTotalCartonsEl.textContent = '0';
        summaryTotalPalletsEl.textContent = '0';
        return;
    }

    const uniqueGroupIds = new Set(
        summaryItems
            .map(item => item._3plDetails?.mixedPalletGroupId) // This remains the same, group ID logic is generic
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
        // Lineage specific: Add llmItemCode to dataset
        row.dataset.llmItemCode = item.llmItemCode || (item._3plDetails && item._3plDetails.llm_item_code) || '';
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
        row.dataset.pallets = Number(threePlDetails.pallet) || 0; // Storing pallet count directly

        row.insertCell().textContent = item.productCode || '';
        row.insertCell().textContent = item.productName || 'N/A';
        // Lineage specific: Insert cell for LLM Item Code
        row.insertCell().textContent = row.dataset.llmItemCode; // Use value from dataset
        row.insertCell().textContent = item.productPackaging || 'N/A';
        row.insertCell().textContent = threePlDetails.palletType || '';
        row.insertCell().textContent = threePlDetails.location || '';
        row.insertCell().textContent = threePlDetails.lotNumber || '';
        row.insertCell().textContent = item.batchNo || '';
        row.insertCell().textContent = threePlDetails.dateStored || '';
        row.insertCell().textContent = item.container || '';
        
        const itemQuantity = Number(item.quantity) || 0;
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
             row.addEventListener('click', handleLineageInventoryRowClick); // Changed handler name
        }
    });

    summaryTotalCartonsEl.textContent = totalCartons;
    summaryTotalPalletsEl.textContent = totalPallets;
}

function activateLineageTab(tabElement) { // Renamed function
    const tabContainer = document.querySelector('.lineage-page-container .tabs-container'); // Changed selector
    if (!tabContainer) {
        console.error("Lineage tab container not found during activateLineageTab."); // Changed log
        return null;
    }
    const tabItems = tabContainer.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.lineage-page-container .tab-content'); // Changed selector

    tabItems.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    if (tabElement) {
        tabElement.classList.add('active');
        const targetContentId = tabElement.dataset.tab + '-content'; // This part is generic
        const targetContent = document.getElementById('lineage-' + targetContentId); // Prepend lineage- to find correct ID
        if (targetContent) {
            targetContent.classList.add('active');
            return targetContentId; // Return the base name for logic
        } else {
            console.error(`Content panel with ID lineage-${targetContentId} not found for tab:`, tabElement); // Changed log
            return null;
        }
    } else {
        console.error("activateLineageTab called with null tabElement."); // Changed log
        return null;
    }
}

export async function initLineageTabs(containerElement) { // Renamed function and export
    await loadWarehouseData(); 
    console.log("Initializing Lineage tabs and stock-in functionality."); // Changed log

    setDefaultLineageWithdrawDate(); // Changed function call

    const tabContainer = containerElement.querySelector('.lineage-page-container .tabs-container'); // Changed selector
    if (!tabContainer) {
        console.error("Lineage tab container not found within the provided containerElement."); // Changed log
        return;
    }
    const tabItems = tabContainer.querySelectorAll('.tab-item');

    function handleStockInTabActivation() {
        console.log('Lineage Stock In tab is active, calling loadPendingLineageStock().'); // Changed log
        const stockInTableBody = document.getElementById('lineage-stock-in-table-body'); // Changed ID
        if (stockInTableBody) { 
            stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Loading pending items...</td></tr>';
        }
        loadPendingLineageStock() // Changed function call
            .then(items => {
                displayPendingLineageStockInTable(items); // Changed function call
            })
            .catch(error => { 
                console.error('Further error details from Lineage handleStockInTabActivation:', error); // Changed log
            });
    }

    function handleReportTabActivation() {
        console.log('Lineage Report tab is active, calling loadLineageStockOutFormsReport().'); // Changed log
        const reportContentContainer = document.getElementById('lineage-report-content-container'); // Changed ID
        if (reportContentContainer) {
            reportContentContainer.innerHTML = '<p>Loading reports...</p>'; 
        }
        loadLineageStockOutFormsReport() // Changed function call
            .then(forms => {
                displayLineageStockOutFormsReport(forms); // Changed function call
            })
            .catch(error => {
                console.error('Error loading or displaying Lineage stock out forms report:', error); // Changed log
                if (reportContentContainer) {
                    reportContentContainer.innerHTML = '<p style="color: red;">Failed to load reports. Please try again.</p>';
                }
            });
    }
    
    // const summaryTableBody = document.getElementById('lineage-inventory-summary-tbody'); // Not directly used here, but for context

    tabItems.forEach(tab => {
        tab.addEventListener('click', function() {
            const activeTabBaseName = activateLineageTab(this);  // Changed function call
            if (activeTabBaseName === 'stock-in-content') { // Compare with returned base name
                handleStockInTabActivation();
            } else if (activeTabBaseName === 'inventory-summary-content') {
                console.log('Lineage Inventory Summary tab selected, calling loadInventorySummaryData().'); // Changed log
                loadInventorySummaryData() // This name is generic now, should be loadLineageInventorySummaryData
                    .then(displayLineageInventorySummary) // Changed function call
                    .catch(error => console.error('Error details from Lineage inventory summary tab click:', error)); // Changed log
            } else if (activeTabBaseName === 'report-content') {
                handleReportTabActivation();
            }
        });
    });

    const initiallyActiveTab = tabContainer.querySelector('.tab-item.active');
    if (initiallyActiveTab) {
        const activeTabBaseName = activateLineageTab(initiallyActiveTab); // Changed function call
        if (activeTabBaseName) { 
            if (activeTabBaseName === 'stock-in-content') {
                handleStockInTabActivation();
            } else if (activeTabBaseName === 'inventory-summary-content') {
                loadInventorySummaryData().then(displayLineageInventorySummary).catch(console.error); // loadLineage... and displayLineage...
            } else if (activeTabBaseName === 'report-content') {
                handleReportTabActivation();
            }
        }
    } else if (tabItems.length > 0) { 
        const firstTabBaseName = activateLineageTab(tabItems[0]); // Changed function call
        if (firstTabBaseName) {
            if (firstTabBaseName === 'stock-in-content') {
                handleStockInTabActivation();
            } else if (firstTabBaseName === 'inventory-summary-content') {
                loadInventorySummaryData().then(displayLineageInventorySummary).catch(console.error); // loadLineage... and displayLineage...
            } else if (firstTabBaseName === 'report-content') {
                handleReportTabActivation();
            }
        }
    }

    const submitStockInButton = document.getElementById('lineage-submit-stock-in-btn'); // Changed ID
    if (submitStockInButton) {
        submitStockInButton.addEventListener('click', handleLineageSubmitStockIn); // Changed handler name
    } else {
        console.warn('Submit Stock In button (#lineage-submit-stock-in-btn) not found.'); // Changed log
    }
    
    setupLineageStockOutPopupClose(); // Changed function name

    const addToListBtn = document.getElementById('lineage-add-to-stock-out-list-btn'); // Changed ID
    if (addToListBtn) {
        addToListBtn.addEventListener('click', handleLineageAddToStockOutList); // Changed handler name
    } else {
        console.warn('Add to Stock Out List button (#lineage-add-to-stock-out-list-btn) not found.'); // Changed log
    }

    const stockOutContentDiv = document.getElementById('lineage-stock-out-content'); // Changed ID
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
    renderLineageStockOutPreview(); // Changed function call

    // Event listener for report content section
    const reportContentDiv = document.getElementById('lineage-report-content'); // Changed ID
    if (reportContentDiv) {
        reportContentDiv.addEventListener('click', function(event) {
            if (event.target.classList.contains('view-stock-out-form-btn')) { // Class name can be generic
                const formId = event.target.dataset.formId;
                if (formId) {
                    handleViewLineageStockOutForm(formId); // Changed handler
                } else {
                    console.warn('View button clicked but form ID was missing for Lineage.'); // Changed log
                    alert('Could not retrieve form details: ID missing.');
                }
            }
        });
    } else {
        console.warn('#lineage-report-content div not found for event delegation.'); // Changed log
    }

    const stockOutListContainer = document.getElementById('lineage-stock-out-list-container'); // Changed ID
    if (stockOutListContainer) {
      stockOutListContainer.addEventListener('change', function(event) {
        if (event.target && event.target.classList.contains('warehouse-select')) {
          const newWarehouseId = event.target.value;
          const inventoryId = event.target.dataset.itemInventoryId; 

          if (!inventoryId) {
              console.warn('Lineage Warehouse select change event: itemInventoryId not found on element:', event.target); // Changed log
              return;
          }

          const itemToUpdate = lineageStockOutItems.find(stockItem => stockItem.inventoryId === inventoryId); // Changed variable
          if (itemToUpdate) {
            itemToUpdate.selectedDestinationWarehouseId = newWarehouseId;
            console.log(`Lineage Item ${inventoryId} warehouse changed to: ${newWarehouseId}. Current item state:`, itemToUpdate); // Changed log
            console.log('Current lineageStockOutItems:', lineageStockOutItems); // Changed log
          } else {
            console.warn(`Could not find item with inventoryId ${inventoryId} in lineageStockOutItems to update warehouse selection.`); // Changed log
          }
        }
      });
      console.log('Event listener for warehouse select changes has been set up on lineage-stock-out-list-container.'); // Changed log
    } else {
      console.warn('#lineage-stock-out-list-container not found when trying to set up warehouse select event listener.'); // Changed log
    }
}

/**
 * Handles the click event on a row in the inventory summary table.
 * Populates and displays the stock-out popup with data from the clicked row.
 * @param {Event} event - The click event object.
 */
function handleLineageInventoryRowClick(event) { // Renamed function
    const row = event.currentTarget;
    const itemId = row.dataset.itemId;

    if (event.ctrlKey) {
        event.preventDefault(); 
        if (currentlyEditingRowId === itemId) {
            return; 
        }
        if (currentlyEditingRowId && currentlyEditingRowId !== itemId) {
            const previousEditingRow = document.querySelector(`#lineage-inventory-summary-tbody tr[data-item-id="${currentlyEditingRowId}"]`); // Changed ID
            if (previousEditingRow) {
                revertRowToStatic(previousEditingRow); // This function is already adapted
            }
        }
        currentlyEditingRowId = itemId;
        makeRowEditable(row); // This function is already adapted

    } else {
        if (currentlyEditingRowId === itemId) {
            return;
        }
        if (currentlyEditingRowId && currentlyEditingRowId !== itemId) {
            const previousEditingRow = document.querySelector(`#lineage-inventory-summary-tbody tr[data-item-id="${currentlyEditingRowId}"]`); // Changed ID
            if (previousEditingRow) {
                revertRowToStatic(previousEditingRow);
            }
        }

        const stockOutPopup = document.getElementById('lineage-stock-out-popup'); // Changed ID
        if (!stockOutPopup) {
            console.error("Cannot handle row click for Lineage: Stock out popup not found."); // Changed log
            return;
        }

        const clickedMixedPalletGroupId = row.dataset.mixedPalletGroupId;
        const clickedLotNumber = row.dataset.lotNumber;
        const clickedDateStored = row.dataset.dateStored;
        const clickedItemId = itemId; 

        let itemsForPopup = [];
        const originalItem = {
            id: clickedItemId,
            productCode: row.dataset.productCode,
            productName: row.dataset.productName,
            llmItemCode: row.dataset.llmItemCode, // Added LLM Item Code
            productPackaging: row.dataset.productPackaging,
            _3plDetails: {
                palletType: row.dataset.palletType,
                location: row.dataset.location,
                lotNumber: clickedLotNumber,
                dateStored: clickedDateStored,
                mixedPalletGroupId: clickedMixedPalletGroupId,
                pallet: row.dataset.pallets || '0',
                llm_item_code: row.dataset.llmItemCode // Ensure it's here if needed for _3plDetails consistency
            },
            batchNo: row.dataset.batchNo,
            container: row.dataset.container,
            quantity: parseInt(row.dataset.quantity, 10),
            productId: row.dataset.productId,
        };
        itemsForPopup.push(originalItem);

        if (clickedMixedPalletGroupId && clickedMixedPalletGroupId.trim() !== '') {
            const matchingItems = currentLineageInventorySummaryItems.filter(item => { // Changed variable
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
            // Lineage specific: Add LLM Item Code to popup display
            const fieldsToShow = [
                { label: 'Item Code :', value: itemObject.productCode },
                { label: 'Product Description :', value: itemObject.productName },
                { label: 'LLM Item Code :', value: itemObject.llmItemCode || (itemObject._3plDetails && itemObject._3plDetails.llm_item_code) || '' },
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
                llmItemCode: itemObject.llmItemCode || (itemObject._3plDetails && itemObject._3plDetails.llm_item_code) || '', // Added LLM Item Code to dataset
                batchNo: itemObject.batchNo || '',
                warehouseId: 'lineage', // Changed warehouseId
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
            palletLabel.setAttribute('for', `stock-out-pallet-quantity-${itemObject.id}`);
            palletLabel.textContent = `Pallets to Stock Out (for ${itemObject.productCode}, Lot: ${itemObject._3plDetails?.lotNumber || 'N/A'}):`;
            const palletInput = document.createElement('input');
            palletInput.type = 'number';
            palletInput.id = `stock-out-pallet-quantity-${itemObject.id}`;
            palletInput.name = `stock-out-pallet-quantity-${itemObject.id}`;
            palletInput.className = 'dynamic-stock-out-pallet-quantity';
            palletInput.min = "0"; 
            palletInput.dataset.itemId = itemObject.id; 

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
 * Handles adding an item to the temporary stock-out list (`lineageStockOutItems`).
 * Retrieves data from the stock-out popup, validates it, creates a stock-out item object,
 * and then updates the UI.
 */
function handleLineageAddToStockOutList() { // Renamed function
    const stockOutPopup = document.getElementById('lineage-stock-out-popup'); // Changed ID
    const dynamicQuantityInputs = stockOutPopup.querySelectorAll('.dynamic-stock-out-quantity');
    const dynamicPalletQuantityInputs = stockOutPopup.querySelectorAll('.dynamic-stock-out-pallet-quantity');

    if (!stockOutPopup || dynamicQuantityInputs.length === 0) {
        console.error("Lineage Popup or dynamic quantity inputs not found."); // Changed log
        alert("Error: Could not process the request. Popup input elements missing.");
        return;
    }
    if (dynamicQuantityInputs.length !== dynamicPalletQuantityInputs.length) {
        console.error("Mismatch between quantity inputs and pallet quantity inputs for Lineage."); // Changed log
        alert("Error: UI inconsistency for stock out inputs. Please refresh.");
        return;
    }

    let allItemsValid = true;
    const itemsToAdd = [];

    dynamicQuantityInputs.forEach((qtyInput, index) => {
        const itemId = qtyInput.dataset.itemId;
        const palletQtyInput = stockOutPopup.querySelector(`#stock-out-pallet-quantity-${itemId}`); 

        const quantityToStockOut = parseInt(qtyInput.value, 10);
        let palletsToStockOut = 0; 
        if (palletQtyInput && palletQtyInput.value.trim() !== '') {
            palletsToStockOut = parseInt(palletQtyInput.value, 10);
        }
        
        const currentQuantity = parseInt(qtyInput.dataset.currentQuantity, 10);
        const currentPallets = parseInt(qtyInput.dataset.currentPallets, 10);

        if (qtyInput.value.trim() === '') {
            if (!palletQtyInput || palletQtyInput.value.trim() === '' || palletsToStockOut === 0) {
                return; 
            }
        }
        
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

        if (quantityToStockOut === 0 && palletsToStockOut === 0 && qtyInput.value.trim() === '' && (!palletQtyInput || palletQtyInput.value.trim() === '')) {
            return;
        }

        const stockOutItem = {
            inventoryId: itemId,
            productId: qtyInput.dataset.productId,
            productCode: qtyInput.dataset.productCode,
            productName: qtyInput.dataset.productName,
            llmItemCode: qtyInput.dataset.llmItemCode, // Added LLM Item Code
            productPackaging: qtyInput.dataset.productPackaging,
            location: qtyInput.dataset.location,
            lotNumber: qtyInput.dataset.lotNumber,
            batchNumber: qtyInput.dataset.batchNo, 
            warehouseId: qtyInput.dataset.warehouseId, // Should be 'lineage' from dataset
            originalQuantityInInventory: currentQuantity,
            quantityToStockOut,
            palletsToStockOut: palletsToStockOut, 
            palletType: qtyInput.dataset.palletType,
            container: qtyInput.dataset.container,
            dateStored: qtyInput.dataset.dateStored,
            currentPallets: qtyInput.dataset.currentPallets,
            selectedDestinationWarehouseId: null, 
        };

        if (mainWarehouses && mainWarehouses.length > 0) {
            stockOutItem.selectedDestinationWarehouseId = mainWarehouses[0].id;
        }
        itemsToAdd.push(stockOutItem);
    });

    if (!allItemsValid) {
        return; 
    }

    if (itemsToAdd.length === 0) {
        alert("No items with valid quantities or pallet quantities were entered for stock out.");
        return;
    }

    lineageStockOutItems.push(...itemsToAdd); // Changed variable name
    
    renderLineageStockOutPreview(); // Changed function call

    dynamicQuantityInputs.forEach(input => input.value = '');
    dynamicPalletQuantityInputs.forEach(input => input.value = ''); 
    stockOutPopup.style.display = 'none';
}


function setupLineageStockOutPopupClose() { // Renamed function
    const stockOutPopup = document.getElementById('lineage-stock-out-popup'); // Changed ID
    const closeBtn = stockOutPopup ? stockOutPopup.querySelector('.close-btn') : null;
    const closePopupButton = document.getElementById('lineage-close-popup-btn'); // Changed ID

    if (!stockOutPopup) {
        console.error("Lineage Stock out popup element not found. Cannot setup close functionality."); // Changed log
        return;
    }

    const closePopup = () => {
        stockOutPopup.style.display = 'none';
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closePopup);
    } else {
        console.warn("Close button (.close-btn) not found in lineage-stock-out-popup."); // Changed log
    }

    if (closePopupButton) {
        closePopupButton.addEventListener('click', closePopup);
    } else {
        console.warn("Close button (#lineage-close-popup-btn) not found."); // Changed log
    }

    stockOutPopup.addEventListener('click', function(event) {
        if (event.target === stockOutPopup) { 
            closePopup();
        }
    });
}


async function handleLineageSubmitStockIn() { // Renamed function
    console.log('handleLineageSubmitStockIn called'); // Changed log
    const stockInTableBody = document.getElementById('lineage-stock-in-table-body'); // Changed ID
    if (!stockInTableBody) {
        console.error('Stock In table body (#lineage-stock-in-table-body) not found for submission.'); // Changed log
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
    
    const submitStockInButton = document.getElementById('lineage-submit-stock-in-btn'); // Changed ID
    if (submitStockInButton) {
        submitStockInButton.disabled = true;
    }

    try {
        const db = firebase.firestore(); // Assuming Firebase
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
        alert('Lineage Stock In updated successfully!'); // Changed log
        console.log('Lineage Stock In updated successfully for items:', itemsToUpdate.map(item => item.itemId)); // Changed log
        
        if(stockInTableBody) stockInTableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Update successful. Refreshing...</td></tr>';
        loadPendingLineageStock().then(displayPendingLineageStockInTable).catch(err => console.error("Error refreshing Lineage stock-in table:", err)); // Changed functions

        console.log("Attempting to refresh Lineage inventory summary data post-stock-in update."); // Changed log
        loadInventorySummaryData().then(displayLineageInventorySummary).catch(err => console.error("Error refreshing Lineage summary table post-stock-in:", err)); // Changed functions

    } catch (error) {
        console.error('Error updating Lineage stock in:', error); // Changed log
        alert('Error updating stock in. Please try again.');
    } finally {
        if (submitStockInButton) {
            submitStockInButton.disabled = false;
        }
    }
}

/**
 * Renders the preview of items added to the stock-out list in the #lineage-stock-out-content div.
 * Displays a table of items or a message if the list is empty.
 */
function renderLineageStockOutPreview() { // Renamed function
    const stockOutListContainer = document.getElementById('lineage-stock-out-list-container'); // Changed ID
    if (!stockOutListContainer) {
        console.error('#lineage-stock-out-list-container div not found. Cannot render preview.'); // Changed log
        return;
    }

    stockOutListContainer.innerHTML = ''; 

    if (lineageStockOutItems.length === 0) { // Changed variable
        stockOutListContainer.innerHTML = '<p>No items added for stock out yet.</p>';
        return;
    }

    let html = '<table class="table-styling-class">'; 
    html += `
        <thead>
            <tr>
                <th>S/N</th>
                <th>Product Description</th>
                <th>LLM Code</th> <!-- Added LLM Code Header -->
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

    lineageStockOutItems.forEach((item, index) => { // Changed variable
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
                <td>${escapeHtml(item.llmItemCode || '')}</td> <!-- Added LLM Item Code display -->
                <td>${escapeHtml(item.productPackaging)}</td>
                <td>${escapeHtml(item.location)}</td>
                <td>${escapeHtml(item.lotNumber)}</td>
                <td>${escapeHtml(String(item.palletsToStockOut))}</td> 
                <td><select class="form-control form-control-sm warehouse-select" data-item-inventory-id="${escapeHtml(item.inventoryId)}">${warehouseOptionsHtml}</select></td>
                <td>${escapeHtml(String(item.quantityToStockOut))}</td> 
                <td>${escapeHtml(item.batchNumber)}</td>
                <td><button class="btn btn-danger btn-sm remove-stock-out-item-btn" data-index="${index}">Remove</button></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    html += '<div style="text-align: center; margin-top: 20px;"><button id="lineage-submit-all-stock-out-btn" class="btn btn-success">Submit All Stock Out</button></div>'; // Changed ID

    stockOutListContainer.innerHTML = html;
}

/**
 * Handles the click event for "Remove" buttons in the stock-out preview list.
 * Removes the specified item from `lineageStockOutItems` and re-renders the preview.
 * @param {Event} event - The click event, expected to originate from a "Remove" button.
 */
function handleLineageRemoveStockOutItem(event) { // Renamed function
    if (event.target.classList.contains('remove-stock-out-item-btn')) {
        const indexToRemove = parseInt(event.target.dataset.index, 10);
        if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < lineageStockOutItems.length) { // Changed variable
            lineageStockOutItems.splice(indexToRemove, 1); // Changed variable
            renderLineageStockOutPreview(); // Changed function call
        } else {
            console.error("Invalid index for Lineage stock out item removal:", event.target.dataset.index); // Changed log
        }
    }
}

/**
 * Handles the submission of all items in the `lineageStockOutItems` list.
 * It processes each item, calls an API for stock out, and provides feedback.
 */
async function handleLineageSubmitAllStockOut() { // Renamed function
    const submitButton = document.getElementById('lineage-submit-all-stock-out-btn'); // Changed ID
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
    }

    try {
        if (lineageStockOutItems.length === 0) { // Changed variable
            alert("No items to stock out.");
            return;
        }

        const withdrawDateInput = document.getElementById('lineage-withdraw-date'); // Changed ID
        const withdrawDate = withdrawDateInput ? withdrawDateInput.value : '';
        const hhInput = document.getElementById('lineage-collection-time-hh'); // Changed ID
        const mmInput = document.getElementById('lineage-collection-time-mm'); // Changed ID
        const ampmInput = document.getElementById('lineage-collection-time-ampm'); // Changed ID
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

        const serialNumber = await getNextLineageSerialNumber(); // Changed function call
        if (!serialNumber || serialNumber.startsWith('ERROR_SN_')) {
            alert("Could not generate serial number for Lineage. Please try again. Error: " + serialNumber); // Changed log
            return;
        }

        const operatorId = firebase.auth().currentUser ? firebase.auth().currentUser.uid : "LINEAGE_WMS_USER_FALLBACK"; // Changed fallback


        const formDataForFirestore = {
            serialNumber: serialNumber,
            withdrawDate: withdrawDate,
            collectionTime: collectionTime,
            status: "Processing", 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Assuming Firebase
            items: lineageStockOutItems.map(item => ({ // Changed variable
                inventoryId: item.inventoryId, 
                productId: item.productId,
                productCode: item.productCode,
                productName: item.productName,
                llmItemCode: item.llmItemCode, // Added LLM Item Code
                productPackaging: item.productPackaging,
                location: item.location, 
                lotNumber: item.lotNumber,
                batchNumber: item.batchNumber,
                quantityToStockOut: item.quantityToStockOut, 
                palletsToStockOut: item.palletsToStockOut,  
                selectedDestinationWarehouseId: item.selectedDestinationWarehouseId,
                destinationWarehouseName: (mainWarehouses.find(wh => wh.id === item.selectedDestinationWarehouseId)?.name) || 'N/A',
                transferStatus: 'Pending' 
            })),
            operatorId: operatorId
        };

        const db = firebase.firestore(); // Assuming Firebase
        const formDocRef = await db.collection('lineageWithdrawForms').add(formDataForFirestore); // Changed collection
        console.log('Lineage Withdraw Form saved with ID: ' + formDocRef.id + '. Serial Number: ' + serialNumber + '. Now processing inventory transactions.'); // Changed log
        
        if (submitButton) {
            submitButton.textContent = 'Updating Inventory...';
        }

        let allTransactionsSuccessful = true;
        const transactionResults = [];
        let processedItemsArray = JSON.parse(JSON.stringify(formDataForFirestore.items)); 

        for (let i = 0; i < processedItemsArray.length; i++) {
            const item = processedItemsArray[i]; 
            let outboundSuccess = false;

            try {
                // 1. Outbound from Lineage
                const outboundData = {
                    inventoryId: item.inventoryId,
                    quantityToDecrement: item.quantityToStockOut, 
                    palletsToDecrement: item.palletsToStockOut,  
                    productCode: item.productCode, 
                    productName: item.productName, 
                    productId: item.productId, 
                    operatorId: operatorId
                    // Note: llmItemCode is not part of outboundData structure currently for transactionAPI
                };
                await window.transactionAPI.outboundStockByInventoryId(outboundData); // Assuming this API is generic
                outboundSuccess = true;

                // 2. Inbound to Destination Warehouse
                const inboundData = {
                    productId: item.productId,
                    productCode: item.productCode,
                    productName: item.productName,
                    // llmItemCode: item.llmItemCode, // If transactionAPI.inboundStock needs it
                    warehouseId: item.selectedDestinationWarehouseId, 
                    batchNo: item.batchNumber, 
                    quantity: item.quantityToStockOut,
                    operatorId: operatorId,
                };
                await window.transactionAPI.inboundStock(inboundData); // Assuming this API is generic
                
                processedItemsArray[i].transferStatus = 'Completed';
                delete processedItemsArray[i].errorMessage; 
                transactionResults.push({ item: item.productCode, llm: item.llmItemCode, status: 'Transferred Successfully' });

            } catch (error) {
                allTransactionsSuccessful = false;
                const currentItemError = error.message || "Unknown error during inventory transaction.";
                console.error(`Error processing Lineage item ${item.productCode} (LLM: ${item.llmItemCode}, Inv ID: ${item.inventoryId}):`, currentItemError, error); // Changed log
                
                transactionResults.push({ item: item.productCode, llm: item.llmItemCode, status: `Failed: ${currentItemError}` });

                let failureStage = 'Unknown';
                if (outboundSuccess) failureStage = 'Inbound Failed after Outbound Succeeded';
                else failureStage = 'Outbound Failed';
                
                processedItemsArray[i].transferStatus = `Failed - ${failureStage}`;
                processedItemsArray[i].errorMessage = currentItemError;
            }
        }

        await formDocRef.update({
            status: allTransactionsSuccessful ? "Completed" : "Partially Completed / Failed",
            items: processedItemsArray 
        });

        let finalMessage = `Lineage Withdraw Form ${serialNumber} processed.\n`; // Changed log
        transactionResults.forEach(res => {
            finalMessage += `\n- ${res.item} (LLM: ${res.llm || 'N/A'}): ${res.status}`; // Added LLM to message
        });
        
        if (!allTransactionsSuccessful) {
            finalMessage += "\n\nSome inventory transactions failed. Please check the form details and system logs.";
        }
        alert(finalMessage);

        const printableHTML = generateLineagePrintableStockOutHTML(formDataForFirestore); // Changed function call
        const printWindow = window.open('', '_blank', 'height=600,width=800');
        if (printWindow) {
            printWindow.document.write(printableHTML);
            printWindow.document.close();
            printWindow.focus();
        } else {
            alert('Could not open print window. Please check your browser pop-up blocker settings.');
        }

        lineageStockOutItems = []; // Changed variable
        renderLineageStockOutPreview(); // Changed function call
        if (hhInput) hhInput.value = '';
        if (mmInput) mmInput.value = '';
        if (ampmInput) ampmInput.value = 'AM';
        setDefaultLineageWithdrawDate(); // Changed function call
        
        console.log("Refreshing Lineage inventory summary data after stock out processing."); // Changed log
        loadInventorySummaryData().then(displayLineageInventorySummary).catch(err => { // Changed display function
            console.error("Error refreshing Lineage inventory summary post stock-out:", err); // Changed log
        });

    } catch (error) {
        console.error("Error in handleLineageSubmitAllStockOut:", error); // Changed log
        alert("An unexpected error occurred: " + error.message);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit All Stock Out';
        }
    }
}
