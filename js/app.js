// 主应用逻辑
document.addEventListener('DOMContentLoaded', function () {
  // Authentication Check
  if (sessionStorage.getItem('isAuthenticated') !== 'true') {
      window.location.href = 'login.html';
      return; // Stop further execution of app.js if not authenticated
  }

const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.querySelector('.sidebar-toggle');
const mainContent = document.querySelector('.main-content');

if (sidebarToggle && sidebar && mainContent) {
  sidebarToggle.addEventListener('click', function () {
    sidebar.classList.toggle('sidebar-collapsed');
  });
}

// 初始化页面
initNavigation();
loadDashboard();

// New Avatar Dropdown Logic
const avatarMenuTrigger = document.getElementById('avatar-menu-trigger');
const avatarDropdown = document.getElementById('avatar-dropdown');
const dropdownLogoutButton = document.getElementById('dropdown-logout-button');

if (avatarMenuTrigger && avatarDropdown) {
    avatarMenuTrigger.addEventListener('click', function(event) {
        event.stopPropagation(); // Prevents click from immediately bubbling to window
        avatarDropdown.classList.toggle('show');
    });
}

// Logout functionality from dropdown
if (dropdownLogoutButton) {
    dropdownLogoutButton.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent default anchor behavior
        sessionStorage.removeItem('isAuthenticated');
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    });
}

// Optional: Close dropdown if clicked outside
window.addEventListener('click', function(event) {
    if (avatarDropdown && avatarDropdown.classList.contains('show')) {
        // Check if the click was outside the trigger and outside the dropdown
        if (!avatarMenuTrigger.contains(event.target) && !avatarDropdown.contains(event.target)) {
            avatarDropdown.classList.remove('show');
        }
    }
});

// Display logged-in user's name (this part can remain as is)
const usernameDisplay = document.getElementById('username-display');
const loggedInUser = sessionStorage.getItem('loggedInUser');
if (usernameDisplay && loggedInUser) {
    usernameDisplay.textContent = loggedInUser;
}
});

// 初始化导航
function initNavigation() {
const navItems = document.querySelectorAll('.sidebar li');

navItems.forEach((item) => {
  item.addEventListener('click', function () {
    // 移除所有active类
    navItems.forEach((nav) => nav.classList.remove('active'));

    // 添加active类到当前项
    this.classList.add('active');

    // 加载对应页面
    const page = this.getAttribute('data-page');
    loadPage(page);
  });
});
}

// 加载页面内容
function loadPage(page) {
const content = document.getElementById('content');

switch (page) {
  case 'dashboard':
    loadDashboard();
    break;
  case 'products':
    loadProducts();
    break;
  case 'inventory':
    loadInventory();
    break;
  case 'transactions':
    loadTransactions(); // This function is not yet defined in the provided files
    break;
  case 'inbound':
    loadInboundForm();
    break;
  case 'outbound':
    loadOutboundForm();
    break;
  default:
    loadDashboard();
}
}

// 加载仪表盘
async function loadDashboard() {
const content = document.getElementById('content');
content.innerHTML = `
    <div class="dashboard">
        <h1>Welcome to Li Chuan Inventory Management System</h1>
        <div class="stats">
            <div class="stat-card">
                <i class="fas fa-boxes"></i>
                <div>
                    <h3>Total Product</h3>
                    <p id="total-products">0</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-warehouse"></i>
                <div>
                    <h3>Total Quantity</h3>
                    <p id="total-inventory">0</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-exchange-alt"></i>
                <div>
                    <h3>Transaction</h3>
                    <p id="today-transactions">0</p>
                </div>
            </div>
        </div>
    </div>
`;

try {
  // Assuming dashboardAPI is globally available (from api.js)
  const stats = await window.dashboardAPI.getStats();
  document.getElementById('total-products').textContent = stats.totalProducts;
  document.getElementById('total-inventory').textContent =
    stats.totalInventory;
  document.getElementById('today-transactions').textContent =
    stats.todayTransactions;
} catch (error) {
  console.error('加载仪表盘数据失败:', error);
  // Optionally display a user-friendly error message in the UI
}
}

