/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true }); // Mengizinkan semua origin untuk sementara (bisa dikonfigurasi lebih ketat)

admin.initializeApp();
const db = admin.database();

// Helper untuk mendapatkan UID berdasarkan username
async function getUidByUsername(username) {
    const usersRef = db.ref('users');
    const snapshot = await usersRef.orderByChild('username').equalTo(username).limitToFirst(1).once('value');
    if (snapshot.exists()) {
        const userUid = Object.keys(snapshot.val())[0];
        return userUid;
    }
    return null;
}

// Helper untuk mendapatkan username berdasarkan UID
async function getUsernameByUid(uid) {
    const userRef = db.ref(`users/${uid}/username`);
    const snapshot = await userRef.once('value');
    if (snapshot.exists()) {
        return snapshot.val();
    }
    return null;
}

// Fungsi untuk mengirim permintaan pertemanan
exports.sendFriendRequest = functions.region('asia-southeast1').https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(403).json({ message: 'Unauthorized: No token provided.' });
        }
        const idToken = authHeader.split('Bearer ')[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const senderUid = decodedToken.uid;
            const senderUsername = await getUsernameByUid(senderUid);

            if (!senderUsername) {
                return res.status(404).json({ message: 'Sender user profile not found.' });
            }

            const { targetUsername } = req.body;

            if (!targetUsername) {
                return res.status(400).json({ message: 'Target username is required.' });
            }
            if (targetUsername === senderUsername) {
                return res.status(400).json({ message: 'Tidak bisa menambahkan diri sendiri.' });
            }

            const targetUid = await getUidByUsername(targetUsername);

            if (!targetUid) {
                return res.status(404).json({ message: 'Username teman tidak ditemukan.' });
            }

            // Periksa jika sudah berteman
            const friendsSnapshot = await db.ref(`users/${senderUid}/friends/${targetUid}`).once('value');
            if (friendsSnapshot.exists()) {
                return res.status(400).json({ message: `${targetUsername} sudah ada di daftar teman Anda.` });
            }

            // Periksa jika permintaan sudah terkirim atau diterima
            const sentRequestSnapshot = await db.ref(`users/${senderUid}/friend_requests_sent/${targetUid}`).once('value');
            if (sentRequestSnapshot.exists()) {
                return res.status(400).json({ message: `Permintaan sudah terkirim ke ${targetUsername}.` });
            }
            const receivedRequestSnapshot = await db.ref(`users/${senderUid}/friend_requests_received/${targetUid}`).once('value');
            if (receivedRequestSnapshot.exists()) {
                return res.status(400).json({ message: `Anda sudah menerima permintaan dari ${targetUsername}. Silakan terima.` });
            }


            // Kirim permintaan pertemanan ke target
            await db.ref(`users/${targetUid}/friend_requests_received/${senderUid}`).set({
                username: senderUsername,
                uid: senderUid,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            // Catat bahwa pengirim telah mengirim permintaan
            await db.ref(`users/${senderUid}/friend_requests_sent/${targetUid}`).set({
                username: targetUsername,
                uid: targetUid,
                timestamp: admin.database.ServerValue.TIMESTAMP
            });

            return res.status(200).json({ message: `Permintaan pertemanan terkirim ke ${targetUsername}.` });

        } catch (error) {
            console.error("Error in sendFriendRequest:", error);
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.', error: error.message });
            }
            return res.status(500).json({ message: 'Internal server error.', error: error.message });
        }
    });
});

// Fungsi untuk menerima permintaan pertemanan
exports.acceptFriendRequest = functions.region('asia-southeast1').https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(403).json({ message: 'Unauthorized: No token provided.' });
        }
        const idToken = authHeader.split('Bearer ')[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const acceptorUid = decodedToken.uid; // Yang menerima permintaan
            const acceptorUsername = await getUsernameByUid(acceptorUid);

            if (!acceptorUsername) {
                return res.status(404).json({ message: 'Acceptor user profile not found.' });
            }

            const { senderUid } = req.body; // UID pengirim permintaan
            if (!senderUid) {
                return res.status(400).json({ message: 'Sender UID is required.' });
            }

            const senderUsername = await getUsernameByUid(senderUid);
            if (!senderUsername) {
                return res.status(404).json({ message: 'Sender user profile not found.' });
            }

            // Pastikan ada permintaan yang diterima dari sender ini
            const requestReceivedSnapshot = await db.ref(`users/${acceptorUid}/friend_requests_received/${senderUid}`).once('value');
            if (!requestReceivedSnapshot.exists()) {
                return res.status(404).json({ message: 'Permintaan pertemanan tidak ditemukan.' });
            }

            // Menggunakan Multi-path Update untuk operasi atomik
            const updates = {};
            // Tambahkan ke daftar teman penerima
            updates[`/users/${acceptorUid}/friends/${senderUid}`] = { username: senderUsername, uid: senderUid };
            // Tambahkan ke daftar teman pengirim
            updates[`/users/${senderUid}/friends/${acceptorUid}`] = { username: acceptorUsername, uid: acceptorUid };
            // Hapus permintaan dari penerima
            updates[`/users/${acceptorUid}/friend_requests_received/${senderUid}`] = null;
            // Hapus permintaan dari pengirim
            updates[`/users/${senderUid}/friend_requests_sent/${acceptorUid}`] = null;

            await db.ref().update(updates);

            return res.status(200).json({ message: `Anda sekarang berteman dengan ${senderUsername}!` });

        } catch (error) {
            console.error("Error in acceptFriendRequest:", error);
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.', error: error.message });
            }
            return res.status(500).json({ message: 'Internal server error.', error: error.message });
        }
    });
});

// Fungsi untuk menolak permintaan pertemanan
exports.declineFriendRequest = functions.region('asia-southeast1').https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(403).json({ message: 'Unauthorized: No token provided.' });
        }
        const idToken = authHeader.split('Bearer ')[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const acceptorUid = decodedToken.uid; // Yang menolak permintaan

            const { senderUid } = req.body; // UID pengirim permintaan
            if (!senderUid) {
                return res.status(400).json({ message: 'Sender UID is required.' });
            }

            // Menggunakan Multi-path Update untuk operasi atomik
            const updates = {};
            // Hapus permintaan dari penerima
            updates[`/users/${acceptorUid}/friend_requests_received/${senderUid}`] = null;
            // Hapus permintaan dari pengirim
            updates[`/users/${senderUid}/friend_requests_sent/${acceptorUid}`] = null;

            await db.ref().update(updates);

            return res.status(200).json({ message: 'Permintaan pertemanan ditolak.' });

        } catch (error) {
            console.error("Error in declineFriendRequest:", error);
            if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
                return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.', error: error.message });
            }
            return res.status(500).json({ message: 'Internal server error.', error: error.message });
        }
    });
});

// Contoh fungsi untuk membantu set admin (opsional, bisa juga manual di konsol)
// exports.makeAdmin = functions.region('asia-southeast1').https.onCall(async (data, context) => {
//     // Hanya user tertentu atau admin yang boleh memanggil ini
//     if (!context.auth || context.auth.uid !== 'YOUR_ADMIN_UID_HERE') {
//         throw new functions.https.HttpsError('permission-denied', 'Only specific users can set admin roles.');
//     }
//     const targetUid = data.uid;
//     if (!targetUid) {
//         throw new functions.https.HttpsError('invalid-argument', 'UID is required.');
//     }
//     await admin.auth().setCustomUserClaims(targetUid, { isAdmin: true });
//     return { message: `User ${targetUid} is now an admin.` };
// });
