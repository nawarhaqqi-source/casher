// worker.js

// قاموس التصحيحات اللغوية
const voiceCorrections = {
    "سنجر": "فنكر", "فنجر": "فنكر", "سنايبر": "فنكر", "بنكر": "فنكر", "اصابع": "فنكر",
    "بيت لحم": "ستيك لحم", "تيك لحم": "ستيك لحم", "استيك": "ستيك", "ستيج": "ستيك",
    "فيزا": "بيتزا", "بيزا": "بيتزا", "بيدزا": "بيتزا",
    "سفينة": "سفن", "سفينه": "سفن", "سفن اب": "سفن",
    "ببسي": "بيبسي", "بيسي": "بيبسي", "تبسي": "بيبسي",
    "كولا": "كوكا", "كوكاكولا": "كوكا",
    "شنينة": "لبن", "شنينه": "لبن", "رائب": "لبن",
    "ما": "ماء", "ماي": "ماء", "مي": "ماء",
    "دكه": "تكه", "دقه": "تكه", "تكي": "تكه",
    "معلاك": "معلاق", "علاق": "معلاق",
    "جوانح": "اجنحة",
    "همبرجر": "همبركر", "برجر": "همبركر", "بركر": "همبركر",
    "شاورما": "قص", "كصة": "قص", "قصه": "قص", "كص": "قص",
    "جيز": "تشيز", "شيز": "تشيز",
    "ساج": "صاج",
    "فهيتا": "فاهيتا", "فاهيته": "فاهيتا",
    "غوزي": "قوزي", "جوزي": "قوزي", "قوز": "قوزي",
    "باجه": "باجة", "باشة": "باجة", "باكر": "باجة",
    "دولمه": "دولمة", "ضلمة": "دولمة",
    "تجريب": "تشريب", "تشرب": "تشريب",
    "سمج": "سمك", "سمچ": "سمك", "مسكف": "مسكوف",
    "رايزو": "ريزو", "زيزو": "ريزو", "ريسو": "ريزو",
    "مقبلات": "مشكل", 
    "غنوج": "غنوج", "قنوج": "غنوج",
    "تبوله": "تبولة",
    "طرشي": "طرشي", "ترشي": "طرشي",
    "كبة": "كبة", "كبه": "كبة"
};

const wordToNum = { 
    "واحد": 1, "وحده": 1, "طنين": 2, "اثنين": 2, "ثنين": 2, 
    "ثلاثه": 3, "تلاثه": 3, "اربعه": 4, "خمسه": 5, 
    "سته": 6, "سبعه": 7, "ثمانيه": 8, "تسعه": 9, "عشره": 10 
};

function findNumberInText(text) {
    let match = text.match(/\d+/);
    if (match) return parseInt(match[0]);
    let words = text.split(/\s+/);
    for (let word of words) {
        if (wordToNum[word]) return wordToNum[word];
    }
    return 1;
}

// دالة حفظ آمنة تفتح قاعدة البيانات عند الحاجة
function saveToDB(basket) {
    const request = indexedDB.open("HayatCashierDB", 1);
    request.onupgradeneeded = (e) => {
        let db = e.target.result;
        if (!db.objectStoreNames.contains("orders")) {
            db.createObjectStore("orders", { keyPath: "id" });
        }
    };
    request.onsuccess = (e) => {
        const db = e.target.result;
        const transaction = db.transaction(["orders"], "readwrite");
        transaction.objectStore("orders").put({ 
            id: "current_active_order", 
            items: basket, 
            lastUpdate: Date.now() 
        });
    };
}

self.onmessage = function(e) {
    const { transcript, menuData, currentBasket, processedTokens, action, basket: manualBasket } = e.data;

    // معالجة الحفظ اليدوي (عند النقر بالماوس)
    if (action === 'SAVE_MANUAL') {
        saveToDB(manualBasket);
        return;
    }

    if (!transcript) return;
    let text = transcript.toLowerCase().trim();

    // تصحيح النص
    Object.keys(voiceCorrections).forEach(wrong => {
        text = text.replace(new RegExp(wrong, 'g'), voiceCorrections[wrong]);
    });

    // الأوامر السريعة
    if (text.includes("اطبع") || text.includes("تمام") || text.includes("توكل")) {
        self.postMessage({ action: 'PRINT' });
        return;
    }
    if (text.includes("تصفير") || text.includes("مسح")) {
        self.postMessage({ action: 'CLEAR' });
        return;
    }

    // تحليل الطلبات
    const deleteCommands = ["احذف", "شيل", "لغي"];
    const isDelete = deleteCommands.some(cmd => text.includes(cmd));
    
    let updatedBasket = [...currentBasket];
    let updatedTokens = new Set(processedTokens);
    let changed = false;

    menuData.forEach(item => {
        const foundKey = item.keys.find(key => text.includes(key));
        const tokenKey = item.id + "_" + foundKey + "_" + (isDelete ? "DEL" : "ADD");

        if (foundKey && !updatedTokens.has(tokenKey)) {
            if (isDelete) {
                const idx = updatedBasket.findIndex(b => b.id === item.id);
                if (idx > -1) updatedBasket.splice(idx, 1);
            } else {
                let qty = findNumberInText(text);
                const idx = updatedBasket.findIndex(b => b.id === item.id);
                if (idx > -1) {
                    updatedBasket[idx].qty = qty;
                } else {
                    updatedBasket.push({ ...item, qty: qty });
                }
            }
            updatedTokens.add(tokenKey);
            changed = true;
        }
    });

    if (changed) {
        saveToDB(updatedBasket);
        self.postMessage({ 
            action: 'UPDATE_BASKET', 
            basket: updatedBasket, 
            tokens: Array.from(updatedTokens),
            correctedText: text 
        });
    }
};