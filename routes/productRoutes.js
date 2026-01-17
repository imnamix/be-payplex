const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

// Public routes
router.get('/all', productController.getAllProducts);
router.get('/category/:category', productController.getProductsByCategory);
router.get('/:productId', productController.getProductById);

// Protected routes (require authentication)
router.post('/upload-images', authenticate, upload.array('images', 5), productController.uploadProductImages);
router.post('/create', authenticate, productController.createProduct);
router.get('/my-products', authenticate, productController.getUserProducts);
router.put('/:productId', authenticate, productController.updateProduct);
router.delete('/:productId', authenticate, productController.deleteProduct);

module.exports = router;
