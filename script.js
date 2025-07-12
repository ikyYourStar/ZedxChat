// Firebase configuration (REPLACE WITH YOUR ACTUAL CONFIG)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// DOM Elements
const authScreen = document.getElementById('authScreen');
const chatScreen = document.getElementById('chatScreen');
const gachaScreen = document.getElementById('gachaScreen');
const inventoryScreen = document.getElementById('inventoryScreen');
const sellScreen = document.getElementById('sellScreen');
const reportAdminScreen = document.getElementById('reportAdminScreen');

const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const displayNameSpan = document.getElementById('displayName');
const userMoneySpan = document.getElementById('userMoney');
const profilePic = document.getElementById('profilePic');

const chatMessagesDiv = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const imageUploadInput = document.getElementById('imageUpload');
const replyToContainer = document.getElementById('replyToContainer');
const replyToTextSpan = document.getElementById('replyToText');

const gachaButton = document.getElementById('gachaButton');
const gachaResultDiv = document.getElementById('gachaResult');
const gachaCardImage = document.getElementById('gachaCardImage');
const gachaCardName = document.getElementById('gachaCardName');
const gachaCardDescription = document.getElementById('gachaCardDescription');

const inventoryCardsDiv = document.getElementById('userCards');
const sellableCardsDiv = document.getElementById('sellableCards');

const reportMessageIdInput = document.getElementById('reportMessageIdInput');
const reportReasonInput = document.getElementById('reportReasonInput');

const notificationDiv = document.getElementById('notification');

let currentReplyMessage = null; // To store message being replied to
let allCardsData = []; // To store data from ksr.json
const GACHA_COST = 1000; // Cost for one Gacha roll

// ===============================================================
// Utility Functions
// ===============================================================

function showNotification(message, type = 'info') {
    notificationDiv.textContent = message;
    notificationDiv.className = `notification show ${type}`;
    setTimeout(() => {
        notificationDiv.classList.remove('show');
    }, 3000); // Hide after 3 seconds
}

function hideAllScreens() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
}

function setActiveNavItem(screenId) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    // Assuming bottom nav items map to screens in order
    if (screenId === 'chatScreen') document.querySelector('.bottom-nav .nav-item:nth-child(1)').classList.add('active');
    if (screenId === 'inventoryScreen') document.querySelector('.bottom-nav .nav-item:nth-child(2)').classList.add('active');
    if (screenId === 'gachaScreen') document.querySelector('.bottom-nav .nav-item:nth-child(3)').classList.add('active');
    if (screenId === 'sellScreen') document.querySelector('.bottom-nav .nav-item:nth-child(4)').classList.add('active');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// ===============================================================
// Authentication
// ===============================================================

async function login() {
    const email = authEmailInput.value;
    const password = authPasswordInput.value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showNotification('Login berhasil!', 'success');
    } catch (error) {
        showNotification('Login gagal: ' + error.message, 'error');
    }
}

async function register() {
    const email = authEmailInput.value;
    const password = authPasswordInput.value;
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Save user data to Realtime Database
        await database.ref('users/' + user.uid).set({
            displayName: user.email.split('@')[0], // Default display name
            email: user.email,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            isAdmin: false, // Default to not admin
            money: 0, // Initialize money
            textCount: 0, // Initialize text count for future use
            cards: {} // Initialize empty cards object
        });
        showNotification('Registrasi berhasil! Silakan login.', 'success');
    } catch (error) {
        showNotification('Registrasi gagal: ' + error.message, 'error');
    }
}

