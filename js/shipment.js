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
  const resultsEl = shipmentModuleState.currentResultsContainer;
  if (!resultsEl) return;
  let html = '';
  if (!data || data.length === 0) {
      html += '<p>No data to display for this view.</p>';
  } else {
      html += '<table border="1"><thead><tr>';
      ['Item Code', 'Product Description', 'Packing Size', 'Batch No', 'Quantity', 'Remove'].forEach(h => html += `<th>${h}</th>`);
      html += '</tr></thead><tbody>';
      const dataKeys = ['itemCode', 'productDescription', 'packingSize', 'batchNo', 'quantity'];
      data.forEach((item, rowIndex) => {
          html += `<tr data-row-index="${rowIndex}">`;
          dataKeys.forEach(key => {
              const value = item[key] !== undefined ? item[key] : '';
              html += `<td><input type="text" class="editable-cell-input" data-row-index="${rowIndex}" data-column-key="${key}" value="${escapeHtml(value)}"></td>`;
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

function handleUpdateInventoryClick() {
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

  shipmentModuleState.viewDefinitions.forEach(viewDef => {
      const viewName = viewDef.name;
      const viewDisplayName = viewDef.displayName; // This is the warehouseId
      const dataForThisView = shipmentModuleState.allExtractedData[viewName];

      if (dataForThisView && dataForThisView.length > 0) {
          dataForThisView.forEach(item => {
              const firestoreDoc = {
                  productCode: String(item.itemCode || '').trim(),
                  productName: String(item.productDescription || '').trim(),
                  batchNo: String(item.batchNo || '').trim(),
                  quantity: Number(item.quantity || 0),
                  packingSize: String(item.packingSize || '').trim(),
                  warehouseId: String(viewDisplayName || '').trim(), // Use the view's display name
                  lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
              };

              if (!firestoreDoc.productCode) {
                  console.warn("Skipping item with empty productCode:", item, "for warehouse:", viewDisplayName);
                  return; // Skip this item in the forEach
              }
              const newDocRef = db.collection('inventory').doc();
              batch.set(newDocRef, firestoreDoc);
              totalItemsToUpdate++;
          });
      }
  });

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
  const resultsEl = shipmentModuleState.currentResultsContainer; 
  const tabNavEl = shipmentModuleState.currentShipmentTabNav;   

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
          if (typeof XLSX === 'undefined') { throw new Error("SheetJS library (XLSX) not loaded.");}
          const fileData = new Uint8Array(e.target.result);
          const workbook = XLSX.read(fileData, { type: 'array' });
          const convertSheet = workbook.Sheets['Convert'];
          if (!convertSheet) { throw new Error("Sheet 'Convert' not found.");}
          const convertSheetData = XLSX.utils.sheet_to_json(convertSheet, { header: 1, blankrows: false });
          if (convertSheetData.length === 0) { throw new Error("The 'Convert' sheet is empty.");}

          const sheet1 = workbook.Sheets['sheet 1'];
          const sheet1LookupMap = new Map();
          if (!sheet1) { console.warn("Sheet 'Sheet 1' not found."); } 
          else { 
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
              } else { console.warn("'Sheet 1' is empty."); }
          }
          console.log('Sheet 1 Lookup Map:', sheet1LookupMap);

          shipmentModuleState.allExtractedData = {}; 
          shipmentModuleState.viewDefinitions.forEach(viewDef => {
              shipmentModuleState.allExtractedData[viewDef.name] = extractDataForView(convertSheetData, viewDef, sheet1LookupMap);
          });
          console.log("Processed new file. All Extracted Data:", shipmentModuleState.allExtractedData);
          redisplayCurrentData();

      } catch (error) {
          console.error('Error processing file:', error);
          if (resultsEl) resultsEl.innerHTML = `<p style="color: red;">An error occurred: ${error.message}</p>`;
          if (tabNavEl) tabNavEl.style.display = 'none';
          updateButtonState(); 
      }
  };
  reader.onerror = function(error) { 
      console.error('FileReader error:', error);
      if (resultsEl) resultsEl.innerHTML = '<p style="color: red;">Error reading file.</p>';
      if (tabNavEl) tabNavEl.style.display = 'none';
      updateButtonState();
  };
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
