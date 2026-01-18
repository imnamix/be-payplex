const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middlewares/auth');

// Protected routes (require authentication)
router.get('/stats', authenticate, dashboardController.getDashboardStats);
router.get('/recent-orders', authenticate, dashboardController.getRecentOrders);
router.get('/all-users', authenticate, dashboardController.getAllUsers);
router.put('/update-user-status', authenticate, dashboardController.updateUserStatus);

module.exports = router;
