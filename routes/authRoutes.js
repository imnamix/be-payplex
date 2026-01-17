const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

// Public routes
router.post('/upload-image', upload.single('image'), authController.uploadImage);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.put('/update-profile', authenticate, upload.single('profilePhoto'), authController.updateProfile);

module.exports = router;