function logout() {
    auth.signOut();
    showNotification('Anda telah logout.', 'info');
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        hideAllScreens();
        chatScreen.classList.remove('hidden');
        setActiveNavItem('chatScreen'); // Set chat as active by default

        displayNameSpan.textContent = `Welcome, ${user.email.split('@')[0]}`;
        profilePic.src = user.photoURL || 'https://via.placeholder.com/24'; // Use user photo if available

        // Listen for money changes
        database.ref('users/' + user.uid + '/money').on('value', (snapshot) => {
            const money = snapshot.val() || 0;
            userMoneySpan.textContent = `Money: ${money}`;
        });

        // Ensure user data exists in RTDB and initialize if not
        const userRef = database.ref('users/' + user.uid);
        userRef.once('value', (snapshot) => {
            if (!snapshot.exists()) {
                userRef.set({
                    displayName: user.email.split('@')[0],
                    email: user.email,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    isAdmin: false,
                    money: 0,
                    textCount: 0,
                    cards: {}
                }).then(() => {
                    console.log("User data initialized in RTDB.");
                }).catch((error) => {
                    console.error("Error initializing user data:", error);
                });
            }
        });

        loadMessages(); // Load chat messages
        loadKSRData(); // Load card data for gacha
    } else {
        hideAllScreens();
        authScreen.classList.remove('hidden');
        displayNameSpan.textContent = '';
        userMoneySpan.textContent = 'Money: 0';
        profilePic.src = 'https://via.placeholder.com/24';
        chatMessagesDiv.innerHTML = ''; // Clear chat messages
    }
});

// ===============================================================
// Chat Functionality
// ===============================================================

function loadMessages() {
    const messagesRef = database.ref('publicChat/messages').limitToLast(50);
    messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        displayMessage(message, snapshot.key);
    });

    messagesRef.on('child_changed', (snapshot) => {
        const updatedMessage = snapshot.val();
        updateDisplayedMessage(updatedMessage, snapshot.key);
    });
}

async function sendMessage() {
    const user = auth.currentUser;
    if (!user) {
        showNotification('Anda harus login untuk mengirim pesan.', 'error');
        return;
    }

    const messageText = messageInput.value.trim();
    const imageFile = imageUploadInput.files[0];

    if (!messageText && !imageFile) {
        showNotification('Pesan tidak boleh kosong.', 'error');
        return;
    }

    let imageUrl = null;
    if (imageFile) {
        try {
            const storageRef = storage.ref(`images/${user.uid}/${Date.now()}_${imageFile.name}`);
            const snapshot = await storageRef.put(imageFile);
            imageUrl = await snapshot.ref.getDownloadURL();
            showNotification('Gambar berhasil diunggah!', 'success');
        } catch (error) {
            showNotification('Gagal mengunggah gambar: ' + error.message, 'error');
            return;
        }
    }

    const newMessage = {
        sender: user.email.split('@')[0],
        senderUid: user.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        text: messageText
    };

    if (imageUrl) {
        newMessage.imageUrl = imageUrl;
    }

    if (currentReplyMessage) {
        newMessage.replyTo = {
            id: currentReplyMessage.id,
            text: currentReplyMessage.text,
            sender: currentReplyMessage.sender,
            senderUid: currentReplyMessage.senderUid
        };
    }

    try {
        await database.ref('publicChat/messages').push(newMessage);
        messageInput.value = '';
        imageUploadInput.value = ''; // Clear file input
        cancelReply(); // Clear reply state
        showNotification('Pesan terkirim!', 'success');
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Scroll to bottom
    } catch (error) {
        showNotification('Gagal mengirim pesan: ' + error.message, 'error');
    }
}

