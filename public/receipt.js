document.addEventListener("DOMContentLoaded", () => {

const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const scanBtn = document.getElementById("scanBtn");
const saveBtn = document.getElementById("saveBtn");

const amountEl = document.getElementById("amount");
const dateEl = document.getElementById("date");
const categoryEl = document.getElementById("category");

const receiptList = document.getElementById("receiptList");

let detectedAmount = null;
let detectedCategory = "General";

loadReceipts();

fileInput.addEventListener("change", previewImage);
scanBtn.addEventListener("click", scanReceipt);
saveBtn.addEventListener("click", saveReceipt);


/* ---------- Preview Image ---------- */

function previewImage() {

const file = fileInput.files[0];

if(!file) return;

const reader = new FileReader();

reader.onload = function(e){

preview.src = e.target.result;
preview.style.display = "block";

};

reader.readAsDataURL(file);

}


/* ---------- Scan Receipt ---------- */

async function scanReceipt(){

const file = fileInput.files[0];

if(!file){
showPopup("📷 Upload receipt first");
return;
}

scanBtn.innerText = "Scanning...";

const result = await Tesseract.recognize(file,"eng");

const text = result.data.text;
detectedOCR = text;
document.getElementById("ocrText").innerText = text;
console.log("OCR TEXT:", text);

/* SHOW OCR TEXT IN FRONTEND */

document.getElementById("ocrText").innerText = text;

/* DETECT DATA */

detectAmount(text);
detectCategory(text);

amountEl.innerText = detectedAmount ? "₹"+detectedAmount : "Not detected";
dateEl.innerText = new Date().toLocaleDateString();
categoryEl.innerText = detectedCategory;

scanBtn.innerText = "Scan Receipt";

}

/* ---------- Detect Amount ---------- */

function detectAmount(text){

const matches = text.match(/(₹\s?\d+[.,]?\d*)|(\d+\.\d{2})/g);

if(!matches){

detectedAmount = null;
return;

}

let values = matches.map(v =>
parseFloat(v.replace(/[₹,]/g,""))
);

detectedAmount = Math.max(...values);

}


/* ---------- Detect Category ---------- */

function detectCategory(text){

text = text.toLowerCase();

if(text.includes("restaurant") || text.includes("cafe") || text.includes("food"))
detectedCategory = "Food";

else if(text.includes("fuel") || text.includes("petrol"))
detectedCategory = "Transport";

else if(text.includes("medical") || text.includes("pharmacy"))
detectedCategory = "Healthcare";

else if(text.includes("mart") || text.includes("store") || text.includes("supermarket"))
detectedCategory = "Shopping";

else
detectedCategory = "General";

}


/* ---------- Save Receipt ---------- */

function saveReceipt(){

const receipts = JSON.parse(localStorage.getItem("receipts")) || [];

const receipt = {

id: Date.now(),

amount: detectedAmount ? detectedAmount : "Not detected",

category: detectedCategory ? detectedCategory : "Unknown",

date: new Date().toLocaleDateString(),

image: preview.src ? preview.src : "",

ocr: detectedOCR ? detectedOCR : "No OCR data available"

};

receipts.push(receipt);

localStorage.setItem("receipts", JSON.stringify(receipts));

loadReceipts();

showPopup("✅ Receipt Saved Successfully");

}


/* ---------- Load Receipts ---------- */

function loadReceipts(){

const receipts = JSON.parse(localStorage.getItem("receipts")) || [];

receiptList.innerHTML = "";

if(receipts.length === 0){

receiptList.innerHTML = "<p>No saved expenses</p>";
return;

}

receipts.reverse().forEach(r => {

const card = document.createElement("div");

card.className = "receipt-card";

card.innerHTML = `

<img src="${r.image}" class="receipt-img">

<div class="receipt-info">

<h3>💰 ${r.amount === "Not detected" ? "Amount not detected" : "₹" + r.amount}</h3>

<p>🏷 ${r.category}</p>

<p>📅 ${r.date}</p>

<details>
<summary>View OCR Data</summary>
<pre>${r.ocr}</pre>
</details>

<button onclick="deleteReceipt(${r.id})" class="delete-btn">
Delete
</button>

</div>

`;
receiptList.appendChild(card);

});

}


/* ---------- Delete Receipt ---------- */

window.deleteReceipt = function(id){

let receipts = JSON.parse(localStorage.getItem("receipts")) || [];

receipts = receipts.filter(r => r.id !== id);

localStorage.setItem("receipts",JSON.stringify(receipts));

loadReceipts();

};


/* ---------- Dark Light Toggle ---------- */

const toggle = document.getElementById("themeToggle");

toggle.addEventListener("click",()=>{

document.body.classList.toggle("dark");

});

});function showPopup(message){

const popup = document.getElementById("popup");
const msg = document.getElementById("popupMsg");

msg.innerText = message;

popup.classList.add("show");

setTimeout(()=>{

popup.classList.remove("show");

},3000);

}const scrollBtn = document.getElementById("scrollTopBtn");

window.onscroll = function () {
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
        scrollBtn.style.display = "block";
    } else {
        scrollBtn.style.display = "none";
    }
};

scrollBtn.addEventListener("click", function () {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});