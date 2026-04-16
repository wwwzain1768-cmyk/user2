// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// تسجيل Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed', err));
  });
}

const firebaseConfig = {
  apiKey: "AIzaSyBcFdnGgYs8dAbp_fF2Xy9jOa5_avE0l9o",
  authDomain: "kjjkj-21259.firebaseapp.com",
  projectId: "kjjkj-21259",
  storageBucket: "kjjkj-21259.firebasestorage.app",
  messagingSenderId: "424983926852",
  appId: "1:424983926852:web:0e2dfc9d1f0fa2a0564411"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentLoggedTowerCode = "";
let currentLoggedTowerName = "";
let editCustomerId = null;
let allTowersData = [];
let allCustomersData = [];
let networkBannerDismissed = false;

async function saveLoginState() {
  await localforage.setItem('savedTowerLogin', {
    towerCode: currentLoggedTowerCode,
    towerName: currentLoggedTowerName
  });
}

async function clearLoginState() {
  await localforage.removeItem('savedTowerLogin');
}

function goToDashboardDirect() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('greeting-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = 'block';
  if (currentLoggedTowerName) {
    document.getElementById('greeting-text').innerText = currentLoggedTowerName;
  }
  window.renderCustomers();
}

function getDurationMs() {
  return 30 * 24 * 60 * 60 * 1000;
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function formatLocalDate(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function getNowIso() {
  return new Date().toISOString();
}

function getDatePartFromIso(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return formatLocalDate(d);
}

function buildLocalDateTimeFromDateString(dateString) {
  if (!dateString) return new Date();
  const parts = dateString.split('-').map(Number);
  const now = new Date();
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, now.getHours(), now.getMinutes(), now.getSeconds(), 0);
}

function buildRealSubscriptionDates(baseInput) {
  let start;
  if (!baseInput) {
    start = new Date();
  } else if (typeof baseInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(baseInput)) {
    start = buildLocalDateTimeFromDateString(baseInput);
  } else {
    start = new Date(baseInput);
    if (isNaN(start.getTime())) start = new Date();
  }

  let end = new Date(start.getTime() + getDurationMs());

  return {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end)
  };
}

function normalizeCustomerDates(customer) {
  if (!customer) return customer;

  if (!customer.startDateTime || !customer.endDateTime) {
    let baseInput = customer.startDateTime || customer.startDate || getNowIso();
    let built = buildRealSubscriptionDates(baseInput);
    customer.startDateTime = customer.startDateTime || built.startDateTime;
    customer.endDateTime = customer.endDateTime || built.endDateTime;
    customer.startDate = customer.startDate || built.startDate;
    customer.endDate = customer.endDate || built.endDate;
  } else {
    customer.startDate = customer.startDate || getDatePartFromIso(customer.startDateTime);
    customer.endDate = customer.endDate || getDatePartFromIso(customer.endDateTime);
  }

  return customer;
}

function calculateEndDateFromStartDate(startDate) {
  if (!startDate) return "";
  let start = buildLocalDateTimeFromDateString(startDate);
  let endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 30);
  return formatLocalDate(endDate);
}

function updateEndDateFromStartDate() {
  let startDate = document.getElementById('startDate').value;
  document.getElementById('endDate').value = calculateEndDateFromStartDate(startDate);
}

// إدارة حالة الاتصال والمزامنة
function updateNetworkStatus(status) {
  const banner = document.getElementById('network-status');
  const bannerText = document.getElementById('network-status-text');
  banner.className = 'status-banner ' + status;

  if (status === 'online') {
    networkBannerDismissed = false;
    banner.style.display = 'block';
    bannerText.innerText = 'متصل بالإنترنت - البيانات محدثة';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 2000);
  } else if (status === 'offline') {
    if (networkBannerDismissed) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'block';
    bannerText.innerText = 'وضع عدم الاتصال (أوفلاين) - سيتم حفظ البيانات محلياً';
  } else if (status === 'syncing') {
    networkBannerDismissed = false;
    banner.style.display = 'block';
    bannerText.innerText = 'جاري مزامنة البيانات...';
  }
}

