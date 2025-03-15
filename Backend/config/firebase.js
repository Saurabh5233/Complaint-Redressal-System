// config/firebase.js
const admin = require('firebase-admin');

const initializeFirebase = () => {
  try {
    // Try to use service account JSON file if available
    let serviceAccount;
    try {
      serviceAccount = require('../firebase-service-account.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase initialized with service account file');
    } catch (error) {
      // If file is not found, use environment variables
      admin.initializeApp({
        credential: admin.credential.cert({
          "type": process.env.FIREBASE_TYPE || "service_account",
          "project_id": process.env.FIREBASE_PROJECT_ID,
          "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
          "private_key": process.env.FIREBASE_PRIVATE_KEY ? 
                         process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
          "client_email": process.env.FIREBASE_CLIENT_EMAIL,
          "client_id": process.env.FIREBASE_CLIENT_ID,
          "auth_uri": process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
          "token_uri": process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
          "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || 
                                         "https://www.googleapis.com/oauth2/v1/certs",
          "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL
        })
      });
      console.log('Firebase initialized with environment variables');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    
    // Create a mock implementation for development/testing
    if (process.env.NODE_ENV === 'development') {
      console.log('Using mock Firebase implementation for development');
      admin.auth = () => ({
        getUser: async () => ({}),
        createUser: async () => ({}),
        sendVerificationCode: async () => console.log('MOCK: SMS code sent')
      });
    }
  }
};

initializeFirebase();

module.exports = admin;