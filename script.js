// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

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

let towersArray = [];
let allCustomers = [];
let sectorsArray = [];
let editIndex = null;
let editSectorIndex = null;
let totalSubscribers = 0;
let totalDebt = 0;

window.openTab = function(tabId, evt) {
    let contents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove('active');

    let buttons = document.getElementsByClassName('tab-btn');
    for (let i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');

    document.getElementById(tabId).classList.add('active');
    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');

    if (tabId === 'tab-towers') renderDetailedTowers();
    if (tabId === 'tab-sectors') renderSectors();
}

window.saveTower = async function() {
    let name = document.getElementById('towerName').value.trim();
    let owner = document.getElementById('ownerName').value.trim();
    let code = document.getElementById('towerCode').value.trim();

    if (name === "" || owner === "" || code === "") {
        alert("الرجاء تعبئة جميع الحقول!");
        return;
    }

    let newTower = { towerName: name, ownerName: owner, towerCode: code };

    if (editIndex === null) {
        towersArray.push(newTower);
        await setDoc(doc(db, "data", "towers"), { towersArray });
    } else {
        let oldCode = towersArray[editIndex].towerCode;
        towersArray[editIndex] = newTower;

        if (oldCode !== code) {
            let customersUpdated = false;
            for (let i = 0; i < allCustomers.length; i++) {
                if (allCustomers[i].towerCode === oldCode) {
                    allCustomers[i].towerCode = code;
                    customersUpdated = true;
                }
            }
            if (customersUpdated) {
                await setDoc(doc(db, "data", "customers"), { customersData: allCustomers });
            }
        }

        editIndex = null;
        document.getElementById('towerSaveBtn').innerText = "حفظ البرج";
        await setDoc(doc(db, "data", "towers"), { towersArray });
    }

    document.getElementById('towerName').value = "";
    document.getElementById('ownerName').value = "";
    document.getElementById('towerCode').value = "";
}

window.deleteTower = async function(index) {
    if (confirm("هل أنت متأكد من حذف هذا البرج؟")) {
        towersArray.splice(index, 1);
        await setDoc(doc(db, "data", "towers"), { towersArray });
    }
}

window.editTower = function(index) {
    document.getElementById('towerName').value = towersArray[index].towerName;
    document.getElementById('ownerName').value = towersArray[index].ownerName;
    document.getElementById('towerCode').value = towersArray[index].towerCode;
    document.getElementById('towerSaveBtn').innerText = "تحديث بيانات البرج";
    editIndex = index;
}

window.openTowerInfo = function(index) {
    let selectedTower = towersArray[index];
    alert(`تم الدخول إلى البرج: ${selectedTower.towerName}\nالرجاء الذهاب لتبويبة (الأبراج) لعرض التفاصيل الكاملة والسجل.`);
}

window.saveSector = async function() {
    const villageName = document.getElementById('sectorVillage').value.trim();
    const sectorNumber = document.getElementById('sectorNumber').value.trim();
    const sectorIp = document.getElementById('sectorIp').value.trim();

    if (villageName === "" || sectorNumber === "" || sectorIp === "") {
        alert("الرجاء تعبئة جميع الحقول!");
        return;
    }

    const newSector = {
        villageName,
        sectorNumber,
        sectorIp
    };

    if (editSectorIndex === null) {
        sectorsArray.push(newSector);
    } else {
        sectorsArray[editSectorIndex] = newSector;
        editSectorIndex = null;
        document.getElementById('sectorSaveBtn').innerText = "حفظ السكتر";
    }

    await setDoc(doc(db, "data", "sectors"), { sectorsArray });
    clearSectorForm();
}

window.editSector = function(index) {
    const sector = sectorsArray[index];
    document.getElementById('sectorVillage').value = sector.villageName || "";
    document.getElementById('sectorNumber').value = sector.sectorNumber || "";
    document.getElementById('sectorIp').value = sector.sectorIp || "";
    document.getElementById('sectorSaveBtn').innerText = "تحديث بيانات السكتر";
    editSectorIndex = index;
    document.getElementById('tab-sectors').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.deleteSector = async function(index) {
    if (!confirm("هل أنت متأكد من حذف هذا السكتر؟")) return;
    sectorsArray.splice(index, 1);
    await setDoc(doc(db, "data", "sectors"), { sectorsArray });
    if (editSectorIndex === index) {
        editSectorIndex = null;
        clearSectorForm();
        document.getElementById('sectorSaveBtn').innerText = "حفظ السكتر";
    }
}

window.openSectorIp = function(ip) {
    const value = String(ip || '').trim();
    if (!value) return;
    const url = /^https?:\/\//i.test(value) ? value : `http://${value}`;
    // استخدام عنصر رابط للفتح - أكثر موثوقية خصوصاً في وضع PWA
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function buildSectorIpUrl(ipRaw) {
    const value = String(ipRaw || '').trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clearSectorForm() {
    document.getElementById('sectorVillage').value = "";
    document.getElementById('sectorNumber').value = "";
    document.getElementById('sectorIp').value = "";
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installAppBtn').style.display = 'block';
});

document.getElementById('installAppBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('installAppBtn').style.display = 'none';
        }
        deferredPrompt = null;
    }
});

