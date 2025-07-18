// shared.js

// Firebase configuration (REPLACE WITH YOUR ACTUAL CONFIG)
const firebaseConfig = {
    apiKey: "AIzaSyCTjBsKdHmmTELY3wnfGYANEzzDBEF2BIo", // Your Firebase API Key
    authDomain: "realtime-df5d0.firebaseapp.com",
    databaseURL: "https://realtime-df5d0-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "realtime-df5d0",
    storageBucket: "realtime-df5d0.appspot.com",
    messagingSenderId: "1065067984786",
    appId: "1:1065067984786:web:b315a080932587ec53f34b"
};

// Initialize Firebase App if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// --- Utility Functions ---

function showNotification(message, type = 'info', duration = 3000) {
    let notificationDiv = document.getElementById('notification');
    if (!notificationDiv) {
        notificationDiv = document.createElement('div');
        notificationDiv.id = 'notification';
        notificationDiv.classList.add('notification');
        document.body.appendChild(notificationDiv);
    }

    notificationDiv.textContent = message;
    notificationDiv.className = `notification show ${type}`;
    setTimeout(() => {
        notificationDiv.classList.remove('show');
    }, duration);
}

function updateUserInfoDisplay() {
    const user = auth.currentUser;
    const displayNameSpan = document.getElementById('displayName');
    const profilePic = document.getElementById('profilePic');
    const userMoneySpan = document.getElementById('userMoney'); // Pastikan ini ada di halaman yang relevan

    if (user) {
        if (displayNameSpan) displayNameSpan.textContent = `Welcome, ${user.email.split('@')[0]}`;
        // if (profilePic) profilePic.src = user.photoURL || 'https://via.placeholder.com/24'; // Jika ada profilePic
        
        // Listen for money changes and update display
        if (userMoneySpan) {
            database.ref('users/' + user.uid + '/money').on('value', (snapshot) => {
                const money = snapshot.val() || 0;
                userMoneySpan.textContent = `Money: ${money}`;
            });
        }
    } else {
        if (displayNameSpan) displayNameSpan.textContent = '';
        // if (profilePic) profilePic.src = 'https://via.placeholder.com/24';
        if (userMoneySpan) userMoneySpan.textContent = 'Money: 0';
    }
}

function logout() {
    auth.signOut().then(() => {
        showNotification('Anda telah logout.', 'info');
        // Redirect to login page, assuming index.html handles login display
        window.location.href = 'index.html'; 
    }).catch(error => {
        console.error("Logout error:", error);
        showNotification('Gagal logout: ' + error.message, 'error');
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Ensure user data exists in RTDB and initialize if not (important for new users)
auth.onAuthStateChanged((user) => {
    if (user) {
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
                    cards: {} // Initialize cards for future gacha use
                }).then(() => {
                    console.log("User data initialized in RTDB.");
                }).catch((error) => {
                    console.error("Error initializing user data:", error);
                });
            }
        });
        updateUserInfoDisplay();
    }
});