window.dismissNetworkStatus = function() {
  networkBannerDismissed = true;
  document.getElementById('network-status').style.display = 'none';
};

window.addEventListener('online', () => {
  networkBannerDismissed = false;
  updateNetworkStatus('online');
  processSyncQueue();
});

window.addEventListener('offline', () => {
  updateNetworkStatus('offline');
});

if (!navigator.onLine) {
  updateNetworkStatus('offline');
}

window.addEventListener('load', () => {
  if (navigator.onLine) processSyncQueue();
});

window.addEventListener('focus', () => {
  if (navigator.onLine) processSyncQueue();
});

// نظام طابور المزامنة (Sync Queue) لمنع التكرار والحفظ للأوفلاين
async function saveOperationToQueue(action, id, customerData) {
  let queue = await localforage.getItem('syncQueue') || [];

  if (action === 'delete') {
    queue = queue.filter(op => op.id !== id);
    queue.push({ action: 'delete', id: id });
  } else if (action === 'edit') {
    let existingIdx = queue.findIndex(op => op.id === id);
    if (existingIdx !== -1) {
      queue[existingIdx].customer = customerData;
    } else {
      queue.push({ action: 'edit', id: id, customer: customerData });
    }
  } else if (action === 'add') {
    queue.push({ action: 'add', id: id, customer: customerData });
  }

  await localforage.setItem('syncQueue', queue);
}

async function processSyncQueue() {
  let queue = await localforage.getItem('syncQueue') || [];
  if (queue.length === 0) return;

  updateNetworkStatus('syncing');

  try {
    const docRef = doc(db, "data", "customers");
    const docSnap = await getDoc(docRef);
    let latestData = docSnap.exists() ? (docSnap.data().customersData || []).map(normalizeCustomerDates) : [];

    for (let op of queue) {
      if (op.action === 'add') {
        let exists = latestData.find(c => c.id === op.customer.id);
        if (!exists) latestData.push(op.customer);
      } else if (op.action === 'edit') {
        let idx = latestData.findIndex(c => c.id === op.id);
        if (idx !== -1) {
          latestData[idx] = op.customer;
        } else {
          latestData.push(op.customer);
        }
      } else if (op.action === 'delete') {
        latestData = latestData.filter(c => c.id !== op.id);
      }
    }

    await setDoc(docRef, { customersData: latestData });
    allCustomersData = latestData;
    await localforage.setItem('cachedCustomers', allCustomersData);
    await localforage.setItem('syncQueue', []);

    if (currentLoggedTowerCode) window.renderCustomers();
    updateNetworkStatus('online');
  } catch (error) {
    console.error("Sync failed", error);
    updateNetworkStatus('offline');
  }
}

// تحميل البيانات مبدئياً من المحلي (Offline First)
async function initData() {
  let cachedCustomers = await localforage.getItem('cachedCustomers');
  if (cachedCustomers) {
    allCustomersData = cachedCustomers.map(normalizeCustomerDates);
    if (currentLoggedTowerCode) window.renderCustomers();
  }

  let cachedTowers = await localforage.getItem('cachedTowers');
  if (cachedTowers) {
    allTowersData = cachedTowers;
  }

  onSnapshot(doc(db, "data", "towers"), async (docSnap) => {
    if (docSnap.exists()) {
      allTowersData = docSnap.data().towersArray || [];
      await localforage.setItem('cachedTowers', allTowersData);
    }
  });

  onSnapshot(doc(db, "data", "customers"), async (docSnap) => {
    if (docSnap.exists()) {
      let queue = await localforage.getItem('syncQueue') || [];
      if (queue.length === 0) {
        allCustomersData = (docSnap.data().customersData || []).map(normalizeCustomerDates);
        await localforage.setItem('cachedCustomers', allCustomersData);
        if (currentLoggedTowerCode) window.renderCustomers();
      }
    }
  });

  if (navigator.onLine) {
    processSyncQueue();
  }
}
initData();

