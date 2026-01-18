const Product = require("../models/Product");
const cloudinary = require("../config/cloudinary");

// Upload product image(s)
exports.uploadProductImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No image files provided" });
    }

    const uploadedImages = [];

    try {
      // Upload each image to Cloudinary
      for (const file of req.files) {
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: "payplex/products",
              resource_type: "auto",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(file.buffer);
        });

        uploadedImages.push({
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
        });
      }

      res.status(200).json({
        message: "Images uploaded successfully",
        images: uploadedImages,
      });
    } catch (uploadError) {
      return res.status(500).json({
        message: "Image upload to Cloudinary failed",
        error: uploadError.message,
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Upload failed", error: error.message });
  }
};

// Create product
exports.createProduct = async (req, res) => {
  try {
    const { productName, description, price, quantity, category, images } =
      req.body;
    const userId = req.user.userId;

    // Validation
    if (!productName || !description || !price || !quantity || !category) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    if (!images || images.length === 0) {
      return res.status(400).json({
        message: "At least one image is required",
      });
    }

    // Validate images array structure
    const isValidImages = images.every(
      (img) => img.url && typeof img.url === "string"
    );
    if (!isValidImages) {
      return res.status(400).json({
        message: "Invalid image data format",
      });
    }

    // Parse price and quantity as numbers
    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantity, 10);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        message: "Price must be a valid positive number",
      });
    }

    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      return res.status(400).json({
        message: "Quantity must be a valid positive number",
      });
    }

    // Create product
    const product = new Product({
      productName: productName.trim(),
      description: description.trim(),
      price: parsedPrice,
      quantity: parsedQuantity,
      category,
      images,
      seller: userId,
      status: "active",
    });

    await product.save();

    // Populate seller details before responding
    await product.populate("seller", "name email contactNumber");

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Product creation error:", error);
    res.status(500).json({
      message: "Failed to create product",
      error: error.message,
    });
  }
};

// Get all products with pagination and filtering
exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter object
    const filter = { status: "active" };

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Get total count for pagination
    const total = await Product.countDocuments(filter);

    // Fetch products with pagination
    const products = await Product.find(filter)
      .populate("seller", "name email contactNumber profilePhoto")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      message: "Products retrieved successfully",
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch products error:", error);
    res.status(500).json({
      message: "Failed to fetch products",
      error: error.message,
    });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId).populate(
      "seller",
      "name email contactNumber profilePhoto address"
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({
      message: "Product retrieved successfully",
      product,
    });
  } catch (error) {
    console.error("Fetch product error:", error);
    res.status(500).json({
      message: "Failed to fetch product",
      error: error.message,
    });
  }
};

// Get user's products
exports.getUserProducts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = { seller: userId };

    if (status) {
      filter.status = status;
    }

    // Get total count
    const total = await Product.countDocuments(filter);

    // Fetch products
    const products = await Product.find(filter)
      .populate("seller", "name email contactNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      message: "User products retrieved successfully",
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch user products error:", error);
    res.status(500).json({
      message: "Failed to fetch user products",
      error: error.message,
    });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { productName, description, price, quantity, category, status, images } =
      req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;
    // Find product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if user is the seller
    if (product.seller.toString() !== userId && userRole !== "admin") {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this product" });
    }

    // Update fields
    if (productName) product.productName = productName.trim();
    if (description) product.description = description.trim();
    if (price) product.price = parseFloat(price);
    if (quantity) product.quantity = parseInt(quantity, 10);
    if (category) product.category = category;
    if (status) product.status = status;

    // Update images if provided
    if (images && images.length > 0) {
      // Delete old images from Cloudinary
      for (const oldImage of product.images) {
        try {
          await cloudinary.uploader.destroy(oldImage.public_id);
        } catch (deleteError) {
          console.error("Error deleting old image:", deleteError);
        }
      }
      product.images = images;
    }

    await product.save();

    // Populate seller details
    await product.populate("seller", "name email contactNumber");

    res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Product update error:", error);
    res.status(500).json({
      message: "Failed to update product",
      error: error.message,
    });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Find product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if user is the seller
    if (product.seller.toString() !== userId && userRole !== "admin") {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this product" });
    }

    // Delete images from Cloudinary
    for (const image of product.images) {
      try {
        await cloudinary.uploader.destroy(image.public_id);
      } catch (deleteError) {
        console.error("Error deleting image:", deleteError);
      }
    }

    // Delete product
    await Product.findByIdAndDelete(productId);

    res.status(200).json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Product deletion error:", error);
    res.status(500).json({
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

// Search products by category
exports.getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const total = await Product.countDocuments({
      category,
      status: "active",
    });

    const products = await Product.find({ category, status: "active" })
      .populate("seller", "name email contactNumber profilePhoto")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      message: `Products in ${category} retrieved successfully`,
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch products by category error:", error);
    res.status(500).json({
      message: "Failed to fetch products",
      error: error.message,
    });
  }
};
