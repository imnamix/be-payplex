const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticate } = require('../middlewares/auth');

// Protected routes (require authentication)
router.post('/add', authenticate, cartController.addToCart);
router.get('/', authenticate, cartController.getCart);
router.delete('/remove/:productId', authenticate, cartController.removeFromCart);
router.put('/update/:productId', authenticate, cartController.updateCartQuantity);
router.delete('/clear', authenticate, cartController.clearCart);
router.post('/checkout', authenticate, cartController.checkout);
router.get('/orders', authenticate, cartController.getOrders);
router.get('/orders/:orderId', authenticate, cartController.getOrderById);

module.exports = router;
