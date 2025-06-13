// API基础配置
const API_BASE_URL = 'https://us-central1-inventory-management-sys-b3678.cloudfunctions.net';

// 通用请求函数
async function makeRequest(method, endpoint, data = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || '请求失败');
        }

        return result;
    } catch (error) {
        console.error('API请求错误:', error);
        throw error;
    }
}

// 产品API
export const productAPI = {
    getProducts: (params) => {
        const queryString = new URLSearchParams(params).toString();
        return makeRequest('GET', `/getProducts?${queryString}`);
    },
    addProduct: (data) => makeRequest('POST', '/addProduct', data),
};

// 库存API
export const inventoryAPI = {
    getInventory: (params) => {
        const queryString = new URLSearchParams(params).toString();
        return makeRequest('GET', `/getInventory?${queryString}`);
    },
};

// 交易API
export const transactionAPI = {
    getTransactions: (params) => {
        const queryString = new URLSearchParams(params).toString();
        return makeRequest('GET', `/getTransactions?${queryString}`);
    },
    inboundStock: (data) => makeRequest('POST', '/inboundStock', data),
    outboundStock: (data) => makeRequest('POST', '/outboundStock', data),
};

// 仪表盘数据
export const dashboardAPI = {
    getStats: () => makeRequest('GET', '/getDashboardStats'),
};