function displayMessage(message, messageId) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.dataset.messageId = messageId; // Store message ID

    const user = auth.currentUser;
    if (user && message.senderUid === user.uid) {
        messageElement.classList.add('sent');
    } else {
        messageElement.classList.add('received');
    }

    if (message.deleted) {
        messageElement.classList.add('deleted');
        messageElement.innerHTML = '<p>Pesan ini telah dihapus.</p>';
    } else {
        let contentHtml = '';
        if (message.replyTo) {
            contentHtml += `
                <div class="reply-content">
                    Merespon <strong>${message.replyTo.sender}</strong>: ${message.replyTo.text}
                </div>
            `;
        }
        contentHtml += `<div class="message-sender">${message.sender}</div>`;
        if (message.imageUrl) {
            contentHtml += `<img src="${message.imageUrl}" class="message-image" alt="Uploaded Image">`;
        }
        contentHtml += `<p>${message.text}</p>`;
        contentHtml += `<div class="message-time">${formatTimestamp(message.timestamp)}</div>`;
        messageElement.innerHTML = contentHtml;

        // Add context menu for owned messages
        if (user && message.senderUid === user.uid) {
            messageElement.addEventListener('contextmenu', (e) => {
                e.preventDefault(); // Prevent default right-click menu
                showContextMenu(e, messageId, message.text, message.sender, message.senderUid);
            });
            messageElement.addEventListener('click', (e) => {
                // If there's an active context menu, close it
                const existingMenu = document.querySelector('.message-context-menu');
                if (existingMenu) {
                    existingMenu.remove();
                }
            });
        }
         // Add click listener for reply on any message
         messageElement.addEventListener('click', () => {
            if (!message.deleted) { // Can't reply to deleted messages
                setReplyTarget(messageId, message.text, message.sender, message.senderUid);
            }
        });
    }

    chatMessagesDiv.appendChild(messageElement);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Scroll to bottom
}


function updateDisplayedMessage(updatedMessage, messageId) {
    const messageElement = chatMessagesDiv.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        if (updatedMessage.deleted) {
            messageElement.classList.add('deleted');
            messageElement.innerHTML = '<p>Pesan ini telah dihapus.</p>';
        } else {
            // Re-render if necessary, though for now only 'deleted' changes are handled this way
            // For other changes, you might need to re-generate innerHTML based on updatedMessage
        }
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}


// ===============================================================
// Context Menu (Reply, Delete, Report)
// ===============================================================
function showContextMenu(e, messageId, messageText, messageSender, messageSenderUid) {
    // Remove any existing context menus
    const existingMenu = document.querySelector('.message-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const contextMenu = document.createElement('ul');
    contextMenu.classList.add('message-context-menu');
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.style.left = `${e.pageX}px`;

    const user = auth.currentUser;
    if (!user) return; // Should not happen if context menu is only for owned messages

    // Reply Option (can reply to any message)
    const replyItem = document.createElement('li');
    replyItem.textContent = 'Balas';
    replyItem.onclick = () => {
        setReplyTarget(messageId, messageText, messageSender, messageSenderUid);
        contextMenu.remove();
    };
    contextMenu.appendChild(replyItem);

    // Delete Option (only for own messages)
    if (messageSenderUid === user.uid) {
        const deleteItem = document.createElement('li');
        deleteItem.textContent = 'Hapus Pesan';
        deleteItem.onclick = () => {
            deleteMessage(messageId);
            contextMenu.remove();
        };
        contextMenu.appendChild(deleteItem);
    }

    // Report Option (can report any message)
    const reportItem = document.createElement('li');
    reportItem.textContent = 'Laporkan';
    reportItem.onclick = () => {
        reportMessageIdInput.value = messageId;
        showReportAdminScreen();
        contextMenu.remove();
    };
    contextMenu.appendChild(reportItem);


    document.body.appendChild(contextMenu);

    // Close menu if clicked anywhere else
    const closeMenu = () => {
        if (contextMenu.parentNode) {
            contextMenu.remove();
        }
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu); // Also close if another right-click occurs
    };
    setTimeout(() => { // Add listener after a short delay to prevent immediate closing from current click
        document.addEventListener('click', closeMenu);
        document.addEventListener('contextmenu', closeMenu);
    }, 100);
}


function setReplyTarget(id, text, sender, senderUid) {
    currentReplyMessage = { id, text, sender, senderUid };
    replyToTextSpan.textContent = `${sender}: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`;
    replyToContainer.classList.remove('hidden');
    messageInput.focus();
}

function cancelReply() {
    currentReplyMessage = null;
    replyToTextSpan.textContent = '';
    replyToContainer.classList.add('hidden');
}