document.getElementById('google-login-btn').addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => {
        alert("خطأ: " + error.message);
    });
});

document.getElementById('verify-code-btn').addEventListener('click', () => {
    if (document.getElementById('adminCode').value === '1001') {
        document.getElementById('code-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        const welcomeScreen = document.getElementById('welcome-screen');
        welcomeScreen.style.opacity = '1';
        welcomeScreen.style.display = 'flex';
        setTimeout(() => {
            welcomeScreen.style.opacity = '0';
            setTimeout(() => { welcomeScreen.style.display = 'none'; }, 1000);
        }, 3000);

        loadTowers();
    } else {
        alert('الرمز غير صحيح!');
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('code-screen').style.display = 'flex';
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('code-screen').style.display = 'none';
        document.getElementById('main-content').style.display = 'none';
    }
});

function loadTowers() {
    onSnapshot(doc(db, "data", "towers"), (docSnap) => {
        if (docSnap.exists()) {
            towersArray = docSnap.data().towersArray || [];
        } else {
            towersArray = [];
        }
        renderTowers();
        renderDetailedTowers();
    });

    onSnapshot(doc(db, "data", "customers"), (docSnap) => {
        if (docSnap.exists()) {
            allCustomers = docSnap.data().customersData || [];
        } else {
            allCustomers = [];
        }
        updateStats();
        renderDetailedTowers();
    });

    onSnapshot(doc(db, "data", "sectors"), (docSnap) => {
        if (docSnap.exists()) {
            sectorsArray = docSnap.data().sectorsArray || [];
        } else {
            sectorsArray = [];
        }
        renderSectors();
    });
}

function updateStats() {
    totalSubscribers = allCustomers.length;
    totalDebt = 0;

    allCustomers.forEach(cust => {
        let cDebts = parseFloat(cust.debts || 0);
        let cPaid = parseFloat(cust.paid || 0);
        let cPrice = parseFloat(cust.price || 0);
        let cTotal = cPrice + cDebts;
        let rem = cTotal - cPaid;
        if (rem > 0) totalDebt += rem;
    });

    document.getElementById('totalTowersCount').innerText = towersArray.length;
    document.getElementById('totalSubscribers').innerText = totalSubscribers;
    document.getElementById('totalDebt').innerText = totalDebt;
}

function renderTowers() {
    updateStats();
    let listContainer = document.getElementById('towersList');
    listContainer.innerHTML = "";

    towersArray.forEach((tower, index) => {
        let itemDiv = document.createElement('div');
        itemDiv.className = 'tower-item';
        itemDiv.onclick = function() { openTowerInfo(index); };

        itemDiv.innerHTML = `
            <div class="tower-info">
                <div>
                    <p><strong>البرج:</strong> ${tower.towerName}</p>
                    <p><strong>المالك:</strong> ${tower.ownerName}</p>
                    <p><strong>الرمز:</strong> ${tower.towerCode}</p>
                </div>
                <div class="action-btns">
                    <button class="edit-btn" onclick="event.stopPropagation(); editTower(${index})">تعديل</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteTower(${index})">حذف</button>
                </div>
            </div>
        `;
        listContainer.appendChild(itemDiv);
    });
}

function renderDetailedTowers() {
    let listContainer = document.getElementById('detailedTowersList');
    if (!listContainer) return;
    listContainer.innerHTML = "";

    let allTowersDebt = 0;

    towersArray.forEach((tower, index) => {
        let towerCustomers = allCustomers.filter(c => c.towerCode === tower.towerCode);

        let tSubs = towerCustomers.length;
        let tDebt = 0;
        let tRem = 0;
        let customersHTML = "";

        towerCustomers.forEach(cust => {
            let cDebts = parseFloat(cust.debts || 0);
            let cPaid = parseFloat(cust.paid || 0);
            let cPrice = parseFloat(cust.price || 0);
            let cTotal = cPrice + cDebts;
            let rem = cTotal - cPaid;

            tDebt += cDebts;
            if (rem > 0) tRem += rem;

            customersHTML += `
                <div class="history-item">
                    <p><strong>الاسم:</strong> ${cust.name}</p>
                    <p><strong>الرقم:</strong> ${cust.phone}</p>
                    <p><strong>المبلغ المطلوب الكلي (مع الدين):</strong> ${cTotal} | <strong>الباقي:</strong> <span style="color:#e74c3c; font-weight:bold;">${rem}</span></p>
                </div>
            `;
        });

        allTowersDebt += tDebt;

        if (customersHTML === "") {
            customersHTML = "<p style='text-align:center; color:#7f8c8d; padding: 10px;'>لا يوجد مشتركين في هذا البرج حالياً.</p>";
        }

        let itemDiv = document.createElement('div');
        itemDiv.className = 'tower-item';

        itemDiv.onclick = function(e) {
            if (e.target.tagName.toLowerCase() === 'button') return;
            let details = document.getElementById('tower-details-tab-' + index);
            if (details.classList.contains('show')) details.classList.remove('show');
            else details.classList.add('show');
        };

        itemDiv.innerHTML = `
            <div class="customer-header">
                <span>${tower.towerName}</span>
                <span style="font-size: 0.9rem; color: #7f8c8d">الرمز: ${tower.towerCode}</span>
            </div>
            <div class="customer-details" id="tower-details-tab-${index}">
                <div class="customer-info" style="margin-bottom: 15px; border-bottom: 1px solid #bdc3c7; padding-bottom: 10px;">
                    <p><strong>المالك:</strong> ${tower.ownerName}</p>
                    <p><strong>عدد المشتركين:</strong> ${tSubs}</p>
                    <p><strong>الدين الكلي المضاف:</strong> ${tDebt} دينار</p>
                    <p><strong>الباقي من الديون:</strong> <span style="color:#e74c3c; font-weight:bold;">${tRem} دينار</span></p>
                </div>
                <h4 style="margin-bottom: 10px; color: #2980b9;">سجل المشتركين:</h4>
                ${customersHTML}
            </div>
        `;
        listContainer.appendChild(itemDiv);
    });

    document.getElementById('allTowersDebtTop').innerText = allTowersDebt;
}

function renderSectors() {
    const wrapper = document.getElementById('sectorsTableWrapper');
    if (!wrapper) return;

    if (!Array.isArray(sectorsArray) || sectorsArray.length === 0) {
        wrapper.innerHTML = `<div class="empty-box">لا توجد سكاتر مضافة حالياً.</div>`;
        return;
    }

    const grouped = {};
    sectorsArray.forEach((sector, index) => {
        const villageName = (sector.villageName || '').trim() || 'بدون اسم';
        if (!grouped[villageName]) grouped[villageName] = [];
        grouped[villageName].push({ ...sector, originalIndex: index });
    });

    const villageNames = Object.keys(grouped);
    let html = `
        <table class="sectors-table">
            <thead>
                <tr>
                    <th>القرية</th>
                    <th>السكتر</th>
                    <th>الايبيات</th>
                    <th>الإجراءات</th>
                </tr>
            </thead>
            <tbody>
    `;

    villageNames.forEach(villageName => {
        const rows = grouped[villageName];
        rows.forEach((sector, rowIndex) => {
            html += `<tr>`;

            if (rowIndex === 0) {
                html += `<td class="village-name-cell" rowspan="${rows.length}">${escapeHtml(villageName)}</td>`;
            }

            const ipRaw = sector.sectorIp || '';
            const ipUrl = buildSectorIpUrl(ipRaw);
            const ipCellHtml = ipRaw
                ? `<a class="ip-link" href="${escapeHtml(ipUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ipRaw)}</a>`
                : '';

            html += `
                <td>${escapeHtml(sector.sectorNumber || '')}</td>
                <td>${ipCellHtml}</td>
                <td>
                    <div class="sector-actions">
                        <button class="edit-btn" onclick="editSector(${sector.originalIndex})">تعديل</button>
                        <button class="delete-btn" onclick="deleteSector(${sector.originalIndex})">حذف</button>
                    </div>
                </td>
            `;

            html += `</tr>`;
        });
    });

    html += `</tbody></table>`;
    wrapper.innerHTML = html;
}
