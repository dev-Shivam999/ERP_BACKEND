import { messaging } from './src/config/firebase';

async function verifyFirebase() {
    console.log('--- Firebase Verification ---');
    try {
        // Just accessing messaging triggers initialization
        if (messaging) {
            console.log('✅ Firebase Messaging instance obtained successfully.');
            console.log('Note: To fully verify, you must provide valid credentials in your .env file.');
        } else {
            console.log('❌ Failed to obtain Firebase Messaging instance.');
        }
    } catch (error) {
        console.error('❌ Error during Firebase initialization:', error);
    }
    console.log('-----------------------------');
}

verifyFirebase();