async function deleteMessage(messageId) {
    const user = auth.currentUser;
    if (!user) {
        showNotification('Anda harus login untuk menghapus pesan.', 'error');
        return;
    }

    const messageRef = database.ref('publicChat/messages/' + messageId);
    try {
        const snapshot = await messageRef.once('value');
        const message = snapshot.val();

        if (message && message.senderUid === user.uid) {
            await messageRef.update({ deleted: true, text: 'Pesan ini telah dihapus.' });
            showNotification('Pesan berhasil dihapus.', 'success');
        } else {
            showNotification('Anda tidak memiliki izin untuk menghapus pesan ini.', 'error');
        }
    } catch (error) {
        showNotification('Gagal menghapus pesan: ' + error.message, 'error');
        console.error("Error deleting message:", error);
    }
}


// ===============================================================
// Report Admin Functionality
// ===============================================================

function showReportAdminScreen() {
    hideAllScreens();
    reportAdminScreen.classList.remove('hidden');
}

async function submitReport() {
    const user = auth.currentUser;
    if (!user) {
        showNotification('Anda harus login untuk melaporkan.', 'error');
        return;
    }

    const reportedMessageId = reportMessageIdInput.value.trim();
    const reportReason = reportReasonInput.value.trim();

    if (!reportedMessageId) {
        showNotification('ID Pesan yang dilaporkan tidak boleh kosong.', 'error');
        return;
    }

    try {
        // Get original message details
        const originalMessageSnapshot = await database.ref('publicChat/messages/' + reportedMessageId).once('value');
        const originalMessage = originalMessageSnapshot.val();

        if (!originalMessage) {
            showNotification('Pesan dengan ID tersebut tidak ditemukan.', 'error');
            return;
        }

        await database.ref('reportChat/messages').push({
            reporterUid: user.uid,
            reporterEmail: user.email,
            reportedMessageId: reportedMessageId,
            originalSender: originalMessage.sender,
            originalSenderUid: originalMessage.senderUid,
            originalSenderEmail: originalMessage.email || 'N/A', // Assuming email might be stored, else N/A
            originalText: originalMessage.text,
            originalImageUrl: originalMessage.imageUrl || null,
            reason: reportReason,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: 'pending' // Initial status
        });
        showNotification('Laporan berhasil dikirim ke admin. Terima kasih!', 'success');
        reportMessageIdInput.value = '';
        reportReasonInput.value = '';
        showChatScreen(); // Return to chat screen
    } catch (error) {
        showNotification('Gagal mengirim laporan: ' + error.message, 'error');
        console.error("Error submitting report:", error);
    }
}


// ===============================================================
// Gacha Functionality
// ===============================================================

// Function to load ksr.json data
async function loadKSRData() {
    try {
        const response = await fetch('ksr.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allCardsData = await response.json();
        console.log('KSR Data loaded:', allCardsData);
    } catch (error) {
        console.error('Error loading KSR data:', error);
        showNotification('Gagal memuat data kartu. Coba lagi nanti.', 'error');
    }
}

gachaButton.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) {
        showNotification('Anda harus login untuk melakukan Gacha.', 'error');
        return;
    }

    const userRef = database.ref('users/' + user.uid);
    let currentMoney = 0;
    try {
        const snapshot = await userRef.child('money').once('value');
        currentMoney = snapshot.val() || 0;
    } catch (error) {
        console.error('Error getting user money:', error);
        showNotification('Gagal mendapatkan informasi uang Anda.', 'error');
        return;
    }

    if (currentMoney < GACHA_COST) {
        showNotification('Uang Anda tidak cukup untuk Gacha. Dibutuhkan ' + GACHA_COST + ' Money.', 'error');
        return;
    }

    try {
        const obtainedCard = getRandomCardByRate(allCardsData);

        if (!obtainedCard) {
            showNotification('Gagal mendapatkan kartu. Coba lagi.', 'error');
            return;
        }

        // Use transaction to atomically update money and add card
        await userRef.transaction((currentData) => {
            if (currentData) {
                // Double check money balance within the transaction
                if ((currentData.money || 0) < GACHA_COST) {
                    showNotification('Uang Anda tidak cukup. Transaksi dibatalkan.', 'error');
                    return;
                }

                currentData.money = (currentData.money || 0) - GACHA_COST;

                if (!currentData.cards) {
                    currentData.cards = {};
                }
                const newCardRef = database.ref('users/' + user.uid + '/cards').push(); // Generate unique key
                currentData.cards[newCardRef.key] = {
                    id: obtainedCard.id, // ID from ksr.json
                    nama: obtainedCard.nama,
                    ibb: obtainedCard.ibb,
                    bint: obtainedCard.bint,
                    rate: obtainedCard.rate,
                    harga: obtainedCard.harga
                };
            }
            return currentData;
        });

        // Display Gacha result
        gachaResultDiv.classList.remove('hidden');
        gachaCardImage.src = obtainedCard.ibb;
        gachaCardImage.style.display = 'block';
        gachaCardName.textContent = obtainedCard.nama;
        gachaCardDescription.textContent = obtainedCard.bint;
        showNotification(`Selamat! Anda mendapatkan kartu: ${obtainedCard.nama}`, 'success');

    } catch (error) {
        console.error('Error during Gacha:', error);
        showNotification('Terjadi kesalahan saat Gacha: ' + error.message, 'error');
    }
});