// 入库表单
function loadInboundForm() {
const content = document.getElementById('content');
content.innerHTML = `
    <div class="form-container">
        <h1>Inbound</h1>
        <form id="inbound-form">
            <div class="form-group">
                <label for="inbound-productCode"Item Code*</label>
                <input type="text" id="inbound-productCode" name="productCode" required>
            </div>
            <div class="form-group">
                <label for="inbound-warehouseId">Warehouse ID*</label>
                <input type="text" id="inbound-warehouseId" name="warehouseId" value="WH01" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="inbound-batchNo">Batch No</label>
                    <input type="text" id="inbound-batchNo" name="batchNo">
                </div>
                <div class="form-group">
                    <label for="inbound-expiryDate">Exp Date</label>
                    <input type="date" id="inbound-expiryDate" name="expiryDate">
                </div>
            </div>
            <div class="form-group">
                <label for="inbound-quantity">Quantity*</label>
                <input type="number" id="inbound-quantity" name="quantity" min="1" required>
            </div>
            <div class="form-group">
                <label for="inbound-operatorId">User ID*</label>
                <input type="text" id="inbound-operatorId" name="operatorId" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="inbound-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-primary">Submit</button>
            </div>
        </form>
    </div>
`;

document
  .getElementById('inbound-cancel-btn')
  .addEventListener('click', () => loadPage('inventory'));
document
  .getElementById('inbound-form')
  .addEventListener('submit', handleInboundSubmit);
}

async function handleInboundSubmit(e) {
e.preventDefault();
const form = e.target;
const formData = new FormData(form);
const rawData = Object.fromEntries(formData.entries());

const submitButton = form.querySelector('button[type="submit"]');
submitButton.disabled = true;
submitButton.textContent = 'Submitting...';

try {
  const product = await window.productAPI.getProductByCode(
    rawData.productCode
  );
  if (!product) {
    alert(
      `Product with code "${rawData.productCode}" not found. Please check the code or add the product first.`
    );
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
    return;
  }

  const inboundData = {
    productId: product.id,
    productCode: product.productCode,
    productName: product.name,
    warehouseId: rawData.warehouseId,
    batchNo: rawData.batchNo,
    expiryDate: rawData.expiryDate || null,
    quantity: Number(rawData.quantity),
    operatorId: rawData.operatorId,
  };

  await window.transactionAPI.inboundStock(inboundData);
  alert('Inbound successful!');
  loadPage('inventory');
} catch (error) {
  console.error('Inbound failed:', error);
  alert('Inbound failed: ' + error.message);
} finally {
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
  }
}
}

// 出库表单
function loadOutboundForm() {
const content = document.getElementById('content');
content.innerHTML = `
    <div class="form-container">
        <h1>Out Bound</h1>
        <form id="outbound-form">
            <div class="form-group">
                <label for="outbound-productCode">Item Code*</label>
                <input type="text" id="outbound-productCode" name="productCode" required>
            </div>
            <div class="form-group">
                <label for="outbound-warehouseId">Warehouse ID*</label>
                <input type="text" id="outbound-warehouseId" name="warehouseId" value="WH01" required>
            </div>
            <div class="form-group">
                <label for="outbound-batchNo">Batch No</label>
                <input type="text" id="outbound-batchNo" name="batchNo">
            </div>
            <div class="form-group">
                <label for="outbound-quantity">Quantity*</label>
                <input type="number" id="outbound-quantity" name="quantity" min="1" required>
            </div>
            <div class="form-group">
                <label for="outbound-operatorId">User ID*</label>
                <input type="text" id="outbound-operatorId" name="operatorId" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="outbound-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-primary">Submit</button>
            </div>
        </form>
    </div>
`;

document
  .getElementById('outbound-cancel-btn')
  .addEventListener('click', () => loadPage('inventory'));
document
  .getElementById('outbound-form')
  .addEventListener('submit', handleOutboundSubmit);
}

async function handleOutboundSubmit(e) {
e.preventDefault();
const form = e.target;
const formData = new FormData(form);
const rawData = Object.fromEntries(formData.entries());

const submitButton = form.querySelector('button[type="submit"]');
submitButton.disabled = true;
submitButton.textContent = 'Submitting...';

try {
  const product = await window.productAPI.getProductByCode(
    rawData.productCode
  );
  if (!product) {
    alert(`Product with code "${rawData.productCode}" not found.`);
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
    return;
  }

  const outboundData = {
    productId: product.id,
    productCode: product.productCode,
    productName: product.name,
    warehouseId: rawData.warehouseId,
    batchNo: rawData.batchNo,
    quantity: Number(rawData.quantity),
    operatorId: rawData.operatorId,
  };

  await window.transactionAPI.outboundStock(outboundData);
  alert('Outbound successful!');
  loadPage('inventory');
} catch (error) {
  console.error('Outbound failed:', error);
  alert('Outbound failed: ' + error.message);
} finally {
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
  }
}
}

if (typeof loadTransactions === 'undefined') {
window.loadTransactions = function () {
  console.warn('loadTransactions function is not defined yet.');
  document.getElementById('content').innerHTML =
    '<h1>Transactions (Not Implemented)</h1>';
};
}
