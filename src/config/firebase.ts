import * as admin from 'firebase-admin';
import { config } from './env';

if (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: config.firebase.projectId,
            clientEmail: config.firebase.clientEmail,
            privateKey: config.firebase.privateKey,
        }),
    });
    console.log('🔥 Firebase Admin initialized');
} else {
    console.warn('⚠️ Firebase configuration missing. Push notifications will not work.');
}

export const messaging = admin.messaging();