/**
 * Fungsi untuk mendapatkan kartu acak berdasarkan rate.
 * Semakin kecil rate, semakin jarang kartu didapatkan.
 * @param {Array} cards - Array of card objects from ksr.json
 * @returns {Object|null} - The randomly selected card, or null if no card is selected.
 */
function getRandomCardByRate(cards) {
    if (!cards || cards.length === 0) {
        return null;
    }

    // Hitung total kebalikan rate (semakin kecil rate, semakin besar bobotnya)
    // Ini memberikan prioritas lebih tinggi pada kartu dengan rate kecil (langka)
    let totalInverseRate = 0;
    for (const card of cards) {
        if (card.rate > 0) { // Pastikan rate lebih dari 0 untuk menghindari Infinity
            totalInverseRate += (1 / card.rate);
        }
    }

    if (totalInverseRate === 0) {
        // Fallback: Jika semua rate 0 atau tidak valid, pilih acak biasa
        const randomIndex = Math.floor(Math.random() * cards.length);
        return cards[randomIndex];
    }

    let randomNumber = Math.random() * totalInverseRate;

    for (const card of cards) {
        if (card.rate > 0) {
            randomNumber -= (1 / card.rate);
            if (randomNumber <= 0) {
                return card;
            }
        }
    }

    // Should theoretically not be reached if rates are valid and sum > 0
    // Fallback to a random card just in case of floating point issues
    return cards[Math.floor(Math.random() * cards.length)];
}


// ===============================================================
// Inventory Functionality
// ===============================================================

async function loadUserCards() {
    const user = auth.currentUser;
    if (!user) {
        inventoryCardsDiv.innerHTML = '<p>Anda harus login untuk melihat inventory.</p>';
        return;
    }

    const userCardsRef = database.ref('users/' + user.uid + '/cards');
    try {
        const snapshot = await userCardsRef.once('value');
        const cards = snapshot.val();
        inventoryCardsDiv.innerHTML = ''; // Clear previous display

        if (cards) {
            Object.keys(cards).forEach(cardKey => {
                const card = cards[cardKey];
                const cardElement = document.createElement('div');
                cardElement.classList.add('card-item');
                cardElement.innerHTML = `
                    <img src="${card.ibb}" alt="${card.nama}">
                    <h4>${card.nama}</h4>
                    <p>${card.bint}</p>
                    <p>Rate: ${card.rate}</p>
                    <p>Harga Jual: ${card.harga} Money</p>
                `;
                inventoryCardsDiv.appendChild(cardElement);
            });
        } else {
            inventoryCardsDiv.innerHTML = '<p>Anda belum memiliki kartu.</p>';
        }
    } catch (error) {
        console.error('Error loading user cards:', error);
        showNotification('Gagal memuat kartu Anda.', 'error');
    }
}