window.loginWithGoogle = function() {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      const provider = new GoogleAuthProvider();
      return signInWithPopup(auth, provider);
    })
    .catch(error => {
      alert("خطأ: " + error.message);
    });
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('auth-screen').style.display = 'none';
    const savedLogin = await localforage.getItem('savedTowerLogin');
    if (savedLogin && savedLogin.towerCode) {
      currentLoggedTowerCode = savedLogin.towerCode;
      currentLoggedTowerName = savedLogin.towerName || "";
      goToDashboardDirect();
      if (navigator.onLine) processSyncQueue();
    } else if (!currentLoggedTowerCode) {
      document.getElementById('login-section').style.display = 'block';
    }
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('greeting-section').style.display = 'none';
  }
});

window.showModal = function(msg, type, onConfirmCallback) {
  document.getElementById('customModal').style.display = 'flex';
  document.getElementById('modalMsg').innerText = msg;
  let actions = document.getElementById('modalActions');
  actions.innerHTML = "";

  if (type === 'alert') {
    let btn = document.createElement('button');
    btn.className = 'modal-btn btn-confirm';
    btn.innerText = 'حسناً';
    btn.onclick = () => {
      document.getElementById('customModal').style.display = 'none';
    };
    actions.appendChild(btn);
  } else if (type === 'confirm') {
    let btnYes = document.createElement('button');
    btnYes.className = 'modal-btn btn-confirm';
    btnYes.innerText = 'نعم';
    btnYes.onclick = () => {
      document.getElementById('customModal').style.display = 'none';
      if (onConfirmCallback) onConfirmCallback();
    };

    let btnNo = document.createElement('button');
    btnNo.className = 'modal-btn btn-cancel';
    btnNo.innerText = 'إلغاء';
    btnNo.onclick = () => {
      document.getElementById('customModal').style.display = 'none';
    };

    actions.appendChild(btnYes);
    actions.appendChild(btnNo);
  }
};

window.showInputModal = function(msg, onConfirmCallback) {
  document.getElementById('inputModal').style.display = 'flex';
  document.getElementById('inputModalMsg').innerText = msg;
  document.getElementById('inputModalValue').value = "";
  let actions = document.getElementById('inputModalActions');
  actions.innerHTML = "";

  let btnYes = document.createElement('button');
  btnYes.className = 'modal-btn btn-confirm';
  btnYes.innerText = 'تأكيد';
  btnYes.onclick = () => {
    let val = document.getElementById('inputModalValue').value;
    document.getElementById('inputModal').style.display = 'none';
    if (onConfirmCallback) onConfirmCallback(val);
  };

  let btnNo = document.createElement('button');
  btnNo.className = 'modal-btn btn-cancel';
  btnNo.innerText = 'إلغاء';
  btnNo.onclick = () => {
    document.getElementById('inputModal').style.display = 'none';
  };

  actions.appendChild(btnYes);
  actions.appendChild(btnNo);
};

window.showNoteModal = function(msg, onConfirmCallback) {
  document.getElementById('noteModal').style.display = 'flex';
  document.getElementById('noteModalMsg').innerText = msg;
  document.getElementById('noteModalValue').value = "";
  let actions = document.getElementById('noteModalActions');
  actions.innerHTML = "";

  let btnYes = document.createElement('button');
  btnYes.className = 'modal-btn btn-confirm';
  btnYes.innerText = 'تأكيد';
  btnYes.onclick = () => {
    let val = document.getElementById('noteModalValue').value;
    document.getElementById('noteModal').style.display = 'none';
    if (onConfirmCallback) onConfirmCallback(val);
  };

  let btnNo = document.createElement('button');
  btnNo.className = 'modal-btn btn-cancel';
  btnNo.innerText = 'إلغاء';
  btnNo.onclick = () => {
    document.getElementById('noteModal').style.display = 'none';
  };

  actions.appendChild(btnYes);
  actions.appendChild(btnNo);
};

