// 主应用逻辑
document.addEventListener('DOMContentLoaded', function () {
  // 初始化页面
  initNavigation();
  loadDashboard();
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
      loadTransactions();
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
          <h1>欢迎使用库存管理系统</h1>
          <div class="stats">
              <div class="stat-card">
                  <i class="fas fa-boxes"></i>
                  <div>
                      <h3>总产品数</h3>
                      <p id="total-products">0</p>
                  </div>
              </div>
              <div class="stat-card">
                  <i class="fas fa-warehouse"></i>
                  <div>
                      <h3>总库存量</h3>
                      <p id="total-inventory">0</p>
                  </div>
              </div>
              <div class="stat-card">
                  <i class="fas fa-exchange-alt"></i>
                  <div>
                      <h3>今日交易</h3>
                      <p id="today-transactions">0</p>
                  </div>
              </div>
          </div>
      </div>
  `;

  try {
    const stats = await dashboardAPI.getStats();
    document.getElementById('total-products').textContent = stats.totalProducts;
    document.getElementById('total-inventory').textContent =
      stats.totalInventory;
    document.getElementById('today-transactions').textContent =
      stats.todayTransactions;
  } catch (error) {
    console.error('加载仪表盘数据失败:', error);
  }
}

// 入库表单
function loadInboundForm() {
  const content = document.getElementById('content');
  content.innerHTML = `
      <div class="form-container">
          <h1>产品入库</h1>
          <form id="inbound-form">
              <div class="form-group">
                  <label for="inbound-productCode">产品代码*</label>
                  <input type="text" id="inbound-productCode" name="productCode" required>
              </div>
              <div class="form-group">
                  <label for="inbound-warehouseId">仓库ID*</label>
                  <input type="text" id="inbound-warehouseId" name="warehouseId" value="WH01" required>
              </div>
              <div class="form-row">
                  <div class="form-group">
                      <label for="inbound-batchNo">批次号</label>
                      <input type="text" id="inbound-batchNo" name="batchNo">
                  </div>
                  <div class="form-group">
                      <label for="inbound-expiryDate">过期日期</label>
                      <input type="date" id="inbound-expiryDate" name="expiryDate">
                  </div>
              </div>
              <div class="form-group">
                  <label for="inbound-quantity">数量*</label>
                  <input type="number" id="inbound-quantity" name="quantity" min="1" required>
              </div>
              <div class="form-group">
                  <label for="inbound-operatorId">操作员ID*</label>
                  <input type="text" id="inbound-operatorId" name="operatorId" required>
              </div>
              <div class="form-actions">
                  <button type="button" class="btn btn-secondary" id="inbound-cancel-btn">取消</button>
                  <button type="submit" class="btn btn-primary">提交</button>
              </div>
          </form>
      </div>
  `;

  // 添加事件监听器
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
  const inboundData = Object.fromEntries(formData.entries());

  try {
    await transactionAPI.inboundStock(inboundData);
    alert('入库成功!');
    loadPage('inventory');
  } catch (error) {
    console.error('入库失败:', error);
    alert('入库失败: ' + error.message);
  }
}

// 出库表单
function loadOutboundForm() {
  const content = document.getElementById('content');
  content.innerHTML = `
      <div class="form-container">
          <h1>产品出库</h1>
          <form id="outbound-form">
              <div class="form-group">
                  <label for="outbound-productCode">产品代码*</label>
                  <input type="text" id="outbound-productCode" name="productCode" required>
              </div>
              <div class="form-group">
                  <label for="outbound-warehouseId">仓库ID*</label>
                  <input type="text" id="outbound-warehouseId" name="warehouseId" value="WH01" required>
              </div>
              <div class="form-group">
                  <label for="outbound-batchNo">批次号</label>
                  <input type="text" id="outbound-batchNo" name="batchNo">
              </div>
              <div class="form-group">
                  <label for="outbound-quantity">数量*</label>
                  <input type="number" id="outbound-quantity" name="quantity" min="1" required>
              </div>
              <div class="form-group">
                  <label for="outbound-operatorId">操作员ID*</label>
                  <input type="text" id="outbound-operatorId" name="operatorId" required>
              </div>
              <div class="form-actions">
                  <button type="button" class="btn btn-secondary" id="outbound-cancel-btn">取消</button>
                  <button type="submit" class="btn btn-primary">提交</button>
              </div>
          </form>
      </div>
  `;

  // 添加事件监听器
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
  const outboundData = Object.fromEntries(formData.entries());

  try {
    await transactionAPI.outboundStock(outboundData);
    alert('出库成功!');
    loadPage('inventory');
  } catch (error) {
    console.error('出库失败:', error);
    alert('出库失败: ' + error.message);
  }
}
