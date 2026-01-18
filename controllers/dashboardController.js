const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Get dashboard stats based on user role
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    let stats = {};

    // If user is a regular user
    if (user.role === 'user') {
      // Get current cart count
      const cartCount = user.cart.length;

      // Get total orders count for this user
      const totalOrders = await Order.countDocuments({ userId });

      // Get count of products added by this user (seller)
      const addedProductsCount = await Product.countDocuments({ seller: userId });

      stats = {
        role: 'user',
        cartProducts: cartCount,
        totalOrders: totalOrders,
        addedProducts: addedProductsCount,
      };
    } 
    // If user is an admin
    else if (user.role === 'admin') {
      // Get total products count
      const totalProducts = await Product.countDocuments();

      // Get total orders count
      const totalOrders = await Order.countDocuments();

      // Get total users count
      const totalUsers = await User.countDocuments({ role: 'user' });

      // Calculate total revenue from all orders
      const revenueData = await Order.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
          },
        },
      ]);

      const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

      stats = {
        role: 'admin',
        totalProducts,
        totalOrders,
        totalUsers,
        totalRevenue,
      };
    }

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message,
    });
  }
};

// Get recent orders (admin only) - 10 most recent
exports.getRecentOrders = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const orders = await Order.find()
      .populate('userId', 'name email contactNumber')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recent orders',
      error: error.message,
    });
  }
};

// Get all users (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

  const users = await User.find({ role: 'user' }).select('-password');

    // Get product count for each user
    const usersWithProductCount = await Promise.all(
      users.map(async (user) => {
        const productCount = await Product.countDocuments({ seller: user._id });
        return {
          ...user.toObject(),
          addedProductsCount: productCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: usersWithProductCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

// Update user status (admin only)
exports.updateUserStatus = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const admin = await User.findById(adminId);

    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { userId, status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active or inactive.',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    ).select('name email contactNumber profilePhoto status');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating user status',
      error: error.message,
    });
  }
};