window.checkCode = function() {
  let enteredCode = document.getElementById('enteredCode').value;
  let errorMsg = document.getElementById('error-msg');

  if (allTowersData.length === 0) {
    errorMsg.innerText = "لا توجد أبراج مسجلة! تأكد من إنشائها في موقع الإدارة أولاً.";
    return;
  }

  let foundTower = null;
  for (let i = 0; i < allTowersData.length; i++) {
    if (allTowersData[i].towerCode === enteredCode) {
      foundTower = allTowersData[i];
      break;
    }
  }

  if (foundTower) {
    errorMsg.innerText = "";
    currentLoggedTowerCode = foundTower.towerCode;
    currentLoggedTowerName = foundTower.towerName || "";
    document.getElementById('greeting-text').innerText = currentLoggedTowerName;
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('greeting-section').style.display = 'flex';
  } else {
    errorMsg.innerText = "كلمة السر (الرمز) غير صحيحة، يرجى المحاولة مرة أخرى.";
  }
};

window.confirmIdentity = async function() {
  document.getElementById('greeting-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = 'block';
  await saveLoginState();
  if (navigator.onLine) processSyncQueue();
  window.renderCustomers();
};

window.cancelLogin = async function() {
  document.getElementById('greeting-section').style.display = 'none';
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('enteredCode').value = "";
  currentLoggedTowerCode = "";
  currentLoggedTowerName = "";
  await clearLoginState();
};

window.switchAccount = async function() {
  document.getElementById('dashboard-section').style.display = 'none';
  document.getElementById('greeting-section').style.display = 'none';
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('enteredCode').value = "";
  currentLoggedTowerCode = "";
  currentLoggedTowerName = "";
  await clearLoginState();
};

window.switchCustomerTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.customer-tab-content').forEach(content => content.classList.remove('active'));

  if (tab === 'all') {
    document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    document.getElementById('all-customers-tab').classList.add('active');
  } else {
    document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    document.getElementById('expired-customers-tab').classList.add('active');
  }
};

window.toggleAddForm = function() {
  let formSection = document.getElementById('addCustomerSection');
  if (formSection.style.display === 'none') {
    formSection.style.display = 'block';
    if (editCustomerId === null) {
      let today = new Date();
      document.getElementById('startDate').value = formatLocalDate(today);
      updateEndDateFromStartDate();
    }
  } else {
    formSection.style.display = 'none';
    window.resetForm();
  }
};

window.resetForm = function() {
  document.getElementById('customerName').value = "";
  document.getElementById('customerPrice').value = "";
  document.getElementById('startDate').value = "";
  document.getElementById('endDate').value = "";
  editCustomerId = null;
  document.getElementById('saveCustomerBtn').innerText = "حفظ بيانات الزبون";
};

window.addCustomer = async function() {
  let name = document.getElementById('customerName').value;
  let price = document.getElementById('customerPrice').value;
  let startDate = document.getElementById('startDate').value;
  let endDate = calculateEndDateFromStartDate(startDate);

  if (name === "" || price === "" || startDate === "" || endDate === "") {
    window.showModal("الرجاء تعبئة جميع البيانات!", "alert");
    return;
  }

  if (editCustomerId === null) {
    let realDates = buildRealSubscriptionDates(startDate);
    let newCustomer = {
      id: Date.now(),
      towerCode: currentLoggedTowerCode,
      name: name,
      price: price,
      startDate: realDates.startDate,
      endDate: realDates.endDate,
      startDateTime: realDates.startDateTime,
      endDateTime: realDates.endDateTime,
      paid: 0,
      debts: 0,
      history: [{
        date: formatLocalDate(new Date()),
        action: 'تسجيل اشتراك',
        amount: parseFloat(price)
      }],
      isPaid: false
    };
    allCustomersData.push(newCustomer);
    await saveOperationToQueue('add', newCustomer.id, newCustomer);
    window.showModal("تمت إضافة الزبون بنجاح!", "alert");
  } else {
    let updatedCustomer;
    for (let i = 0; i < allCustomersData.length; i++) {
      if (allCustomersData[i].id === editCustomerId) {
        let realDates = buildRealSubscriptionDates(startDate);
        allCustomersData[i].name = name;
        allCustomersData[i].price = price;
        allCustomersData[i].startDate = realDates.startDate;
        allCustomersData[i].endDate = realDates.endDate;
        allCustomersData[i].startDateTime = realDates.startDateTime;
        allCustomersData[i].endDateTime = realDates.endDateTime;
        updatedCustomer = allCustomersData[i];
        break;
      }
    }
    await saveOperationToQueue('edit', editCustomerId, updatedCustomer);
    window.showModal("تم التعديل بنجاح!", "alert");
  }

  await localforage.setItem('cachedCustomers', allCustomersData);
  window.resetForm();
  document.getElementById('addCustomerSection').style.display = 'none';
  window.renderCustomers();
  if (navigator.onLine) processSyncQueue();
};