// ===============================================================
// Sell Functionality
// ===============================================================

async function loadSellableCards() {
    const user = auth.currentUser;
    if (!user) {
        sellableCardsDiv.innerHTML = '<p>Anda harus login untuk menjual kartu.</p>';
        return;
    }

    const userCardsRef = database.ref('users/' + user.uid + '/cards');
    try {
        const snapshot = await userCardsRef.once('value');
        const cards = snapshot.val();
        sellableCardsDiv.innerHTML = ''; // Clear previous display

        if (cards) {
            Object.keys(cards).forEach(cardKey => {
                const card = cards[cardKey];
                const cardElement = document.createElement('div');
                cardElement.classList.add('card-item');
                cardElement.innerHTML = `
                    <img src="${card.ibb}" alt="${card.nama}">
                    <h4>${card.nama}</h4>
                    <p>${card.bint}</p>
                    <p>Harga Jual: ${card.harga} Money</p>
                    <button class="sell-button" data-card-key="${cardKey}" data-card-price="${card.harga}">Jual</button>
                `;
                sellableCardsDiv.appendChild(cardElement);
            });

            document.querySelectorAll('.sell-button').forEach(button => {
                button.addEventListener('click', sellCard);
            });

        } else {
            sellableCardsDiv.innerHTML = '<p>Anda belum memiliki kartu untuk dijual.</p>';
        }
    } catch (error) {
        console.error('Error loading sellable cards:', error);
        showNotification('Gagal memuat kartu yang bisa dijual.', 'error');
    }
}


async function sellCard(event) {
    const user = auth.currentUser;
    if (!user) {
        showNotification('Anda harus login untuk menjual kartu.', 'error');
        return;
    }

    const cardKeyToSell = event.target.dataset.cardKey;
    const cardPrice = parseInt(event.target.dataset.cardPrice);

    if (!cardKeyToSell || isNaN(cardPrice)) {
        showNotification('Data kartu tidak valid.', 'error');
        return;
    }

    const userRef = database.ref('users/' + user.uid);

    try {
        await userRef.transaction((currentData) => {
            if (currentData) {
                if (!currentData.cards || !currentData.cards[cardKeyToSell]) {
                    showNotification('Kartu tidak ditemukan di inventory Anda. Transaksi dibatalkan.', 'error');
                    return; // Abort transaction
                }

                delete currentData.cards[cardKeyToSell]; // Remove card
                currentData.money = (currentData.money || 0) + cardPrice; // Add money
            }
            return currentData;
        });

        showNotification(`Berhasil menjual kartu seharga ${cardPrice} Money!`, 'success');
        loadSellableCards(); // Refresh sellable cards list
        loadUserCards(); // Refresh inventory list
    } catch (error) {
        console.error('Error selling card:', error);
        showNotification('Terjadi kesalahan saat menjual kartu: ' + error.message, 'error');
    }
}


// ===============================================================
// Screen Navigation Functions
// ===============================================================

function showChatScreen() {
    hideAllScreens();
    chatScreen.classList.remove('hidden');
    setActiveNavItem('chatScreen');
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Scroll to bottom on load
}

function showGachaScreen() {
    hideAllScreens();
    gachaScreen.classList.remove('hidden');
    setActiveNavItem('gachaScreen');
    gachaResultDiv.classList.add('hidden'); // Hide previous result
    gachaCardImage.style.display = 'none';
}

function showInventoryScreen() {
    hideAllScreens();
    inventoryScreen.classList.remove('hidden');
    setActiveNavItem('inventoryScreen');
    loadUserCards(); // Load cards when showing inventory
}

function showSellScreen() {
    hideAllScreens();
    sellScreen.classList.remove('hidden');
    setActiveNavItem('sellScreen');
    loadSellableCards(); // Load cards when showing sell screen
}

function reportAdmin() {
    showReportAdminScreen();
}

// Initial load
// auth.onAuthStateChanged will handle the initial screen display.
// Call loadKSRData() early so card data is available.
loadKSRData();
