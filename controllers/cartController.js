const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");

// Add to cart
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.userId;

    // Validate inputs
    if (!productId || !quantity) {
      return res.status(400).json({
        message: "Product ID and quantity are required",
      });
    }

    if (quantity <= 0 || !Number.isInteger(quantity)) {
      return res.status(400).json({
        message: "Quantity must be a positive integer",
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check if product exists and has sufficient quantity
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({
        message: `Only ${product.quantity} items available in stock`,
      });
    }

    // Check if product already in cart
    const existingCartItem = user.cart.find(
      (item) => item.productId.toString() === productId,
    );

    if (existingCartItem) {
      // Update quantity if product already in cart
      const newQuantity = existingCartItem.quantity + quantity;

      if (newQuantity > product.quantity) {
        return res.status(400).json({
          message: `Only ${product.quantity} items available in stock`,
        });
      }

      existingCartItem.quantity = newQuantity;
    } else {
      // Add new item to cart
      user.cart.push({
        productId,
        quantity,
      });
    }

    await user.save();

    // Populate and return cart
    const populatedUser =
      await User.findById(userId).populate("cart.productId");

    res.status(200).json({
      message: "Product added to cart successfully",
      cart: populatedUser.cart,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error adding product to cart",
      error: error.message,
    });
  }
};

// Get cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).populate("cart.productId");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Calculate total price
    const total = user.cart.reduce((sum, item) => {
      return sum + item.productId.price * item.quantity;
    }, 0);

    res.status(200).json({
      message: "Cart fetched successfully",
      cart: user.cart,
      total,
      itemCount: user.cart.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching cart",
      error: error.message,
    });
  }
};

// Remove from cart
exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Remove product from cart
    user.cart = user.cart.filter(
      (item) => item.productId.toString() !== productId,
    );

    await user.save();

    const populatedUser =
      await User.findById(userId).populate("cart.productId");

    res.status(200).json({
      message: "Product removed from cart",
      cart: populatedUser.cart,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error removing product from cart",
      error: error.message,
    });
  }
};

// Update cart quantity
exports.updateCartQuantity = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;
    const userId = req.user.userId;

    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
      return res.status(400).json({
        message: "Quantity must be a positive integer",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    if (quantity > product.quantity) {
      return res.status(400).json({
        message: `Only ${product.quantity} items available in stock`,
      });
    }

    const cartItem = user.cart.find(
      (item) => item.productId.toString() === productId,
    );

    if (!cartItem) {
      return res.status(404).json({
        message: "Product not found in cart",
      });
    }

    cartItem.quantity = quantity;
    await user.save();

    const populatedUser =
      await User.findById(userId).populate("cart.productId");

    res.status(200).json({
      message: "Cart quantity updated",
      cart: populatedUser.cart,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating cart quantity",
      error: error.message,
    });
  }
};

// Clear cart
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.cart = [];
    await user.save();

    res.status(200).json({
      message: "Cart cleared successfully",
      cart: user.cart,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error clearing cart",
      error: error.message,
    });
  }
};

// Checkout - Place order
exports.checkout = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user and their cart
    const user = await User.findById(userId).populate("cart.productId");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.cart.length === 0) {
      return res.status(400).json({
        message: "Cart is empty",
      });
    }

    // Validate stock for all items
    for (const cartItem of user.cart) {
      const product = await Product.findById(cartItem.productId._id);
      if (!product) {
        return res.status(404).json({
          message: `Product ${cartItem.productId.productName} not found`,
        });
      }
      if (product.quantity < cartItem.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.productName}. Only ${product.quantity} available.`,
        });
      }
    }

    // Create order items array
    const orderItems = user.cart.map((cartItem) => ({
      productId: cartItem.productId._id,
      productName: cartItem.productId.productName,
      price: cartItem.productId.price,
      quantity: cartItem.quantity,
      subtotal: cartItem.productId.price * cartItem.quantity,
    }));

    // Calculate totals
    const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = Math.round(subtotal * 0.1 * 100) / 100; // 10% tax
    const total = Math.round((subtotal + tax) * 100) / 100;

    // Get next order number
    const orderCount = await Order.countDocuments();
    const orderId = `ORD-${String(orderCount + 1).padStart(3, "0")}`;

    // Create order
    const order = new Order({
      userId,
      orderId,
      items: orderItems,
      subtotal: Math.round(subtotal * 100) / 100,
      tax,
      total,
      shippingAddress: user.address,
      status: "pending",
      paymentStatus: "pending",
    });

    await order.save();

    // Update product quantities (reduce stock)
    for (const cartItem of user.cart) {
      await Product.findByIdAndUpdate(
        cartItem.productId._id,
        { $inc: { quantity: -cartItem.quantity } },
        { new: true },
      );
    }

    // Clear user's cart
    user.cart = [];
    await user.save();

    res.status(201).json({
      message: "Order placed successfully",
      order: order,
      orderId: order._id,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error placing order",
      error: error.message,
    });
  }
};

// Get all orders for a user
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user.userId;

    const orders = await Order.find({ userId })
      .populate("items.productId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Orders fetched successfully",
      orders,
      count: orders.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching orders",
      error: error.message,
    });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const order = await Order.findById(orderId).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Check if order belongs to the user
    if (order.userId.toString() !== userId) {
      return res.status(403).json({
        message: "Unauthorized to access this order",
      });
    }

    res.status(200).json({
      message: "Order fetched successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching order",
      error: error.message,
    });
  }
};