window.searchCustomers = function() {
  let input = document.getElementById('searchInput').value.toLowerCase();
  let items = document.querySelectorAll('.customer-item');
  items.forEach(item => {
    let name = item.querySelector('.customer-name-wrap span').innerText.toLowerCase();
    if (name.includes(input)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
};

window.renderCustomers = function() {
  let listContainer = document.getElementById('customersList');
  let expiredContainer = document.getElementById('expiredList');
  listContainer.innerHTML = "";
  expiredContainer.innerHTML = "";

  let towerCustomers = allCustomersData.filter(cust => cust.towerCode === currentLoggedTowerCode);

  towerCustomers.sort((a, b) => {
    let today = new Date();
    today.setHours(0, 0, 0, 0);

    let getRemaining = (customerObj) => {
      let end = new Date(customerObj.endDateTime || customerObj.endDate);
      if (isNaN(end.getTime())) return 0;
      return end.getTime() - today.getTime();
    };

    return getRemaining(a) - getRemaining(b);
  });

  let towerDebt = 0;
  towerCustomers.forEach(cust => {
    let cDebts = cust.debts || 0;
    let cPaid = cust.paid || 0;
    let cTotal = parseFloat(cust.price || 0) + parseFloat(cDebts);
    let rem = cTotal - cPaid;
    if (rem > 0) {
      towerDebt += rem;
    }
  });

  document.getElementById('towerSubscribers').innerText = towerCustomers.length;
  document.getElementById('towerDebt').innerText = towerDebt;

  if (towerCustomers.length === 0) {
    listContainer.innerHTML = "<p style='text-align:center;color:#fff;'>لا يوجد زبائن حالياً في هذا البرج.</p>";
    expiredContainer.innerHTML = "<p style='text-align:center;color:#fff;'>لا يوجد زبائن منتهية اشتراكاتهم.</p>";
    return;
  }

  towerCustomers.forEach(customer => {
    customer = normalizeCustomerDates(customer);
    let remainingDays = 0;
    let remainingHours = 0;
    let endSource = customer.endDateTime || customer.endDate;

    if (endSource) {
      let end = new Date(endSource);
      let now = new Date();
      let diffTime = end.getTime() - now.getTime();
      if (diffTime > 0) {
        remainingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        remainingHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      }
    }

    let isExpired = !(remainingDays > 0 || remainingHours > 0);
    let cDebts = customer.debts || 0;
    let cPaid = customer.paid || 0;
    let originalPrice = parseFloat(customer.price || 0) + parseFloat(cDebts);
    let currentTotal = originalPrice - cPaid;
    let remaining = currentTotal;
    let currentDebt = Math.max(remaining, 0);

    let itemDiv = document.createElement('div');
    itemDiv.className = 'customer-item';
    itemDiv.onclick = function(e) {
      if (e.target.tagName.toLowerCase() === 'button') return;
      let details = document.getElementById('details-' + customer.id);
      if (details.classList.contains('show')) {
        details.classList.remove('show');
      } else {
        details.classList.add('show');
      }
    };

    let paymentHTML = "";
    if (remaining <= 0) {
      paymentHTML = `✔ تم التسديد`;
    } else {
      paymentHTML = `تسديد`;
    }

    let remainingText = 'منتهي';
    if (!isExpired && (customer.endDateTime || customer.endDate)) {
      remainingText = remainingDays + ' يوم ' + remainingHours + ' ساعة';
    }

    itemDiv.innerHTML = `
        <div class="customer-header">
          <div class="customer-name-wrap">
            <span>${customer.name}</span>
            <span class="customer-debt-inline">الدين: ${currentDebt} دينار</span>
          </div>
          <span dir="rtl">${remainingText}</span>
        </div>
        <div class="customer-details" id="details-${customer.id}">
          <p>الدين: ${currentDebt} دينار</p>
          <p>تاريخ البدء: ${customer.startDate}</p>
          <p>تاريخ الانتهاء: ${customer.endDate}</p>
          <div class="customer-actions">
            <button class="action-btn" onclick="renewSubscription(${customer.id})">تجديد الاشتراك</button>
            <button class="action-btn note-btn" onclick="addNote(${customer.id})">ملاحظات</button>
            <button class="action-btn debt-btn" onclick="addDebt(${customer.id})">إضافة دين</button>
            <button class="action-btn pay-btn" onclick="paySubscription(${customer.id})">${paymentHTML}</button>
            <button class="action-btn edit-btn" onclick="editCustomer(${customer.id})">تعديل</button>
            <button class="action-btn history-btn" onclick="showHistory(${customer.id})">سجل كامل</button>
            <button class="action-btn delete-btn" onclick="deleteCustomer(${customer.id})">حذف</button>
          </div>
        </div>
      `;
    listContainer.appendChild(itemDiv);

    if (isExpired) {
      let expDiv = itemDiv.cloneNode(true);
      expDiv.innerHTML = itemDiv.innerHTML.replace(`id="details-${customer.id}"`, `id="details-exp-${customer.id}"`);
      expDiv.onclick = function(e) {
        if (e.target.tagName.toLowerCase() === 'button') return;
        let details = document.getElementById('details-exp-' + customer.id);
        if (details.classList.contains('show')) details.classList.remove('show');
        else details.classList.add('show');
      };
      expiredContainer.appendChild(expDiv);
    }
  });

  if (expiredContainer.innerHTML === "") {
    expiredContainer.innerHTML = "<p style='text-align:center;color:#fff;'>لا يوجد زبائن منتهية اشتراكاتهم.</p>";
  }
};

window.paySubscription = function(id) {
  window.showInputModal("أدخل المبلغ المراد تسديده:", async (amount) => {
    if (!amount || isNaN(amount) || amount <= 0) {
      window.showModal("الرجاء إدخال مبلغ صحيح!", "alert");
      return;
    }

    let customer = allCustomersData.find(c => c.id === id);
    if (customer) {
      customer.paid = (customer.paid || 0) + parseFloat(amount);
      customer.history = customer.history || [];
      let today = formatLocalDate(new Date());
      customer.history.push({ date: today, action: `تسديد مبلغ`, amount: parseFloat(amount) });

      await saveOperationToQueue('edit', id, customer);
      await localforage.setItem('cachedCustomers', allCustomersData);
      window.showModal("تم التسديد بنجاح!", "alert");
      window.renderCustomers();
      if (navigator.onLine) processSyncQueue();
    }
  });
};

window.renewSubscription = function(id) {
  window.showInputModal("أدخل مبلغ التجديد:", async (amount) => {
    if (!amount || isNaN(amount) || amount <= 0) {
      window.showModal("الرجاء إدخال مبلغ صحيح!", "alert");
      return;
    }

    let customer = allCustomersData.find(c => c.id === id);
    if (customer) {
      customer.debts = (customer.debts || 0) + parseFloat(amount);
      let realDates = buildRealSubscriptionDates(formatLocalDate(new Date()));
      customer.startDate = realDates.startDate;
      customer.endDate = realDates.endDate;
      customer.startDateTime = realDates.startDateTime;
      customer.endDateTime = realDates.endDateTime;
      customer.history = customer.history || [];
      let todayStr = formatLocalDate(new Date());
      customer.history.push({ date: todayStr, action: `تجديد الاشتراك`, amount: parseFloat(amount) });

      await saveOperationToQueue('edit', id, customer);
      await localforage.setItem('cachedCustomers', allCustomersData);
      window.showModal("تم تجديد الاشتراك بنجاح!", "alert");
      window.renderCustomers();
      if (navigator.onLine) processSyncQueue();
    }
  });
};

window.addDebt = function(id) {
  window.showInputModal("أدخل مبلغ الدين المضاف:", async (amount) => {
    if (!amount || isNaN(amount) || amount <= 0) {
      window.showModal("الرجاء إدخال مبلغ صحيح!", "alert");
      return;
    }

    let customer = allCustomersData.find(c => c.id === id);
    if (customer) {
      customer.debts = (customer.debts || 0) + parseFloat(amount);
      customer.history = customer.history || [];
      let today = formatLocalDate(new Date());
      customer.history.push({ date: today, action: `إضافة دين`, amount: parseFloat(amount) });

      await saveOperationToQueue('edit', id, customer);
      await localforage.setItem('cachedCustomers', allCustomersData);
      window.showModal("تمت إضافة الدين بنجاح!", "alert");
      window.renderCustomers();
      if (navigator.onLine) processSyncQueue();
    }
  });
};

window.addNote = function(id) {
  window.showNoteModal("أدخل الملاحظة:", async (note) => {
    if (!note || note.trim() === "") {
      return;
    }

    let customer = allCustomersData.find(c => c.id === id);
    if (customer) {
      customer.history = customer.history || [];
      let today = formatLocalDate(new Date());
      customer.history.push({ date: today, action: `ملاحظة: ${note}`, amount: "" });

      await saveOperationToQueue('edit', id, customer);
      await localforage.setItem('cachedCustomers', allCustomersData);
      window.showModal("تمت إضافة الملاحظة بنجاح!", "alert");
      window.renderCustomers();
      if (navigator.onLine) processSyncQueue();
    }
  });
};

window.showHistory = function(id) {
  let customer = allCustomersData.find(c => c.id === id);
  if (customer) {
    let historyHTML = "";
    let historyArr = customer.history || [];

    if (historyArr.length === 0) {
      historyHTML = "<p style='text-align:center;'>لا يوجد سجل متاح.</p>";
    } else {
      historyHTML = historyArr.map(h => `
        <div class="history-item">
          ${h.date}: ${h.action} ${h.amount !== "" ? '(' + h.amount + ' دينار)' : ''}
        </div>
      `).join('');
    }

    document.getElementById('historyContent').innerHTML = historyHTML;
    document.getElementById('historyModal').style.display = 'flex';
  }
};

window.editCustomer = function(id) {
  let customer = allCustomersData.find(c => c.id === id);
  if (customer) {
    customer = normalizeCustomerDates(customer);
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerPrice').value = customer.price;
    document.getElementById('startDate').value = customer.startDate || "";
    document.getElementById('endDate').value = customer.endDate || "";
    editCustomerId = id;
    document.getElementById('saveCustomerBtn').innerText = "تحديث بيانات الزبون";
    document.getElementById('addCustomerSection').style.display = 'block';
    window.scrollTo(0, 0);
  }
};

document.getElementById('startDate').addEventListener('change', updateEndDateFromStartDate);

window.deleteCustomer = function(id) {
  window.showModal("هل تود الحذف بالتأكيد؟", "confirm", async () => {
    allCustomersData = allCustomersData.filter(c => c.id !== id);
    await saveOperationToQueue('delete', id, null);
    await localforage.setItem('cachedCustomers', allCustomersData);
    window.showModal("تم الحذف بنجاح!", "alert");
    window.renderCustomers();
    if (navigator.onLine) processSyncQueue();
  });
};
